import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { issueDiscoveryService } from '../services/issueDiscovery.service';

export const issueController = {
  // GET /issues/:category — list established issues (ranked), 'Other' always present
  listByCategory: async (req: AuthRequest, res: Response) => {
    try {
      const { category } = req.params;
      const { city } = req.query;
      const issues = await issueDiscoveryService.listForCategory(category as any, city as string | null);
      sendResponse(res, 200, issues);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /issues/scope/:issueId — structured scope config for an issue
  getScope: async (req: AuthRequest, res: Response) => {
    try {
      const { issueId } = req.params;
      const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { scopeConfig: true, label: true } });
      if (!issue) return sendError(res, 404, 'Issue not found');
      sendResponse(res, 200, { label: issue.label, scopeConfig: issue.scopeConfig });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // POST /issues/run-promotion — admin trigger to promote candidates (optional periodic)
  runPromotion: async (req: AuthRequest, res: Response) => {
    try {
      const { category } = req.body;
      const promoted = await issueDiscoveryService.runPromotion(category);
      sendResponse(res, 200, { promoted }, `${promoted} candidate(s) promoted`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // ── Admin: issue management ──
  adminList: async (req: AuthRequest, res: Response) => {
    try {
      const { category, lifecycle } = req.query;
      const where: any = {};
      if (category) where.category = category;
      if (lifecycle) where.lifecycle = lifecycle;
      const issues = await prisma.issue.findMany({
        where,
        include: { aliases: { select: { alias: true, lang: true } } },
        orderBy: [{ usageCount: 'desc' }, { label: 'asc' }],
      });
      sendResponse(res, 200, issues);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  adminListCandidates: async (req: AuthRequest, res: Response) => {
    try {
      const { category, lifecycle = 'CANDIDATE' } = req.query;
      const where: any = { lifecycle };
      if (category) where.category = category;
      const candidates = await prisma.issueCandidate.findMany({
        where,
        orderBy: [{ occurrenceCount: 'desc' }, { uniqueUsers: 'desc' }],
        take: 200,
      });
      sendResponse(res, 200, candidates);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  adminCreateIssue: async (req: AuthRequest, res: Response) => {
    try {
      const { category, canonicalId, label, description, scopeConfig, aliases = [] } = req.body;
      if (!category || !canonicalId || !label) return sendError(res, 400, 'category, canonicalId, label required');

      const issue = await prisma.issue.upsert({
        where: { category_canonicalId: { category, canonicalId: canonicalId.toUpperCase() } },
        update: { label, description: description || null, scopeConfig: scopeConfig || null },
        create: {
          category, canonicalId: canonicalId.toUpperCase(), label,
          description: description || null, scopeConfig: scopeConfig || null,
          lifecycle: 'ESTABLISHED',
        },
      });

      for (const alias of aliases) {
        await prisma.issueAlias.upsert({
          where: { issueId_alias: { issueId: issue.id, alias: alias.toLowerCase() } },
          update: {},
          create: { issueId: issue.id, alias: alias.toLowerCase() },
        });
      }

      // Audit
      await createAuditLog(prisma, req, { userId: req.user!.userId, action: 'ISSUE_CREATED', resource: 'Issue', resourceId: issue.id, newValue: { canonicalId: issue.canonicalId, label } });
      sendResponse(res, 201, issue, 'Issue created');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  adminUpdateLifecycle: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { lifecycle } = req.body;
      if (!['ESTABLISHED', 'DECLINING', 'ARCHIVED'].includes(lifecycle)) return sendError(res, 400, 'Invalid lifecycle');
      const issue = await prisma.issue.update({
        where: { id },
        data: { lifecycle, archivedAt: lifecycle === 'ARCHIVED' ? new Date() : null },
      });
      await createAuditLog(prisma, req, { userId: req.user!.userId, action: 'ISSUE_LIFECYCLE', resource: 'Issue', resourceId: id, newValue: { lifecycle } });
      sendResponse(res, 200, issue, `Issue ${lifecycle.toLowerCase()}`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  adminMergeIssue: async (req: AuthRequest, res: Response) => {
    try {
      const { sourceId, targetId } = req.body;
      // Archive source, link its aliases to target (historical identity preserved)
      await prisma.$transaction(async (tx) => {
        const aliases = await tx.issueAlias.findMany({ where: { issueId: sourceId } });
        for (const a of aliases) {
          await tx.issueAlias.upsert({ where: { issueId_alias: { issueId: targetId, alias: a.alias } }, update: {}, create: { issueId: targetId, alias: a.alias, lang: a.lang } });
        }
        await tx.issue.update({ where: { id: sourceId }, data: { lifecycle: 'ARCHIVED', archivedAt: new Date() } });
      });
      await createAuditLog(prisma, req, { userId: req.user!.userId, action: 'ISSUE_MERGED', resource: 'Issue', resourceId: sourceId, newValue: { mergedInto: targetId } });
      sendResponse(res, 200, null, 'Issue merged');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  adminResolveCandidate: async (req: AuthRequest, res: Response) => {
    try {
      const { candidateId, action, issueId } = req.body;
      const candidate = await prisma.issueCandidate.findUnique({ where: { id: candidateId } });
      if (!candidate) return sendError(res, 404, 'Candidate not found');

      if (action === 'reject') {
        await prisma.issueCandidate.update({ where: { id: candidateId }, data: { lifecycle: 'ARCHIVED' } });
        await createAuditLog(prisma, req, { userId: req.user!.userId, action: 'ISSUE_CANDIDATE_REJECTED', resource: 'IssueCandidate', resourceId: candidateId });
        return sendResponse(res, 200, null, 'Candidate rejected');
      }
      if (action === 'approve' && issueId) {
        await prisma.issueCandidate.update({ where: { id: candidateId }, data: { lifecycle: 'ESTABLISHED', linkedIssueId: issueId } });
        // add phrase as alias to the linked issue
        await prisma.issueAlias.upsert({ where: { issueId_alias: { issueId, alias: candidate.phrase } }, update: {}, create: { issueId, alias: candidate.phrase } });
        await createAuditLog(prisma, req, { userId: req.user!.userId, action: 'ISSUE_CANDIDATE_APPROVED', resource: 'IssueCandidate', resourceId: candidateId, newValue: { issueId } });
        return sendResponse(res, 200, null, 'Candidate linked to issue');
      }
      return sendError(res, 400, 'Invalid action');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /issues/admin/config — promotion thresholds + lifecycle days
  getConfig: async (_req: AuthRequest, res: Response) => {
    try {
      const keys = ['ISSUE_PROMOTE_OCCURRENCE', 'ISSUE_PROMOTE_USERS', 'ISSUE_DECLINE_DAYS', 'ISSUE_ARCHIVE_DAYS'];
      const rows = await prisma.marketConfig.findMany({ where: { key: { in: keys } } });
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      sendResponse(res, 200, {
        promoteOccurrence: parseInt(map['ISSUE_PROMOTE_OCCURRENCE'] || '10', 10),
        promoteUsers: parseInt(map['ISSUE_PROMOTE_USERS'] || '3', 10),
        declineDays: parseInt(map['ISSUE_DECLINE_DAYS'] || '90', 10),
        archiveDays: parseInt(map['ISSUE_ARCHIVE_DAYS'] || '180', 10),
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PUT /issues/admin/config — set promotion thresholds (audited)
  putConfig: async (req: AuthRequest, res: Response) => {
    try {
      const { promoteOccurrence, promoteUsers, declineDays, archiveDays } = req.body;
      const sets: [string, number][] = [];
      if (promoteOccurrence !== undefined && promoteOccurrence >= 1) sets.push(['ISSUE_PROMOTE_OCCURRENCE', promoteOccurrence]);
      if (promoteUsers !== undefined && promoteUsers >= 1) sets.push(['ISSUE_PROMOTE_USERS', promoteUsers]);
      if (declineDays !== undefined && declineDays >= 1) sets.push(['ISSUE_DECLINE_DAYS', declineDays]);
      if (archiveDays !== undefined && archiveDays >= 1) sets.push(['ISSUE_ARCHIVE_DAYS', archiveDays]);
      for (const [key, value] of sets) {
        await prisma.marketConfig.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value), description: 'Issue discovery config' },
        });
        await createAuditLog(prisma, req, {
          userId: req.user!.userId, action: 'ISSUE_CONFIG_UPDATED', resource: 'MarketConfig', resourceId: key, newValue: { key, value },
        });
      }
      sendResponse(res, 200, null, 'Issue config updated');
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
