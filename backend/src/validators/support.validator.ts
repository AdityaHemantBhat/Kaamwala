import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  bookingId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
});

export const replySchema = z.object({
  message: z.string().min(1).max(5000),
  imageUrl: z.string().optional(),
});
