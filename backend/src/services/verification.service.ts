import { Request } from 'express';
import { prisma } from '../config/prisma';
import { createAuditLog } from '../utils/audit';
import { isAdminRole } from '../utils/roles';
import { signedUrlForMedia } from './media.service';
import { notificationService } from './notification.service';
import { emitToAdmins, emitToUser } from './socket.service';
import { logger } from '../utils/logger';

// ─── Worker Identity Verification ──────────────────────────────
// Single authority for verification state. Server-authoritative:
// documents + selfie + explicit consent → submission → PENDING_REVIEW →
// authorized admin review → VERIFIED. Uploaded documents alone NEVER mean verified.

// Safe, non-combative rejection reasons. Avoid internal fraud details.
export const REJECTION_REASONS = [
  'DOCUMENT_UNREADABLE',
  'DOCUMENT_INCOMPLETE',
  'WRONG_DOCUMENT_TYPE',
  'SELFIE_UNCLEAR',
  'INFO_COULD_NOT_BE_REVIEWED',
  'DOCUMENT_APPEARS_INVALID',
  'OTHER',
] as const;

// Configurable proof types (MarketConfig `VERIFICATION_PROOF_TYPES` overrides).
const DEFAULT_PROOF_TYPES: Record<string, { label: string; sides: string[] }> = {
  AADHAAR: { label: 'Aadhaar Card', sides: ['FRONT'] },
  DRIVING_LICENCE: { label: 'Driving Licence', sides: ['FRONT', 'BACK'] },
  VOTER_ID: { label: 'Voter ID', sides: ['FRONT'] },
  OTHER_GOVT_ID: { label: 'Other Government ID', sides: ['FRONT', 'BACK'] },
};

async function getConfig(key: string, fallback = ''): Promise<string> {
  try {
    const cfg = await prisma.marketConfig.findUnique({ where: { key } });
    return cfg?.value || fallback;
  } catch { return fallback; }
}

async function getProofTypes(): Promise<Record<string, { label: string; sides: string[] }>> {
  const stored = await getConfig('VERIFICATION_PROOF_TYPES', '');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  return DEFAULT_PROOF_TYPES;
}

async function audit(userId: string, action: string, resource: string, resourceId: string, newValue: any, req?: Request) {
  await createAuditLog(prisma, req, { userId, action, resource, resourceId, newValue })
    .catch(err => logger.warn('Failed to create audit log', { userId, action, resource, error: err?.message }));
}

async function notifyAdmins(title: string, body: string, data: any) {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  for (const a of admins) {
    await notificationService.sendPushNotification(a.id, title, body, 'verification', data)
      .catch(err => logger.warn('Failed to send verification notification', { adminId: a.id, error: err?.message }));
  }
  emitToAdmins('admin_refresh', { type: 'verification' });
}

/**
 * Central eligibility helper — sets profile verification state + urgent eligibility
 * consistently. isUrgentEligible is TRUE only when VERIFIED.
 */
export async function applyProfileState(workerId: string, profileStatus: string): Promise<void> {
  const isVerified = profileStatus === 'VERIFIED';
  await prisma.workerProfile.update({
    where: { userId: workerId },
    data: {
      verificationStatus: profileStatus as any,
      isUrgentEligible: isVerified, // urgent eligibility ONLY when verified
      urgentEligibilityReason: isVerified ? 'Identity verified by admin' : 'Not identity verified',
      verifiedAt: isVerified ? new Date() : null,
    },
  });
}

