import { Request, Response } from 'express';
import { disputeService } from '../services/dispute.service';
import { DisputeDecision, UserRole } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

export const disputeController = {
  // Create a new dispute (customer or worker)
  async createDispute(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { bookingId, reason, evidence } = req.body;

      if (!bookingId || !reason) {
        return res.status(400).json({ error: 'Booking ID and reason are required' });
      }

      const dispute = await disputeService.createDispute({
        bookingId,
        raisedBy: userId,
        reason,
        evidence
      });

      res.status(201).json({ data: dispute });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // Add evidence to existing dispute
  async addEvidence(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { disputeId } = req.params;
      const { evidence } = req.body;

      if (!evidence || !Array.isArray(evidence) || evidence.length === 0) {
        return res.status(400).json({ error: 'Evidence array is required' });
      }

      const dispute = await disputeService.addEvidence(disputeId, userId, evidence);
      res.json({ data: dispute });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // Get dispute by ID
  async getDispute(req: Request, res: Response) {
    try {
      const { disputeId } = req.params;
      const dispute = await disputeService.getDisputeById(disputeId);
      res.json({ data: dispute });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  },

  // Get dispute by booking ID
  async getDisputeByBooking(req: Request, res: Response) {
    try {
      const { bookingId } = req.params;
      const dispute = await disputeService.getDisputeByBookingId(bookingId);

      if (!dispute) {
        return res.status(404).json({ error: 'No dispute found for this booking' });
      }

      res.json({ data: dispute });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // List disputes (with filters)
  async listDisputes(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const userRole = req.user!.role as UserRole;
      const { status, page = '1', limit = '20' } = req.query;

      const filters: any = {
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };

      if (status) {
        filters.status = status as DisputeDecision;
      }

      // For non-admin users, filter by their role
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
        filters.userId = userId;
        filters.role = userRole;
      }

      const result = await disputeService.getDisputes(filters);
      res.json({ data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // Admin: Resolve dispute
  async resolveDispute(req: AuthRequest, res: Response) {
    try {
      const adminId = req.user!.userId;
      const { disputeId } = req.params;
      const { decision, adminNotes, refundAmount } = req.body;

      if (!decision || !Object.values(DisputeDecision).includes(decision)) {
        return res.status(400).json({ error: 'Valid decision is required' });
      }

      const dispute = await disputeService.resolveDispute(disputeId, {
        decision,
        adminNotes,
        refundAmount
      }, adminId);

      res.json({ data: dispute });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  // Admin: Get dispute statistics
  async getDisputeStats(req: Request, res: Response) {
    try {
      const stats = await disputeService.getDisputeStats();
      res.json({ data: stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
};