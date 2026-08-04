import { Router } from 'express';
import { workerController } from '../controllers/worker.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', workerController.getWorkers);
router.get('/stats', authenticate, workerController.getStats);
router.get('/profile/me', authenticate, workerController.getMyProfile);
router.put('/online', authenticate, workerController.setOnlineStatus);
router.get('/search', workerController.searchWorkers);
router.get('/verification', authenticate, workerController.getVerificationStatus);
router.post('/verification/request', authenticate, workerController.requestVerification);
router.post('/appeal-ban', authenticate, workerController.appealBan);
router.get('/ban-status', authenticate, workerController.getBanStatus);
router.get('/leaderboard', authenticate, workerController.getLeaderboard);
router.get('/:userId', workerController.getWorkerById);

export default router;
