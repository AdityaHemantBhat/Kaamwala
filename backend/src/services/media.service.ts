import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

// ─── Deterministic image signature detection (no external dep) ──────────
// Validates the ACTUAL file content (magic bytes), never trusting filename/extension/client MIME.
const SIGNATURES: { name: string; mime: string; match: (b: Buffer) => boolean }[] = [
  { name: 'JPEG', mime: 'image/jpeg', match: (b) => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { name: 'PNG',  mime: 'image/png',  match: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { name: 'GIF',  mime: 'image/gif',  match: (b) => b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  { name: 'WebP', mime: 'image/webp', match: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { name: 'AVIF', mime: 'image/avif', match: (b) => b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' && (b.toString('ascii', 8, 12).startsWith('avif') || b.toString('ascii', 8, 12).startsWith('avis')) },
];

export const MEDIA_LIMITS = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  maxCount: 6, // per request
  maxDimensions: 2400, // max edge for re-encode
};

/**
 * Purposes that are intentionally long-lived without any booking/request link:
 * profile avatars, portfolio showcase photos, and support/ticket attachments.
 * The generic orphan cleanup must NEVER auto-delete these — they are only
 * removed when the owner explicitly deletes them (or an admin moderates).
 */
export const PERMANENT_PURPOSES = ['profile', 'portfolio', 'ticket', 'support'];

export interface UploadResult {
  url: string;
  mime: string;
  size: number;
  reencoded: boolean;
}

/**
 * Validate actual image bytes (magic bytes) + size. Returns detected mime or null.
 */
export function detectImageMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  for (const sig of SIGNATURES) {
    if (sig.match(buffer)) return sig.mime;
  }
  return null;
}

/**
 * Upload an image securely via Cloudinary with re-encode (strips EXIF, normalizes,
 * compresses). Fails closed: rejects non-images and oversized files.
 */
export async function secureUploadImage(
  buffer: Buffer,
  ownerUserId: string,
  scope?: { bookingId?: string; requestId?: string; purpose?: string },
): Promise<UploadResult> {
  // 1. Size check
  if (!buffer || buffer.length === 0) throw new Error('No file provided');
  if (buffer.length > MEDIA_LIMITS.maxSizeBytes) {
    throw new Error(`Image too large. Max ${Math.floor(MEDIA_LIMITS.maxSizeBytes / (1024 * 1024))}MB`);
  }

  // 2. Magic-byte validation (authoritative, not client MIME)
  const mime = detectImageMime(buffer);
  if (!mime) throw new Error('Invalid image file. Only JPG, PNG, GIF, WebP, AVIF allowed');

  // 3. Re-encode + strip EXIF + normalize via Cloudinary transformations
  try {
    const cloudinary = require('../config/cloudinary').cloudinary;
    const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'kaamwala',
      resource_type: 'image',
      // fetch_format auto + quality auto re-encodes; width/height normalize;
      // Cloudinary strips metadata/EXIF by default on delivery
      fetch_format: 'auto',
      quality: 'auto:good',
      transformation: [{ width: MEDIA_LIMITS.maxDimensions, crop: 'limit' }],
    });

    // 4. Record ownership for lifecycle management
    await prisma.mediaAsset.create({
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        mime,
        size: buffer.length,
        uploadedBy: ownerUserId,
        bookingId: scope?.bookingId || null,
        requestId: scope?.requestId || null,
        purpose: scope?.purpose || 'general',
      },
    }).catch(err => logger.warn('Failed to record media asset', { ownerUserId, url: result.secure_url, error: err?.message }));

    return { url: result.secure_url, mime, size: buffer.length, reencoded: true };
  } catch (e: any) {
    // Cloudinary unavailable — refuse rather than persist raw base64 (security)
    throw new Error('Image processing unavailable. Please try again.');
  }
}

export interface VerificationUploadResult {
  mediaId: string;
  publicId: string;
}

/**
 * Upload a worker identity document / selfie to PRIVATE secure storage.
 * Same authoritative magic-byte + size checks as secureUploadImage, but the asset is
 * uploaded as a Cloudinary `private` type — only reachable via a signed URL generated
 * server-side behind an authorized endpoint. Returns an opaque mediaId, never a URL.
 */
export async function secureUploadVerificationImage(
  buffer: Buffer,
  ownerUserId: string,
): Promise<VerificationUploadResult> {
  if (!buffer || buffer.length === 0) throw new Error('No file provided');
  if (buffer.length > MEDIA_LIMITS.maxSizeBytes) {
    throw new Error(`Image too large. Max ${Math.floor(MEDIA_LIMITS.maxSizeBytes / (1024 * 1024))}MB`);
  }
  const mime = detectImageMime(buffer);
  if (!mime) throw new Error('Invalid image file. Only JPG, PNG, GIF, WebP, AVIF allowed');

  try {
    const cloudinary = require('../config/cloudinary').cloudinary;
    const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'kaamwala/verification',
      resource_type: 'image',
      type: 'private', // NOT publicly deliverable
      fetch_format: 'auto',
      quality: 'auto:good',
      transformation: [{ width: MEDIA_LIMITS.maxDimensions, crop: 'limit' }],
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        url: result.public_id, // private assets: public_id, not a public URL
        publicId: result.public_id,
        mime,
        size: buffer.length,
        uploadedBy: ownerUserId,
        purpose: 'verification',
        isPrivate: true,
      },
    });
    return { mediaId: asset.id, publicId: result.public_id };
  } catch (e: any) {
    throw new Error('Image processing unavailable. Please try again.');
  }
}

