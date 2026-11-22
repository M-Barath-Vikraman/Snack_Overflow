import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export interface ListActivitiesParams {
  page?: number;
  limit?: number;
  action?: 'CONSUMED' | 'RESTOCKED';
  search?: string;
  sortBy?: 'createdAt' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

export interface ActivityWithRelations {
  id: string;
  action: 'CONSUMED' | 'RESTOCKED';
  amount: number;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  snack: {
    id: string;
    name: string;
    category: string;
  };
}

export class ActivityService {
  /**
   * Retrieves paginated, filtered, and sorted activity history.
   * Access is strictly restricted to ADMIN users.
   */
  public async listActivities(params: ListActivitiesParams): Promise<{
    activities: ActivityWithRelations[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const sortBy = params.sortBy === 'amount' ? 'amount' : 'createdAt';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    // Build database WHERE criteria safely
    const where: Prisma.ActivityWhereInput = {};

    if (params.action) {
      where.action = params.action;
    }

    if (params.search && params.search.trim()) {
      const searchPattern = params.search.trim();
      where.OR = [
        {
          user: {
            name: {
              contains: searchPattern,
              mode: 'insensitive',
            },
          },
        },
        {
          user: {
            email: {
              contains: searchPattern,
              mode: 'insensitive',
            },
          },
        },
        {
          snack: {
            name: {
              contains: searchPattern,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    // Deterministic sorting with secondary id sort
    const orderBy: Prisma.ActivityOrderByWithRelationInput[] = [
      { [sortBy]: sortOrder },
      { id: 'desc' },
    ];

    // Execute count and paginated query in one transaction
    const [total, records] = await prisma.$transaction([
      prisma.activity.count({ where }),
      prisma.activity.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          action: true,
          amount: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          snack: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
        },
      }),
    ]);

    const activities: ActivityWithRelations[] = records.map((r) => ({
      id: r.id,
      action: r.action as 'CONSUMED' | 'RESTOCKED',
      amount: r.amount,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        role: r.user.role,
      },
      snack: {
        id: r.snack.id,
        name: r.snack.name,
        category: r.snack.category,
      },
    }));

    return {
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const activityService = new ActivityService();
