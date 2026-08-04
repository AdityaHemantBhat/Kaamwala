import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const reviewController = {
  createReview: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId, rating, comment } = req.body;
      if (!bookingId || !rating || rating < 1 || rating > 5) {
        return sendError(res, 400, 'Rating must be between 1 and 5');
      }

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== req.user!.userId) return sendError(res, 403, 'Not your booking');
      if (booking.status !== 'COMPLETED') return sendError(res, 400, 'Booking not completed yet');

      const existing = await prisma.review.findUnique({ where: { bookingId } });
      if (existing) return sendError(res, 400, 'Already reviewed');

      const review = await prisma.review.create({
        data: {
          bookingId,
          authorId: req.user!.userId,
          targetId: booking.workerId,
          rating,
          comment: comment || '',
        },
      });

      const allRatings = await prisma.review.findMany({
        where: { targetId: booking.workerId },
        select: { rating: true },
      });
      const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

      await prisma.workerProfile.update({
        where: { userId: booking.workerId },
        data: {
          rating: Math.round(avg * 10) / 10,
          totalRatings: allRatings.length,
        },
      });

      sendResponse(res, 201, review, 'Review submitted!');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getWorkerReviews: async (req: AuthRequest, res: Response) => {
    try {
      const reviews = await prisma.review.findMany({
        where: { targetId: req.params.workerId },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      sendResponse(res, 200, reviews);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
