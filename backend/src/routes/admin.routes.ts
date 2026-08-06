import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { verificationAdminController } from '../controllers/verification-admin.controller';
import pushAdminController from '../controllers/push-admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, requireRole('ADMIN'));

router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.get('/workers/verifications', verificationAdminController.list);
router.get('/workers/verifications/:id', verificationAdminController.getDetail);
router.post('/workers/verifications/:id/review', verificationAdminController.review);
router.get('/workers/:userId', adminController.getWorkerDetails);
router.get('/bookings', adminController.getAllBookings);
router.get('/withdrawals', adminController.getWithdrawals);
router.put('/withdrawals/:id', adminController.processWithdrawal);
router.get('/tickets', adminController.getTickets);
router.get('/revenue', adminController.getRevenueStats);
router.get('/bans', adminController.getBans);
router.post('/bans/unban', adminController.unbanWorker);
router.get('/leads', adminController.getLeadsReport);
router.get('/users/search', adminController.searchUsers);
router.get('/users/:userId/audit', adminController.getUserAudit);

// Ban System
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.get('/banned-ips', adminController.getBannedIps);
router.delete('/banned-ips/:ip', adminController.unbanIp);

// Push Notifications
router.use('/push', pushAdminController);

export default router;