export const verificationService = {
 /** Supported proof types + consent/policy versions for the worker flow. */
  async getConfigPublic(): Promise<{ proofTypes: any; consentVersion: string; policyVersion: string; privacyPolicyUrl: string }> {
    const proofTypes = await getProofTypes();
    return {
      proofTypes,
      consentVersion: await getConfig('VERIFICATION_CONSENT_VERSION', '1.0'),
      policyVersion: await getConfig('VERIFICATION_POLICY_VERSION', '1.0'),
      privacyPolicyUrl: '/terms',
    };
  },

 /**
 * Start the verification flow for a proof type. Returns the current IN_PROGRESS
 * draft, or creates the next-version draft for a resubmission with the
 * previously-OK document sides pre-attached.
 */
  async start(workerId: string, proofType: string, req?: Request) {
    const profile = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
    if (!profile) throw new Error('Worker profile not found');
    if (profile.isBanned || profile.isPermanentlyBanned) throw new Error('Account is not eligible for verification');
    if (profile.isFrozen) throw new Error('Account is frozen due to unpaid penalties');

    const proofTypes = await getProofTypes();
    if (!proofTypes[proofType]) throw new Error('Unsupported ID type');

    const latest = await prisma.workerVerificationSubmission.findFirst({
      where: { workerId },
      orderBy: { createdAt: 'desc' },
      include: { docs: true },
    });

    // Resume an existing draft.
    if (latest && latest.status === 'IN_PROGRESS') {
      await applyProfileState(workerId, 'IN_PROGRESS');
      return this.toPublic(latest);
    }

    // Blocked while a submission is under review or already approved.
    if (latest && (latest.status === 'PENDING_REVIEW' || latest.status === 'APPROVED')) {
      throw new Error(latest.status === 'APPROVED' ? 'Already verified' : 'Verification is already under review');
    }

    // New submission (first, rejected, resubmission-required, or revoked).
    const prevResub = latest && latest.status === 'RESUBMISSION_REQUIRED' ? latest : null;
    const prevApproved = latest && latest.status === 'REVOKED' ? latest : null;
    const prev = prevResub || prevApproved;

    const version = (latest?.version || 0) + 1;
    const keepSides = prevResub
      ? (prevResub.docs || []).filter(d => !(prevResub.resubmissionRequiredFor || []).includes(d.side)).map(d => ({ side: d.side, mediaId: d.mediaId }))
      : [];

    const created = await prisma.workerVerificationSubmission.create({
      data: {
        workerId,
        workerProfileId: profile.id,
        proofType,
        status: 'IN_PROGRESS',
        version,
        resubmissionRequiredFor: prevResub?.resubmissionRequiredFor || [],
        docs: keepSides.length
          ? { create: keepSides.map(s => ({ workerId, side: s.side as any, mediaId: s.mediaId })) }
          : undefined,
      },
      include: { docs: true },
    });

    // Link reused media to the new submission (they're referenced by an active draft now).
    for (const s of keepSides) {
      await prisma.mediaAsset.updateMany({ where: { id: s.mediaId }, data: { verificationSubmissionId: created.id } }).catch(() => {});
    }

    await applyProfileState(workerId, 'IN_PROGRESS');
    await audit(workerId, 'VERIFICATION_STARTED', 'WorkerVerificationSubmission', created.id, { proofType, version }, req);
    return this.toPublic(created);
  },

 /**
 * Attach an uploaded verification image to the current draft.
 * Re-uploading the same side replaces it; the old media is left for retention.
 */
  async attachDocument(workerId: string, submissionId: string, side: string, mediaId: string, req?: Request) {
    const sub = await prisma.workerVerificationSubmission.findFirst({
      where: { id: submissionId, workerId, status: 'IN_PROGRESS' },
    });
    if (!sub) throw new Error('No active draft for this submission');

    const proofTypes = await getProofTypes();
    const requiredSides = proofTypes[sub.proofType]?.sides || [];
    if (!requiredSides.includes(side) && side !== 'SELFIE') throw new Error('This document side is not required for the selected ID type');
    if (side === 'SELFIE' && !['AADHAAR', 'DRIVING_LICENCE', 'VOTER_ID', 'OTHER_GOVT_ID'].includes(sub.proofType)) throw new Error('Selfie not required');

    // Media must belong to this worker and be a private verification asset.
    const media = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, uploadedBy: workerId, isPrivate: true, purpose: 'verification' },
    });
    if (!media) throw new Error('Upload not found');

    // Replace any existing doc for this side on the draft.
    await prisma.workerVerificationDocument.deleteMany({ where: { submissionId, side: side as any } });
    const doc = await prisma.workerVerificationDocument.create({
      data: { submissionId, workerId, side: side as any, mediaId },
    });
    await prisma.mediaAsset.update({ where: { id: mediaId }, data: { verificationSubmissionId: submissionId } });
    await audit(workerId, side === 'SELFIE' ? 'VERIFICATION_SELFIE_UPLOADED' : 'VERIFICATION_DOCUMENT_UPLOADED', 'WorkerVerificationDocument', doc.id, { side }, req);
    return { mediaId };
  },

 /**
 * Submit the draft for review. Idempotent via clientRequestId
 * retries return the already-submitted submission instead of duplicating.
 * Consent must be EXPLICIT — never pre-checked server-side.
 */
  async submit(workerId: string, submissionId: string, input: { consentGranted?: boolean; consentVersion?: string; consentPolicyVersion?: string; clientRequestId?: string }, req?: Request) {
    const sub = await prisma.workerVerificationSubmission.findFirst({
      where: { id: submissionId, workerId },
      include: { docs: true },
    });
    if (!sub) throw new Error('Submission not found');
    if (sub.status === 'PENDING_REVIEW') return this.toPublic(sub); // already submitted
    if (sub.status !== 'IN_PROGRESS') throw new Error('Submission cannot be submitted in its current state');

    const profile = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
    if (!profile) throw new Error('Worker profile not found');
    if (profile.isBanned || profile.isPermanentlyBanned) throw new Error('Account is not eligible for verification');
    if (profile.isFrozen) throw new Error('Account is frozen due to unpaid penalties');

    // NOTE: never log `input` — it contains identity documents and personal data.
    // Explicit consent required.
    if (input.consentGranted !== true && String(input.consentGranted) !== 'true') throw new Error('You must consent to submit your documents for verification');
    if (!input.consentVersion || !input.consentPolicyVersion) throw new Error('Consent version is required');

    // Required sides + selfie present.
    const proofTypes = await getProofTypes();
    const requiredSides = proofTypes[sub.proofType]?.sides || [];
    const haveSides = new Set((sub.docs || []).map(d => d.side as string));
    for (const s of requiredSides) {
      if (!haveSides.has(s)) throw new Error(`Missing required document side: ${s}`);
    }
    if (!haveSides.has('SELFIE')) throw new Error('A selfie is required');

    // Idempotency: same clientRequestId → return the existing submission.
    if (input.clientRequestId) {
      const existing = await prisma.workerVerificationSubmission.findUnique({
        where: { workerId_clientRequestId: { workerId, clientRequestId: input.clientRequestId } },
        include: { docs: true },
      });
      if (existing) return this.toPublic(existing);
    }

    const updated = await prisma.workerVerificationSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'PENDING_REVIEW',
        submittedAt: new Date(),
        consentGranted: true,
        consentVersion: input.consentVersion,
        consentPolicyVersion: input.consentPolicyVersion,
        consentAt: new Date(),
        clientRequestId: input.clientRequestId || null,
      },
      include: { docs: true },
    });

    // Mirror into WorkerProfile (legacy fields kept for backward compat; never exposed).
    const frontDoc = (updated.docs || []).find(d => d.side === 'FRONT');
    const selfieDoc = (updated.docs || []).find(d => d.side === 'SELFIE');
    await prisma.workerProfile.update({
      where: { userId: workerId },
      data: {
        verificationStatus: 'PENDING',
        idProofType: sub.proofType,
        idProofUrl: frontDoc?.mediaId || null, // opaque media id, not a URL
        selfieUrl: selfieDoc?.mediaId || null,
        verificationNote: null,
        verifiedAt: null,
        isUrgentEligible: false,
      },
    });

    await audit(workerId, 'VERIFICATION_SUBMITTED', 'WorkerVerificationSubmission', submissionId, { proofType: sub.proofType, version: sub.version }, req);
    await notifyAdmins('New Verification Submission', `A worker submitted identity documents for review (${sub.proofType}).`, { submissionId });
    return this.toPublic(updated);
  },

 /** Latest submission for the worker (mediaIds returned for reuse; NO URLs). */
  async getCurrent(workerId: string) {
    const latest = await prisma.workerVerificationSubmission.findFirst({
      where: { workerId },
      orderBy: { createdAt: 'desc' },
      include: { docs: true },
    });
    if (!latest) return null;
    return this.toPublic(latest);
  },

 /**
 * Authorized signed URL for a private verification media.
 * Only the owning worker or an ADMIN may obtain it.
 */
  async getSignedUrl(requesterId: string, role: string, mediaId: string): Promise<string> {
    const media = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, isPrivate: true, purpose: 'verification' },
    });
    if (!media || !media.publicId) throw new Error('Document not found');
    if (!isAdminRole(role) && media.uploadedBy !== requesterId) throw new Error('Access denied');
    return signedUrlForMedia(media.publicId);
  },

  toPublic(sub: any) {
    return {
      id: sub.id,
      status: sub.status,
      proofType: sub.proofType,
      version: sub.version,
      submittedAt: sub.submittedAt,
      reviewedAt: sub.reviewedAt,
      rejectionReason: sub.rejectionReason,
      rejectionNote: sub.rejectionNote,
      resubmissionRequiredFor: sub.resubmissionRequiredFor || [],
      consentGranted: sub.consentGranted,
      docs: (sub.docs || []).map((d: any) => ({ side: d.side, mediaId: d.mediaId, createdAt: d.createdAt })),
    };
  },

  // ─── Admin ─────────────────────────────────────────────

 /** Queue — list view exposes NO documents. */
  async listForAdmin(status?: string, search?: string) {
    const where: any = { status: { not: 'IN_PROGRESS' } };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { worker: { name: { contains: search, mode: 'insensitive' } } },
        { worker: { phone: { contains: search } } },
      ];
    }
    const submissions = await prisma.workerVerificationSubmission.findMany({
      where,
      select: {
        id: true, status: true, proofType: true, submittedAt: true, version: true,
        worker: { select: { id: true, name: true, phone: true } },
        workerProfile: { select: { category: true, city: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 100,
    });
    return submissions;
  },

 /** Full review package — includes signed doc URLs, ADMIN only. */
  async getDetailForAdmin(submissionId: string) {
    const sub = await prisma.workerVerificationSubmission.findUnique({
      where: { id: submissionId },
      include: {
        worker: { select: { id: true, name: true, phone: true, createdAt: true } },
        workerProfile: { select: { category: true, city: true, state: true, rating: true, completedJobs: true, verificationStatus: true, verifiedAt: true } },
        docs: { include: { media: true } },
      },
    });
    if (!sub) throw new Error('Submission not found');

    // Prior submissions = immutable history.
    const history = await prisma.workerVerificationSubmission.findMany({
      where: { workerId: sub.workerId, id: { not: sub.id } },
      select: { id: true, status: true, proofType: true, version: true, submittedAt: true, reviewedAt: true, reviewedBy: true, decision: true, rejectionReason: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const docs = (sub.docs || []).map(d => ({
      side: d.side,
      mediaId: d.mediaId,
      createdAt: d.createdAt,
      signedUrl: d.media?.publicId ? signedUrlForMedia(d.media.publicId) : null,
    }));

    return {
      id: sub.id,
      status: sub.status,
      proofType: sub.proofType,
      verificationMethod: sub.verificationMethod,
      version: sub.version,
      submittedAt: sub.submittedAt,
      reviewedAt: sub.reviewedAt,
      reviewedBy: sub.reviewedBy,
      decision: sub.decision,
      rejectionReason: sub.rejectionReason,
      rejectionNote: sub.rejectionNote,
      resubmissionRequiredFor: sub.resubmissionRequiredFor || [],
      consent: { granted: sub.consentGranted, version: sub.consentVersion, policyVersion: sub.consentPolicyVersion, at: sub.consentAt },
      worker: sub.worker,
      workerProfile: sub.workerProfile,
      docs,
      history,
    };
  },

 /**
 * Admin review decision. State-guarded + concurrency-safe
 * only PENDING_REVIEW can be approved/rejected/resubmission-requested;
 * only APPROVED can be revoked. A conflicting second decision → 409.
 */
  async review(submissionId: string, adminId: string, input: { decision: string; rejectionReason?: string; rejectionNote?: string; resubmissionRequiredFor?: string[] }, req?: Request) {
    const sub = await prisma.workerVerificationSubmission.findUnique({
      where: { id: submissionId },
      include: { docs: true },
    });
    if (!sub) throw new Error('Submission not found');

    const decision = input.decision;
    const expectStatus = decision === 'REVOKE' ? 'APPROVED' : 'PENDING_REVIEW';

    // Atomic claim — a second admin sees 409 (resolves conflicting decisions).
    const claimed = await prisma.workerVerificationSubmission.updateMany({
      where: { id: submissionId, status: expectStatus as any },
      data: { status: 'IN_PROGRESS' as any }, // temporary lock placeholder
    });
    if (claimed.count === 0) throw Object.assign(new Error('This verification was already decided by another admin.'), { status: 409 });

    try {
      let nextStatus = 'IN_PROGRESS' as string;
      let profileStatus = 'IN_PROGRESS' as string;
      let resubmissionRequiredFor = sub.resubmissionRequiredFor || [];

      if (decision === 'APPROVE') { nextStatus = 'APPROVED'; profileStatus = 'VERIFIED'; }
      else if (decision === 'REJECT') {
        if (!input.rejectionReason) throw new Error('A rejection reason is required');
        if (!REJECTION_REASONS.includes(input.rejectionReason as any)) throw new Error('Invalid rejection reason');
        nextStatus = 'REJECTED'; profileStatus = 'REJECTED';
      } else if (decision === 'RESUBMISSION') {
        if (!input.rejectionReason) throw new Error('A resubmission reason is required');
        if (!REJECTION_REASONS.includes(input.rejectionReason as any)) throw new Error('Invalid resubmission reason');
        // Default to re-capturing everything unless specified.
        resubmissionRequiredFor = input.resubmissionRequiredFor?.length
          ? input.resubmissionRequiredFor
          : ['FRONT', 'BACK', 'SELFIE'].filter(s => (sub.docs || []).some(d => d.side === s));
        nextStatus = 'RESUBMISSION_REQUIRED'; profileStatus = 'RESUBMISSION_REQUIRED';
      } else if (decision === 'REVOKE') {
        nextStatus = 'REVOKED'; profileStatus = 'REVOKED';
      } else {
        throw new Error('Invalid decision');
      }

      const updated = await prisma.workerVerificationSubmission.update({
        where: { id: submissionId },
        data: {
          status: nextStatus as any,
          reviewedAt: new Date(),
          reviewedBy: adminId,
          decision,
          rejectionReason: input.rejectionReason || null,
          rejectionNote: input.rejectionNote || null,
          resubmissionRequiredFor,
        },
      });

      // Profile mirror + urgent eligibility (isUrgentEligible only when VERIFIED).
      const isVerified = decision === 'APPROVE';
      await prisma.workerProfile.update({
        where: { id: sub.workerProfileId },
        data: {
          verificationStatus: profileStatus as any,
          isUrgentEligible: isVerified,
          urgentEligibilityReason: isVerified ? 'Identity verified by admin' : 'Not identity verified',
          verifiedAt: isVerified ? new Date() : null,
          verificationNote: input.rejectionNote || (decision === 'REJECT' || decision === 'REVOKE' ? input.rejectionReason || null : null),
        },
      });

      const actionMap: Record<string, string> = { APPROVE: 'VERIFICATION_APPROVED', REJECT: 'VERIFICATION_REJECTED', RESUBMISSION: 'VERIFICATION_RESUBMISSION_REQUESTED', REVOKE: 'VERIFICATION_REVOKED' };
      await audit(adminId, actionMap[decision], 'WorkerVerificationSubmission', submissionId, { workerId: sub.workerId, decision, rejectionReason: input.rejectionReason, note: input.rejectionNote }, req);

      // Worker notification.
      if (decision === 'APPROVE') {
        await notificationService.sendPushNotification(sub.workerId, 'Identity verified', 'Your identity verification was approved. You can now access verified-worker features.', 'verification', { submissionId });
      } else if (decision === 'REJECT') {
        await notificationService.sendPushNotification(sub.workerId, 'Verification needs attention', 'Your documents could not be verified. Please resubmit.', 'verification', { submissionId, reason: input.rejectionReason });
      } else if (decision === 'RESUBMISSION') {
        await notificationService.sendPushNotification(sub.workerId, 'Verification needs attention', 'Some of your documents need to be recaptured. Please resubmit.', 'verification', { submissionId, reason: input.rejectionReason });
      } else if (decision === 'REVOKE') {
        await notificationService.sendPushNotification(sub.workerId, 'Verification revoked', 'Your identity verification was revoked. Contact support if you believe this is a mistake.', 'verification', { submissionId });
      }
      emitToAdmins('admin_refresh', { type: 'verification' });
      emitToUser(sub.workerId, 'worker_refresh', { type: 'verification' });

      return updated;
    } catch (e) {
      // Release the lock on failure so the submission isn't stuck.
      await prisma.workerVerificationSubmission.update({
        where: { id: submissionId },
        data: { status: sub.status as any },
      }).catch(() => {});
      throw e;
    }
  },
};
