import { z } from 'zod';

export const listSnacksSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    category: z.enum(['SWEET', 'SAVOURY', 'DRINK', 'HEALTHY_ISH']).optional(),
    status: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(['name', 'category', 'quantity', 'createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const snackIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid snack ID format'),
  }),
});

export const createSnackSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
    category: z.enum(['SWEET', 'SAVOURY', 'DRINK', 'HEALTHY_ISH'], {
      errorMap: () => ({ message: 'Category must be one of SWEET, SAVOURY, DRINK, HEALTHY_ISH' }),
    }),
    quantity: z.number().int('Quantity must be an integer').min(0, 'Quantity cannot be negative').default(0),
    lowStockThreshold: z
      .number()
      .int('Threshold must be an integer')
      .min(0, 'Threshold cannot be negative')
      .default(5),
  }),
});

export const updateSnackSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid snack ID format'),
  }),
  body: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      category: z.enum(['SWEET', 'SAVOURY', 'DRINK', 'HEALTHY_ISH']).optional(),
      quantity: z.number().int('Quantity must be an integer').min(0, 'Quantity cannot be negative').optional(),
      lowStockThreshold: z
        .number()
        .int('Threshold must be an integer')
        .min(0, 'Threshold cannot be negative')
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

export const consumeSnackSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid snack ID format'),
  }),
  body: z.object({
    amount: z.number().int('Amount must be an integer').positive('Amount must be a positive integer').default(1),
  }),
});

export const restockSnackSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid snack ID format'),
  }),
  body: z.object({
    amount: z.number().int('Amount must be an integer').positive('Amount must be a positive integer'),
  }),
});
