import { Router } from 'express';
import { reviewController } from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticate, reviewController.createReview);
router.get('/worker/:workerId', reviewController.getWorkerReviews);

export default router;