import { Router } from 'express';
import { jobController } from '../controllers/job.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { createJobSchema, updateJobSchema, statusUpdateSchema } from '../validators';

const router = Router();

router.post('/', authenticate, requireRole('WORKER'), validateRequest(createJobSchema), jobController.createJob);
router.get('/', authenticate, requireRole('WORKER'), jobController.listJobs);
router.get('/:id', authenticate, requireRole('WORKER'), jobController.getJob);
router.put('/:id', authenticate, requireRole('WORKER'), validateRequest(updateJobSchema), jobController.updateJob);
router.delete('/:id', authenticate, requireRole('WORKER'), jobController.deleteJob);
router.patch('/:id/status', authenticate, requireRole('WORKER'), validateRequest(statusUpdateSchema), jobController.updateJobStatus);

export default router;
