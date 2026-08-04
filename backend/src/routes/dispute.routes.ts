import { Router } from 'express';
import { disputeController } from '../controllers/dispute.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Customer/Worker routes
router.post('/', disputeController.createDispute);
router.post('/:disputeId/evidence', disputeController.addEvidence);
router.get('/my', disputeController.listDisputes);
router.get('/booking/:bookingId', disputeController.getDisputeByBooking);
router.get('/:disputeId', disputeController.getDispute);

// Admin only routes
router.get('/admin/stats', requireRole('ADMIN'), disputeController.getDisputeStats);
router.get('/admin', requireRole('ADMIN'), disputeController.listDisputes);
router.put('/:disputeId/resolve', requireRole('ADMIN'), disputeController.resolveDispute);

export { router as disputeRouter };