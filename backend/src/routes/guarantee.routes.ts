import { Router } from 'express';
import { guaranteeController } from '../controllers/guarantee.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// Customer-facing warranty / claim endpoints.
router.get('/eligible-bookings', authenticate, guaranteeController.eligibleBookings);
router.get('/claims/mine', authenticate, guaranteeController.myClaims);
router.post('/claims', authenticate, guaranteeController.createClaim);
router.get('/claims/:id', authenticate, guaranteeController.getClaim);

// Worker submits before/after completion photos (evidence for claims).
router.post('/jobs/:bookingId/photos', authenticate, requireRole('WORKER'), guaranteeController.submitJobPhotos);

// Admin management.
router.get('/admin/claims', authenticate, requireRole('ADMIN'), guaranteeController.listClaims);
router.put('/admin/claims/:id/resolve', authenticate, requireRole('ADMIN'), guaranteeController.resolveClaim);

export default router;
