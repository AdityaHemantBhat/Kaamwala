import { z } from 'zod';

export const createAddressSchema = z.object({
  body: z.object({
    label: z.string().default('Home'),
    line1: z.string().min(1, 'Address line 1 is required'),
    line2: z.string().optional(),
    landmark: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    pincode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    isDefault: z.boolean().optional(),
  }),
});
