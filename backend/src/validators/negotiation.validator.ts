import { z } from 'zod';

export const makeOfferSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    message: z.string().max(500).optional(),
  }),
});
