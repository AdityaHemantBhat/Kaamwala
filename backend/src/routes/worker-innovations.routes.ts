import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { workerInnovationsController } from '../controllers/worker-innovations.controller';

const router = Router();

router.get('/job-matches', authenticate, workerInnovationsController.getJobMatches);
router.get('/heatmap', authenticate, workerInnovationsController.getHeatmap);
router.get('/smart-pricing', authenticate, workerInnovationsController.getSmartPricing);
router.get('/challenges', authenticate, workerInnovationsController.getChallenges);
router.get('/crm', authenticate, workerInnovationsController.getCrm);

export default router;
