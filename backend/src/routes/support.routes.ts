import { Router } from 'express';
import { supportController } from '../controllers/support.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

router.post('/', authenticate, supportController.createTicket);
router.get('/', authenticate, supportController.getUserTickets);
router.get('/admin/all', authenticate, requireRole('ADMIN'), supportController.adminGetAll);
router.patch('/:id/status', authenticate, requireRole('ADMIN'), supportController.adminUpdateStatus);
router.get('/:id', authenticate, supportController.getTicketDetails);
router.post('/:id/reply', authenticate, supportController.replyToTicket);

export default router;
