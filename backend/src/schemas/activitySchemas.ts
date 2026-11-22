import { z } from 'zod';

export const listActivitiesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    action: z.enum(['CONSUMED', 'RESTOCKED']).optional(),
    search: z.string().trim().optional(),
    sortBy: z.enum(['createdAt', 'amount']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});
