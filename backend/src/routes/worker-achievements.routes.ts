import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { workerAchievementsController } from '../controllers/worker-achievements.controller';

const router = Router();

router.get('/', authenticate, workerAchievementsController.getAchievements);

export default router;
