import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { analyticsService } from '../services/analytics.service';
import { featureFlagsService } from '../services/featureFlags.service';

export const marketplaceAdminController = {
  // GET /admin-marketplace/analytics — event summary
  getAnalytics: async (req: AuthRequest, res: Response) => {
    try {
      const hours = parseInt(String(req.query.hours || '24'), 10) || 24;
      const summary = await analyticsService.getSummary(hours);
      sendResponse(res, 200, summary);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /admin-marketplace/flags — feature flag state
  getFlags: async (_req: AuthRequest, res: Response) => {
    try {
      const defaults = featureFlagsService.listDefaults();
      const resolved: Record<string, boolean> = {};
      for (const key of Object.keys(defaults)) {
        resolved[key] = await featureFlagsService.isEnabled(key);
      }
      sendResponse(res, 200, { flags: resolved, defaults });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PUT /admin-marketplace/flags/:flag — toggle a feature flag
  putFlag: async (req: AuthRequest, res: Response) => {
    try {
      const { flag } = req.params;
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') return sendError(res, 400, 'enabled boolean required');
      await featureFlagsService.setFlag(flag, enabled, req.user!.userId, req);
      sendResponse(res, 200, { flag, enabled }, `Flag ${flag} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /admin-marketplace/observations — raw pricing observations (risk-aware)
  getObservations: async (req: AuthRequest, res: Response) => {
    try {
      const { category, limit = '100' } = req.query;
      const where: any = {};
      if (category) where.category = category;
      const obs = await prisma.marketPriceObservation.findMany({
        where,
        orderBy: { observedAt: 'desc' },
        take: parseInt(String(limit), 10) || 100,
        select: { id: true, category: true, issueId: true, pricingUnit: true, zone: true, unitRate: true, origin: true, recommendationExposed: true, experimentVersion: true, riskScore: true, observedAt: true },
      });
      sendResponse(res, 200, obs);
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
