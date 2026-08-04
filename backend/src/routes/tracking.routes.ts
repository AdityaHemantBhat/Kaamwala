import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { trackingController } from '../controllers/tracking.controller';

const router = Router();

router.post('/location', authenticate, trackingController.updateLocation);
router.get('/:bookingId', authenticate, trackingController.getLocation);
router.get('/:bookingId/history', authenticate, trackingController.getLocationHistory);
router.put('/:bookingId/arrived', authenticate, trackingController.markArrived);
router.get('/:bookingId/route', authenticate, trackingController.getRoute);

export default router;
