import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { requireMinVersion } from '../middleware/version.middleware';
import { requestsController } from '../controllers/requests.controller';
import { createRequestSchema, getRecommendationSchema } from '../validators';

const router = Router();

router.post(
  '/',
  authenticate, requireRole('CUSTOMER'), requireMinVersion(),
  validateRequest(createRequestSchema),
  requestsController.createRequest,
);

router.post(
  '/recommendation',
  authenticate, requireRole('CUSTOMER'), requireMinVersion(),
  validateRequest(getRecommendationSchema),
  requestsController.getRecommendation,
);

router.get('/', authenticate, requestsController.listMyRequests);
router.delete('/:id', authenticate, requestsController.deleteRequest);
router.get('/browse', authenticate, requireRole('WORKER'), requestsController.browseRequests);
router.get('/worker/accepted', authenticate, requireRole('WORKER'), requestsController.getAcceptedRequests);
router.post('/:id/quote', authenticate, requireRole('WORKER'), requireMinVersion(), requestsController.quoteOnRequest);
router.post('/:id/counter', authenticate, requireRole('CUSTOMER'), requireMinVersion(), requestsController.counterOffer);
router.get('/:id/offers', authenticate, requestsController.getOffers);
router.post('/:id/interest', authenticate, requireRole('WORKER'), requestsController.expressInterest);
router.get('/:id/interests', authenticate, requestsController.getInterests);
router.post('/:id/accept', authenticate, requireMinVersion(), requestsController.acceptInterest);
router.post('/:id/create-booking', authenticate, requireMinVersion(), requestsController.createBookingFromRequest);

export default router;
