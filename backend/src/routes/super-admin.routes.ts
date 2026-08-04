import { Router } from 'express';
import { superAdminController } from '../controllers/super-admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// The active broadcast banner is a READ shown to every logged-in user (the
// in-app marquee), so it must be registered BEFORE the super-admin role guard.
// The write endpoint (`broadcast`) stays SUPER_ADMIN-only below.
router.get('/active-broadcast', authenticate, superAdminController.getActiveBroadcast);

// All other super-admin routes require authentication + the dedicated SUPER_ADMIN role.
router.use(authenticate, requireRole('SUPER_ADMIN'));

router.get('/admins', superAdminController.getAdmins);
router.post('/make-admin', superAdminController.makeAdmin);
router.post('/remove-admin', superAdminController.removeAdmin);
router.post('/ban', superAdminController.banUser);
router.post('/unban', superAdminController.unbanUser);
router.get('/audit-log', superAdminController.getAuditLog);
router.get('/payment-config', superAdminController.getPaymentConfig);
router.post('/broadcast', superAdminController.broadcast);

export default router;
