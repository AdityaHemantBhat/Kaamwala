import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { workerServicesController } from '../controllers/worker-services.controller';

const router = Router();

// All service management is worker-own-only.
router.get('/', authenticate, workerServicesController.listMyServices);
router.post('/', authenticate, workerServicesController.createService);
router.put('/:id', authenticate, workerServicesController.updateService);
router.delete('/:id', authenticate, workerServicesController.deleteService);

export default router;
