import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { subscriptionController } from '../controllers/subscription.controller';

const router = Router();

router.get('/plans', subscriptionController.getPlans);
router.get('/my', authenticate, subscriptionController.getMySubscription);
router.post('/create-order', authenticate, subscriptionController.createOrder);
router.post('/verify', authenticate, subscriptionController.verifyPayment);
router.post('/cancel', authenticate, subscriptionController.cancelSubscription);

export default router;
