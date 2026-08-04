import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { upload } from '../middleware/upload.middleware';
import { verificationController } from '../controllers/verification.controller';

const router = Router();

// Worker verification flow — mounted under /workers/verification
router.get('/config', authenticate, verificationController.getConfig);
router.post('/start', authenticate, requireRole('WORKER'), verificationController.start);
router.post('/documents', authenticate, requireRole('WORKER'), upload.single('file'), verificationController.uploadDocument);
router.post('/submit', authenticate, requireRole('WORKER'), verificationController.submit);
router.get('/current', authenticate, requireRole('WORKER'), verificationController.getCurrent);
router.get('/documents/:mediaId', authenticate, verificationController.getDocument); // worker-owner or ADMIN

export default router;
