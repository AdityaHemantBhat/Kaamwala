import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { workerSubscriptionController } from '../controllers/worker-subscription.controller';

const router = Router();

router.get('/plans', workerSubscriptionController.getPlans);
router.get('/my', authenticate, workerSubscriptionController.getMySubscription);
router.post('/create-order', authenticate, workerSubscriptionController.createOrder);
router.post('/verify', authenticate, workerSubscriptionController.verifyPayment);
router.post('/cancel', authenticate, workerSubscriptionController.cancelSubscription);
router.post('/create-boost-order', authenticate, workerSubscriptionController.createBoostOrder);
router.post('/verify-boost', authenticate, workerSubscriptionController.verifyBoost);
router.get('/earnings-projection', authenticate, workerSubscriptionController.getEarningsProjection);

export default router;
