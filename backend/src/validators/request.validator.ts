import { z } from 'zod';

export const REQUEST_CATEGORY_ENUM = z.enum([
  'PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER',
  'PAINTER', 'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER',
  'COOK', 'TUTOR', 'SECURITY_GUARD', 'NURSE', 'BABYSITTER',
]);

export const createRequestSchema = z.object({
  body: z.object({
    title: z.string().min(5).max(100),
    description: z.string().min(10).max(2000),
    category: REQUEST_CATEGORY_ENUM,
    budget: z.number().positive().optional(),
    budgetType: z.enum(['fixed', 'negotiable', 'hourly']).default('negotiable'),
    pricingUnit: z.enum(['FLAT', 'PER_HOUR']).default('FLAT'),
    issueId: z.string().nullish(), // null = 'Other'
    scope: z.any().nullish(),
    images: z.array(z.string().url()).max(6).optional(),
    addressId: z.string().nullish(),
    recommendationExposed: z.boolean().optional(),
    city: z.string().optional(),
    pincode: z.string().optional(),
    scheduledDate: z.string().optional(),
  }),
});

export const getRecommendationSchema = z.object({
  body: z.object({
    category: REQUEST_CATEGORY_ENUM,
    pricingUnit: z.enum(['FLAT', 'PER_HOUR']).default('FLAT'),
    issueId: z.string().nullish(),
    scope: z.any().nullish(),
    addressId: z.string().nullish(),
    city: z.string().nullish(),
  }),
});
