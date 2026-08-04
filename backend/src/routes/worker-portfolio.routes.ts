import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { workerPortfolioController } from '../controllers/worker-portfolio.controller';

const router = Router();

router.get('/', authenticate, workerPortfolioController.getPhotos);
router.post('/', authenticate, workerPortfolioController.addPhoto);
router.delete('/:id', authenticate, workerPortfolioController.deletePhoto);

export default router;
