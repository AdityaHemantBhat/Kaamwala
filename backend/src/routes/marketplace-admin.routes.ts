import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { marketplaceAdminController } from '../controllers/marketplace-admin.controller';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/analytics', marketplaceAdminController.getAnalytics);
router.get('/flags', marketplaceAdminController.getFlags);
router.put('/flags/:flag', marketplaceAdminController.putFlag);
router.get('/observations', marketplaceAdminController.getObservations);

export default router;
