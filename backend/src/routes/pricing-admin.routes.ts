import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { pricingAdminController } from '../controllers/pricing-admin.controller';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/market', pricingAdminController.getMarket);
router.get('/seed', pricingAdminController.getSeeds);
router.put('/seed', pricingAdminController.putSeeds);
router.get('/floors', pricingAdminController.getFloors);
router.put('/floors', pricingAdminController.putFloors);
router.get('/urgent-settings', pricingAdminController.getUrgentSettings);
router.put('/urgent-settings', pricingAdminController.putUrgentSettings);
router.get('/audit', pricingAdminController.getAudit);
router.put('/kill-switch', pricingAdminController.putKillSwitch);
router.get('/client-version', pricingAdminController.getClientVersion);
router.put('/client-version', pricingAdminController.putClientVersion);

export default router;
