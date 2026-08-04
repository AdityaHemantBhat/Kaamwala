import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinVersion } from '../middleware/version.middleware';
import { urgentController } from '../controllers/urgent.controller';

const router = Router();

router.use(requireMinVersion());

router.post('/preview', authenticate, urgentController.previewUrgent);
router.post('/request', authenticate, urgentController.requestUrgent);
router.post('/increase-offer', authenticate, urgentController.increaseOffer);
router.post('/cancel', authenticate, urgentController.cancelUrgent);
router.post('/accept', authenticate, urgentController.acceptUrgent);

export default router;
