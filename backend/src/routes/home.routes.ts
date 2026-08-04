import { Router } from 'express';
import { homeController } from '../controllers/home.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, homeController.getHomeData);
router.get('/categories', homeController.getCategories);

export default router;
