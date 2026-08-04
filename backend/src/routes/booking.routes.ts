import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { bookingController } from '../controllers/booking.controller';

const router = Router();

router.patch('/:id/status', authenticate, bookingController.updateStatus);
router.post('/:id/cancel/confirm', authenticate, bookingController.confirmCancel);
router.post('/:id/cancel/deny', authenticate, bookingController.denyCancel);
router.post('/:id/send-arrival-otp', authenticate, bookingController.sendArrivalOtp);
router.get('/', authenticate, bookingController.getBookings);
router.get('/active', authenticate, bookingController.getActiveBooking);
router.post('/', authenticate, bookingController.createBooking);
router.get('/:id', authenticate, bookingController.getBookingById);
router.get('/:id/contact', authenticate, bookingController.getContactDetails);
router.get('/:id/messages', authenticate, bookingController.getMessages);

export default router;
