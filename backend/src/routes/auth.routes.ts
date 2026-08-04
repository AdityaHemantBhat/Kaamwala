import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/send-otp', authLimiter, authController.sendOtp);
router.post('/verify-otp', authLimiter, authController.verifyOtp);
// Refresh performs a bcrypt-compare per attempt — rate-limit it to prevent
// cheap CPU/DB hammering on unauthenticated requests.
router.post('/refresh', authLimiter, authController.refresh);
router.post('/logout', authLimiter, authController.logout);
router.put('/profile', authenticate, authController.updateProfile);

export { router as authRouter };
