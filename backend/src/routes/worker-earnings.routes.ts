import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { workerEarningsController } from '../controllers/worker-earnings.controller';

const router = Router();

router.get('/', authenticate, requireRole('WORKER'), workerEarningsController.getEarnings);
router.get('/report', authenticate, requireRole('WORKER'), workerEarningsController.getEarningsReport);
router.post('/withdraw', authenticate, requireRole('WORKER'), workerEarningsController.withdraw);
router.post('/goal', authenticate, requireRole('WORKER'), workerEarningsController.setGoal);
router.get('/goal', authenticate, requireRole('WORKER'), workerEarningsController.getGoal);

export default router;
