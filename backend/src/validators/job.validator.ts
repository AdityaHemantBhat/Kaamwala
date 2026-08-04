import { z } from 'zod';

const JOB_CATEGORY_ENUM = z.enum([
  'PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER',
  'PAINTER', 'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER',
  'COOK', 'TUTOR', 'SECURITY_GUARD',
]);

export const createJobSchema = z.object({
  body: z.object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(100),
    description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
    category: JOB_CATEGORY_ENUM,
    price: z.number().positive('Price must be positive'),
    priceUnit: z.string().default('per visit'),
    city: z.string().optional(),
    pincode: z.string().optional(),
    estimatedHours: z.number().positive().optional(),
    skills: z.array(z.string()).optional(),
  }),
});

export const updateJobSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(100).optional(),
    description: z.string().min(10).max(2000).optional(),
    category: JOB_CATEGORY_ENUM.optional(),
    price: z.number().positive().optional(),
    priceUnit: z.string().optional(),
    city: z.string().optional(),
    pincode: z.string().optional(),
    estimatedHours: z.number().positive().optional(),
    skills: z.array(z.string()).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'COMPLETED']).optional(),
  }),
});

export const statusUpdateSchema = z.object({
  body: z.object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'COMPLETED']),
  }),
});
