import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { mapsService } from '../services/maps.service';
import { emitToBooking } from '../services/socket.service';
import { notificationService } from '../services/notification.service';
import { devBackdoorsEnabled } from '../config/env';

export const trackingController = {
  updateLocation: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId, latitude, longitude, accuracy } = req.body;
      if (!bookingId || !latitude || !longitude) {
        return sendError(res, 400, 'bookingId, latitude, longitude required');
      }

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Not your booking');
      }

      if (!['ON_THE_WAY'].includes(booking.status)) {
        return sendError(res, 400, 'Booking is not in tracking state');
      }

      const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!workerProfile) return sendError(res, 404, 'Worker profile not found');

      const result = await mapsService.updateWorkerLocation(
        workerProfile.id, bookingId, latitude, longitude, accuracy
      );

      emitToBooking(bookingId, 'worker_location_updated', {
        lat: result.lat,
        lng: result.lng,
        eta: result.eta,
      });

      if (result.eta !== null) {
        const shouldAlert = await mapsService.checkEtaAlert(bookingId, result.eta);
        if (shouldAlert) {
          emitToBooking(bookingId, 'worker_almost_there', { eta: result.eta });
        }
      }

      sendResponse(res, 200, result);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getLocation: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Not your booking');
      }

      const location = await mapsService.getWorkerLocation(req.params.bookingId);

      const address = await prisma.address.findUnique({ where: { id: booking.addressId } });

      const isTracking = booking.status === 'ON_THE_WAY';

      sendResponse(res, 200, {
        workerLat: isTracking ? location.workerLat : null,
        workerLng: isTracking ? location.workerLng : null,
        workerEta: isTracking ? location.workerEta : null,
        arrivalOtp: booking.arrivalOtp || null,
        customerLat: address?.latitude,
        customerLng: address?.longitude,
        workerName: (await prisma.user.findUnique({ where: { id: booking.workerId }, select: { name: true } }))?.name,
      });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getLocationHistory: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Not your booking');
      }

      const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: booking.workerId } });
      if (!workerProfile) return sendError(res, 404, 'Worker not found');

      const history = await mapsService.getLocationHistory(workerProfile.id, req.params.bookingId);
      sendResponse(res, 200, history);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  markArrived: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking || booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Not your booking');
      }
      if (booking.status !== 'ON_THE_WAY') {
        return sendError(res, 400, 'Booking is not in tracking state');
      }

      // Arrival OTP — the customer's confirmation that the worker actually
      // arrived. Enforced here so this endpoint cannot bypass the canonical
      // IN_PROGRESS gate in bookingService.updateStatus.
      const { otp } = req.body;
      const devBackdoor = devBackdoorsEnabled && otp === '1234';
      if (booking.arrivalOtp !== otp && !devBackdoor) {
        return sendError(res, 400, 'Invalid arrival OTP');
      }

      await prisma.booking.update({
        where: { id: req.params.bookingId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });

      emitToBooking(req.params.bookingId, 'worker_arrived', { message: 'Worker has arrived!' });
      await notificationService.sendPushNotification(
        booking.customerId, 'Worker Has Arrived',
        'Your worker has arrived at your location. The job is starting now.',
        'booking_update', { bookingId: booking.id },
      ).catch(() => {});

      sendResponse(res, 200, null, 'Arrival confirmed, job started');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getRoute: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');
      // Location privacy (IDOR fix): the route discloses the worker's live GPS
      // and the customer's address — only booking participants may see it.
      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Not your booking');
      }

      const address = await prisma.address.findUnique({ where: { id: booking.addressId } });
      if (!address?.latitude || !address?.longitude || !booking.workerLat || !booking.workerLng) {
        return sendResponse(res, 200, null);
      }

      const route = await mapsService.getDirections(
        booking.workerLat, booking.workerLng,
        address.latitude, address.longitude
      );

      sendResponse(res, 200, route);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
