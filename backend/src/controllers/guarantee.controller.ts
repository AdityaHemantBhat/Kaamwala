import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { guaranteeService } from '../services/guarantee.service';

export const guaranteeController = {
  /** Completed, in-warranty bookings for the customer's guarantee screen. */
  eligibleBookings: async (req: AuthRequest, res: Response) => {
    try {
      const bookings = await guaranteeService.listEligibleBookings(req.user!.userId);
      sendResponse(res, 200, bookings);
    } catch (e: any) { sendError(res, 400, e.message); }
  },

  /** Claims the customer has raised. */
  myClaims: async (req: AuthRequest, res: Response) => {
    try {
      const claims = await guaranteeService.listClaimsForCustomer(req.user!.userId);
      sendResponse(res, 200, claims);
    } catch (e: any) { sendError(res, 400, e.message); }
  },

  /** Customer raises a claim with reason + photo evidence. */
  createClaim: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId, reason, evidence } = req.body;
      const claim = await guaranteeService.createClaim(req.user!.userId, { bookingId, reason, evidence });
      sendResponse(res, 201, claim, 'Claim submitted');
    } catch (e: any) { sendError(res, 400, e.message); }
  },

  /** Claim detail — customer, assigned worker, or admin. */
  getClaim: async (req: AuthRequest, res: Response) => {
    try {
      const claim = await guaranteeService.getClaimForUser(req.params.id, req.user!.userId, req.user!.role);
      sendResponse(res, 200, claim);
    } catch (e: any) { sendError(res, e.message === 'Access denied' ? 403 : 404, e.message); }
  },

  /** Worker submits before/after photos for a job they completed. */
  submitJobPhotos: async (req: AuthRequest, res: Response) => {
    try {
      const photo = await guaranteeService.recordJobPhotos(req.user!.userId, req.params.bookingId, req.body);
      sendResponse(res, 201, photo, 'Job photos submitted');
    } catch (e: any) { sendError(res, 400, e.message); }
  },

  /** Admin: list claims (optional ?status= filter). */
  listClaims: async (req: AuthRequest, res: Response) => {
    try {
      const claims = await guaranteeService.listClaimsForAdmin(req.query.status as string | undefined);
      sendResponse(res, 200, claims);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  /** Admin: approve/reject a claim. */
  resolveClaim: async (req: AuthRequest, res: Response) => {
    try {
      const { decision, note } = req.body;
      const claim = await guaranteeService.resolveClaim(req.params.id, decision, note, req.user!.userId);
      sendResponse(res, 200, claim, `Claim ${decision.toLowerCase()}`);
    } catch (e: any) { sendError(res, 400, e.message); }
  },
};
