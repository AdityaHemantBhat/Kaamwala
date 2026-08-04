import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { scopeChangeController } from '../controllers/scope-change.controller';

const router = Router();

router.get('/:bookingId', authenticate, scopeChangeController.listForBooking);
router.post('/:bookingId/propose', authenticate, scopeChangeController.propose);
router.post('/:id/respond', authenticate, scopeChangeController.respond);

export default router;
