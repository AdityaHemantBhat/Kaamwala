import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { riskController } from '../controllers/risk.controller';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/anomalies', riskController.getAnomalies);
router.get('/flagged-cancellations', riskController.getFlaggedCancellations);
router.patch('/cancellations/:id/resolve', riskController.resolveFlag);

export default router;
