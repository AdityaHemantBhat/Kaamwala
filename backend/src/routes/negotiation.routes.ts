import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { negotiationController } from '../controllers/negotiation.controller';
import { makeOfferSchema } from '../validators';

const router = Router();

router.get('/:bookingId', authenticate, negotiationController.getNegotiation);
router.post(
  '/:bookingId/make-offer',
  authenticate,
  validateRequest(makeOfferSchema),
  negotiationController.makeOffer,
);
router.post('/:bookingId/accept', authenticate, negotiationController.acceptOffer);
router.post('/:bookingId/reject', authenticate, negotiationController.rejectNegotiation);

export default router;
