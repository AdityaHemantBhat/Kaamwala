import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { referralController } from '../controllers/referral.controller';

const router = Router();

router.get('/code', authenticate, referralController.getCode);
router.post('/apply', authenticate, referralController.applyCode);
router.get('/stats', authenticate, referralController.getStats);
router.get('/leaderboard', authenticate, referralController.getLeaderboard);

export default router;