/**
 * Time-limited signed delivery URL for a private asset.
 * Only ever generated server-side and returned behind authorized endpoints.
 */
export function signedUrlForMedia(publicId: string): string {
  const cloudinary = require('../config/cloudinary').cloudinary;
  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'private',
    secure: true,
    sign_url: true, // signed, time-limited
  });
}

/**
 * Link previously-uploaded MediaAssets (by URL) to a request/booking.
 * Images are uploaded BEFORE the request/booking row exists , so the
 * requestId/bookingId must be back-filled afterward or orphan cleanup would
 * delete in-use images. Never store bare local paths.
 */
export async function linkMediaToScope(
  urls: string[],
  scope: { requestId?: string; bookingId?: string },
): Promise<number> {
  let linked = 0;
  for (const url of urls) {
    if (!url || typeof url !== 'string') continue;
    const res = await prisma.mediaAsset.updateMany({
      where: {
        url,
        bookingId: null, // never clobber an existing booking link
        // Match assets tied to this request OR still untagged. This is what makes
        // the request→booking back-fill work: images already linked to the request
        // (requestId set) can still receive the bookingId on conversion.
        ...(scope.requestId
          ? { OR: [{ requestId: null }, { requestId: scope.requestId }] }
          : { requestId: null }),
      },
      data: {
        ...(scope.requestId ? { requestId: scope.requestId } : {}),
        ...(scope.bookingId ? { bookingId: scope.bookingId } : {}),
      },
    });
    linked += res.count;
  }
  return linked;
}

/**
 * Clean up media per retention policy
 * 1. Draft orphans (not linked, older than `orphanHours`) — existing behaviour.
 * 2. Media linked to CANCELLED/EXPIRED requests, older than `retentionDays`.
 * 3. Media linked to COMPLETED bookings, older than `retentionDays`.
 */
export async function cleanupMedia(orphanHours = 24, retentionDays = 30): Promise<number> {
  let removed = 0;
  const orphanCutoff = new Date(Date.now() - orphanHours * 60 * 60 * 1000);
  const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // 1. Draft orphans (private/verification media are managed by the dedicated
  // verification retention job — never touched by the general cleanup).
  // Permanent-purpose assets (profile/portfolio/ticket/support) are excluded:
  // they are long-lived and only removed on explicit owner/admin action.
  const orphans = await prisma.mediaAsset.findMany({
    where: {
      bookingId: null,
      requestId: null,
      isPrivate: false,
      purpose: { notIn: PERMANENT_PURPOSES },
      createdAt: { lt: orphanCutoff },
    },
    select: { id: true, publicId: true },
  });

  // 2. Linked to dead requests (cancelled/expired)
  const deadRequests = await prisma.customerJobRequest.findMany({
    where: { status: { in: ['CANCELLED', 'EXPIRED'] }, updatedAt: { lt: retentionCutoff } },
    select: { id: true },
  });
  const requestLinked = deadRequests.length
    ? await prisma.mediaAsset.findMany({
        where: { requestId: { in: deadRequests.map(r => r.id) }, isPrivate: false, createdAt: { lt: retentionCutoff } },
        select: { id: true, publicId: true },
      })
    : [];

  // 3. Linked to completed bookings past retention
  const oldCompleted = await prisma.booking.findMany({
    where: { status: 'COMPLETED', completedAt: { lt: retentionCutoff } },
    select: { id: true },
  });
  const bookingLinked = oldCompleted.length
    ? await prisma.mediaAsset.findMany({
        where: { bookingId: { in: oldCompleted.map(b => b.id) }, isPrivate: false, createdAt: { lt: retentionCutoff } },
        select: { id: true, publicId: true },
      })
    : [];

  const targets = [...orphans, ...requestLinked, ...bookingLinked];
  const seen = new Set<string>();
  for (const o of targets) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    try {
      const cloudinary = require('../config/cloudinary').cloudinary;
      if (o.publicId) await cloudinary.uploader.destroy(o.publicId);
      await prisma.mediaAsset.delete({ where: { id: o.id } });
      removed++;
    } catch {}
  }
  return removed;
}

/**
 * Delete an image the requesting user uploaded — owner-only, by URL (the app
 * never persists media IDs, only the Cloudinary URL returned at upload time).
 *
 * Refuses when the asset is already linked to a submitted request/booking, so
 * evidence for live records can't be destroyed by mistake. Missing/foreign
 * assets are a silent no-op so the client can fire-and-forget on removal.
 */
export async function deleteMediaByUrl(url: string, ownerUserId: string): Promise<void> {
  if (!url || typeof url !== 'string') return;
  const asset = await prisma.mediaAsset.findFirst({
    where: { url, uploadedBy: ownerUserId },
  });
  if (!asset) return; // already gone / not owned by this user — treat as success
  if (asset.bookingId || asset.requestId) {
    throw new Error('Cannot delete image that is part of a submitted record');
  }
  const cloudinary = require('../config/cloudinary').cloudinary;
  if (asset.publicId) await cloudinary.uploader.destroy(asset.publicId)
    .catch((err: any) => logger.warn('Failed to delete media from Cloudinary', { assetId: asset.id, publicId: asset.publicId, error: err?.message }));
  await prisma.mediaAsset.delete({ where: { id: asset.id } });
}

// Backwards-compatible name used by the scheduled job + admin trigger.
export async function cleanupOrphanedMedia(hours = 24): Promise<number> {
  return cleanupMedia(hours, 30);
}
