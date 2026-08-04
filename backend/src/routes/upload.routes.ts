import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { upload } from '../middleware/upload.middleware';
import { uploadController } from '../controllers/upload.controller';

const router = Router();

router.post('/', authenticate, upload.single('file'), uploadController.uploadFile);
router.post('/cleanup-orphans', authenticate, requireRole('ADMIN'), uploadController.cleanupOrphans);
router.delete('/self', authenticate, uploadController.deleteOwnMedia);
router.get('/admin/media', authenticate, requireRole('ADMIN'), uploadController.listMedia);
router.delete('/admin/media/:id', authenticate, requireRole('ADMIN'), uploadController.deleteMedia);

export default router;
