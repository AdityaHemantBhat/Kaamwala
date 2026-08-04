import { Router } from 'express';
import { emergencyController } from '../controllers/emergency.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/workers', authenticate, emergencyController.getWorkers);
router.post('/book', authenticate, emergencyController.bookEmergency);
router.post('/sos', authenticate, emergencyController.handleSOS);

export default router;
