import { Router } from 'express';
import { cancellationController } from '../controllers/cancellation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Customer-initiated cancellation ──────────────────────────────────
router.post('/:bookingId/cancel', cancellationController.cancelBooking);

// ─── Cancel preview (server-computed fee / refund / reason-required) ───
router.get('/:bookingId/preview', cancellationController.previewCancellation);

// ─── User cancellation history ────────────────────────────────────────
router.get('/history', cancellationController.getHistory);

// ─── Get pending cancellation fee for current user ────────────────────
router.get('/pending-fee', cancellationController.getPendingFee);

// ─── Admin: Get all cancellation records ──────────────────────────────
router.get('/admin/all', requireRole('ADMIN'), cancellationController.adminGetAll);

// ─── Admin: Waive cancellation fee ────────────────────────────────────
router.patch('/admin/:id/waive', requireRole('ADMIN'), cancellationController.adminWaiveFee);

// ─── Admin: Refund cancellation fee ───────────────────────────────────
router.patch('/admin/:id/refund', requireRole('ADMIN'), cancellationController.adminRefundFee);

// ─── Admin: Cancellation stats ────────────────────────────────────────
router.get('/admin/stats', requireRole('ADMIN'), cancellationController.adminGetStats);

export default router;
