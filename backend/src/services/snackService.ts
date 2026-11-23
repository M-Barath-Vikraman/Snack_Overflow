import { Prisma, SnackCategory } from '@prisma/client';
import { prisma } from '../config/database';
import { deriveSnackStatus, SnackCategoryType, SnackStatusType } from '../types';
import { AppError } from '../middleware/errorMiddleware';
import { wsServer } from '../websocket/server';
import { WS_EVENTS } from '../websocket/events';
import { storageService } from './storageService';
import { validateImageSignature } from '../utils/fileValidation';

export interface ListSnacksParams {
  search?: string;
  category?: SnackCategoryType;
  status?: SnackStatusType;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'category' | 'quantity' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface SnackWithDetails {
  id: string;
  name: string;
  category: SnackCategoryType;
  quantity: number;
  lowStockThreshold: number;
  status: SnackStatusType;
  imageUrl?: string | null;
  imagePath?: string | null;
  voteCount: number;
  hasUserVoted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export class SnackService {
  /**
   * Server-side paginated, filtered, and sorted list of snacks.
   * Status is dynamically derived and filtered in PostgreSQL without in-memory filtering.
   */
  public async listSnacks(params: ListSnacksParams, currentUserId?: string): Promise<{
    snacks: SnackWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const offset = (page - 1) * limit;
    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Build conditions safely for Prisma.sql
    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(Prisma.sql`s.name ILIKE ${searchPattern}`);
    }

    if (params.category) {
      conditions.push(Prisma.sql`s.category = ${params.category}::"SnackCategory"`);
    }

    if (params.status) {
      if (params.status === 'IN_STOCK') {
        conditions.push(Prisma.sql`s.quantity > s."lowStockThreshold"`);
      } else if (params.status === 'LOW_STOCK') {
        conditions.push(Prisma.sql`s.quantity > 0 AND s.quantity <= s."lowStockThreshold"`);
      } else if (params.status === 'OUT_OF_STOCK') {
        conditions.push(Prisma.sql`s.quantity <= 0`);
      }
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    // Sorting column mapping (whitelisted)
    let orderBySql = Prisma.sql`s."createdAt" DESC`;
    if (sortBy === 'name') {
      orderBySql = sortOrder === 'ASC' ? Prisma.sql`s.name ASC` : Prisma.sql`s.name DESC`;
    } else if (sortBy === 'category') {
      orderBySql = sortOrder === 'ASC' ? Prisma.sql`s.category ASC` : Prisma.sql`s.category DESC`;
    } else if (sortBy === 'quantity') {
      orderBySql = sortOrder === 'ASC' ? Prisma.sql`s.quantity ASC` : Prisma.sql`s.quantity DESC`;
    } else if (sortBy === 'createdAt') {
      orderBySql = sortOrder === 'ASC' ? Prisma.sql`s."createdAt" ASC` : Prisma.sql`s."createdAt" DESC`;
    }

    // 1. Total matching count query
    const countResult = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "Snack" s
      WHERE ${whereClause};
    `;
    const total = countResult[0]?.count || 0;

    // 2. Paginated data query with vote tallies
    const rawSnacks = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        category: SnackCategoryType;
        quantity: number;
        lowStockThreshold: number;
        imageUrl: string | null;
        imagePath: string | null;
        createdAt: Date;
        updatedAt: Date;
        voteCount: number;
      }>
    >`
      SELECT 
        s.id,
        s.name,
        s.category,
        s.quantity,
        s."lowStockThreshold",
        s."imageUrl",
        s."imagePath",
        s."createdAt",
        s."updatedAt",
        COALESCE(COUNT(v.id), 0)::int AS "voteCount"
      FROM "Snack" s
      LEFT JOIN "Vote" v ON s.id = v."snackId"
      WHERE ${whereClause}
      GROUP BY s.id
      ORDER BY ${orderBySql}
      LIMIT ${limit} OFFSET ${offset};
    `;

    // 3. User vote flags (if user is authenticated)
    let userVotedSnackIds: Set<string> = new Set();
    if (currentUserId && rawSnacks.length > 0) {
      const snackIds = rawSnacks.map((s) => s.id);
      const userVotes = await prisma.vote.findMany({
        where: {
          userId: currentUserId,
          snackId: { in: snackIds },
        },
        select: { snackId: true },
      });
      userVotedSnackIds = new Set(userVotes.map((v) => v.snackId));
    }

    const snacks: SnackWithDetails[] = rawSnacks.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      quantity: s.quantity,
      lowStockThreshold: s.lowStockThreshold,
      status: deriveSnackStatus(s.quantity, s.lowStockThreshold),
      imageUrl: s.imageUrl || null,
      imagePath: s.imagePath || null,
      voteCount: s.voteCount,
      hasUserVoted: currentUserId ? userVotedSnackIds.has(s.id) : undefined,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return {
      snacks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single snack by ID with vote information and derived status.
   */
  public async getSnackById(id: string, currentUserId?: string): Promise<SnackWithDetails> {
    const snack = await prisma.snack.findUnique({
      where: { id },
      include: {
        _count: {
          select: { votes: true },
        },
        votes: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : false,
      },
    });

    if (!snack) {
      throw new AppError('Snack not found', 404, 'NOT_FOUND');
    }

    return {
      id: snack.id,
      name: snack.name,
      category: snack.category as SnackCategoryType,
      quantity: snack.quantity,
      lowStockThreshold: snack.lowStockThreshold,
      status: deriveSnackStatus(snack.quantity, snack.lowStockThreshold),
      imageUrl: snack.imageUrl || null,
      imagePath: snack.imagePath || null,
      voteCount: snack._count.votes,
      hasUserVoted: currentUserId ? (snack.votes as any[])?.length > 0 : undefined,
      createdAt: snack.createdAt.toISOString(),
      updatedAt: snack.updatedAt.toISOString(),
    };
  }

  /**
   * Admin-only: Create a new snack.
   */
  public async createSnack(data: {
    name: string;
    category: SnackCategory;
    quantity: number;
    lowStockThreshold: number;
  }): Promise<SnackWithDetails> {
    // Check for duplicate name
    const existing = await prisma.snack.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new AppError('A snack with this name already exists', 409, 'DUPLICATE_NAME');
    }

    const created = await prisma.snack.create({
      data: {
        name: data.name,
        category: data.category,
        quantity: data.quantity,
        lowStockThreshold: data.lowStockThreshold,
      },
    });

    const status = deriveSnackStatus(created.quantity, created.lowStockThreshold);
    const snackResult: SnackWithDetails = {
      id: created.id,
      name: created.name,
      category: created.category as SnackCategoryType,
      quantity: created.quantity,
      lowStockThreshold: created.lowStockThreshold,
      status,
      imageUrl: created.imageUrl || null,
      imagePath: created.imagePath || null,
      voteCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    // Broadcast snack creation post-commit
    wsServer.broadcast({
      type: WS_EVENTS.SNACK_CREATED,
      snackId: created.id,
      payload: {
        snack: snackResult,
      },
    });

    return snackResult;
  }

  /**
   * Admin-only: Update permitted snack fields.
   */
  public async updateSnack(
    id: string,
    data: {
      name?: string;
      category?: SnackCategory;
      quantity?: number;
      lowStockThreshold?: number;
    }
  ): Promise<SnackWithDetails> {
    // Verify existence
    const existing = await prisma.snack.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Snack not found', 404, 'NOT_FOUND');
    }

    // Check unique name constraint if name is changing
    if (data.name && data.name !== existing.name) {
      const nameTaken = await prisma.snack.findUnique({
        where: { name: data.name },
      });
      if (nameTaken) {
        throw new AppError('A snack with this name already exists', 409, 'DUPLICATE_NAME');
      }
    }

    const updated = await prisma.snack.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { votes: true },
        },
      },
    });

    const status = deriveSnackStatus(updated.quantity, updated.lowStockThreshold);
    const result: SnackWithDetails = {
      id: updated.id,
      name: updated.name,
      category: updated.category as SnackCategoryType,
      quantity: updated.quantity,
      lowStockThreshold: updated.lowStockThreshold,
      status,
      imageUrl: updated.imageUrl || null,
      imagePath: updated.imagePath || null,
      voteCount: updated._count.votes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    // Broadcast snack update post-commit
    wsServer.broadcast({
      type: WS_EVENTS.SNACK_UPDATED,
      snackId: updated.id,
      payload: {
        snack: result,
      },
    });

    return result;
  }

  /**
   * Admin-only: Delete snack.
   * If historical Activity records exist, relation restriction will prevent deletion.
   */
  public async deleteSnack(id: string): Promise<void> {
    const existing = await prisma.snack.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Snack not found', 404, 'NOT_FOUND');
    }

    const imagePathToDelete = existing.imagePath;

    try {
      await prisma.snack.delete({
        where: { id },
      });

      // Clean up associated image in storage after successful database deletion
      if (imagePathToDelete) {
        await storageService.deleteSnackImage(imagePathToDelete);
      }

      // Broadcast snack deletion post-commit
      wsServer.broadcast({
        type: WS_EVENTS.SNACK_DELETED,
        snackId: id,
        payload: {
          snackId: id,
        },
      });
    } catch (err: any) {
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2003' || err.code === 'P2014')) ||
        err.message?.includes('violates RESTRICT setting') ||
        err.message?.includes('foreign key constraint') ||
        err.message?.includes('23001')
      ) {
        throw new AppError(
          'Cannot delete snack because it has associated historical consumption/restock records',
          409,
          'RESTRICTED_BY_ACTIVITY_HISTORY'
        );
      }
      throw err;
    }
  }

  /**
   * Admin-only: Upload or replace image for snack.
   * Handles:
   * 1. Validating snack existence.
   * 2. Validating file signature (magic bytes) for JPEG, PNG, WebP.
   * 3. Uploading new image with unique storage path.
   * 4. Updating database record. If DB update fails, cleans up the new upload.
   * 5. If previous image existed, deleting previous image from storage after DB update succeeds.
   * 6. Broadcasting SNACK_UPDATED via WebSocket post-commit.
   */
  public async uploadSnackImage(
    snackId: string,
    fileBuffer: Buffer,
    currentUserId?: string
  ): Promise<SnackWithDetails> {
    const existing = await prisma.snack.findUnique({
      where: { id: snackId },
      include: {
        _count: { select: { votes: true } },
        votes: currentUserId
          ? { where: { userId: currentUserId }, select: { id: true } }
          : false,
      },
    });

    if (!existing) {
      throw new AppError('Snack not found', 404, 'NOT_FOUND');
    }

    // Validate file magic bytes
    const validation = validateImageSignature(fileBuffer);
    if (!validation.isValid || !validation.extension || !validation.mimeType) {
      throw new AppError(
        validation.error || 'Invalid file format. Only JPEG, PNG, and WebP images are allowed.',
        400,
        'INVALID_FILE_TYPE'
      );
    }

    // 1. Upload new image using a unique path
    const uploadResult = await storageService.uploadSnackImage(
      snackId,
      fileBuffer,
      validation.extension,
      validation.mimeType
    );

    const oldImagePath = existing.imagePath;

    // 2. Update database record
    let updated;
    try {
      updated = await prisma.snack.update({
        where: { id: snackId },
        data: {
          imageUrl: uploadResult.publicUrl,
          imagePath: uploadResult.storagePath,
        },
        include: {
          _count: { select: { votes: true } },
          votes: currentUserId
            ? { where: { userId: currentUserId }, select: { id: true } }
            : false,
        },
      });
    } catch (dbError) {
      // 4. Clean up the new upload if the database update fails
      await storageService.deleteSnackImage(uploadResult.storagePath);
      throw dbError;
    }

    // 3. Delete previous image only after the database update succeeds
    if (oldImagePath) {
      await storageService.deleteSnackImage(oldImagePath);
    }

    const result: SnackWithDetails = {
      id: updated.id,
      name: updated.name,
      category: updated.category as SnackCategoryType,
      quantity: updated.quantity,
      lowStockThreshold: updated.lowStockThreshold,
      status: deriveSnackStatus(updated.quantity, updated.lowStockThreshold),
      imageUrl: updated.imageUrl,
      imagePath: updated.imagePath,
      voteCount: updated._count.votes,
      hasUserVoted: currentUserId ? (updated.votes as any[])?.length > 0 : undefined,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    // 5. Broadcast SNACK_UPDATED via WebSocket post-commit
    wsServer.broadcast({
      type: WS_EVENTS.SNACK_UPDATED,
      snackId: updated.id,
      payload: {
        snack: result,
      },
    });

    return result;
  }

  /**
   * Admin-only: Remove image for snack.
   * 1. Validates snack existence.
   * 2. Clears imageUrl and imagePath in the database.
   * 3. Deletes the previous image from storage safely.
   * 4. Broadcasts SNACK_UPDATED via WebSocket.
   * 5. Returns the updated snack.
   */
  public async removeSnackImage(
    snackId: string,
    currentUserId?: string
  ): Promise<SnackWithDetails> {
    const existing = await prisma.snack.findUnique({
      where: { id: snackId },
      include: {
        _count: { select: { votes: true } },
        votes: currentUserId
          ? { where: { userId: currentUserId }, select: { id: true } }
          : false,
      },
    });

    if (!existing) {
      throw new AppError('Snack not found', 404, 'NOT_FOUND');
    }

    const oldImagePath = existing.imagePath;

    const updated = await prisma.snack.update({
      where: { id: snackId },
      data: {
        imageUrl: null,
        imagePath: null,
      },
      include: {
        _count: { select: { votes: true } },
        votes: currentUserId
          ? { where: { userId: currentUserId }, select: { id: true } }
          : false,
      },
    });

    if (oldImagePath) {
      await storageService.deleteSnackImage(oldImagePath);
    }

    const result: SnackWithDetails = {
      id: updated.id,
      name: updated.name,
      category: updated.category as SnackCategoryType,
      quantity: updated.quantity,
      lowStockThreshold: updated.lowStockThreshold,
      status: deriveSnackStatus(updated.quantity, updated.lowStockThreshold),
      imageUrl: null,
      imagePath: null,
      voteCount: updated._count.votes,
      hasUserVoted: currentUserId ? (updated.votes as any[])?.length > 0 : undefined,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    // Broadcast SNACK_UPDATED via WebSocket post-commit
    wsServer.broadcast({
      type: WS_EVENTS.SNACK_UPDATED,
      snackId: updated.id,
      payload: {
        snack: result,
      },
    });

    return result;
  }

  /**
   * Admin-only: Restock snack atomically.
   */
  public async restockSnack(id: string, userId: string, amount: number): Promise<SnackWithDetails> {
    if (amount <= 0) {
      throw new AppError('Restock amount must be a positive integer', 400, 'INVALID_AMOUNT');
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Atomic increment in PostgreSQL
      const updatedRows = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          category: SnackCategoryType;
          quantity: number;
          lowStockThreshold: number;
          imageUrl: string | null;
          imagePath: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        UPDATE "Snack"
        SET "quantity" = "quantity" + ${amount}, "updatedAt" = NOW()
        WHERE "id" = ${id}
        RETURNING id, name, category, quantity, "lowStockThreshold", "imageUrl", "imagePath", "createdAt", "updatedAt";
      `;

      if (updatedRows.length === 0) {
        throw new AppError('Snack not found', 404, 'NOT_FOUND');
      }

      const updated = updatedRows[0];

      // 2. Create Activity record in same transaction
      await tx.activity.create({
        data: {
          userId,
          snackId: id,
          action: 'RESTOCKED',
          amount,
        },
      });

      // 3. Count votes
      const voteCount = await tx.vote.count({ where: { snackId: id } });

      return {
        ...updated,
        voteCount,
      };
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    const status = deriveSnackStatus(result.quantity, result.lowStockThreshold);

    // Broadcast stock update after transaction commits
    wsServer.broadcast({
      type: WS_EVENTS.SNACK_RESTOCKED,
      snackId: result.id,
      payload: {
        snackId: result.id,
        name: result.name,
        quantity: result.quantity,
        lowStockThreshold: result.lowStockThreshold,
        status,
        action: 'RESTOCKED',
        amount,
        voteCount: result.voteCount,
        updatedAt: result.updatedAt.toISOString(),
      },
    });

    return {
      id: result.id,
      name: result.name,
      category: result.category,
      quantity: result.quantity,
      lowStockThreshold: result.lowStockThreshold,
      status,
      imageUrl: result.imageUrl || null,
      imagePath: result.imagePath || null,
      voteCount: result.voteCount,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  /**
   * Dashboard Summary:
   * Total snacks, stock status breakdown, and Snack of the Week.
   */
  public async getSummary(): Promise<{
    totalSnacks: number;
    inStockCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    snackOfTheWeek: {
      id: string;
      name: string;
      category: SnackCategoryType;
      quantity: number;
      lowStockThreshold: number;
      status: SnackStatusType;
      voteCount: number;
    } | null;
  }> {
    // 1. Aggregation counts in PostgreSQL
    const counts = await prisma.$queryRaw<
      Array<{
        totalCount: number;
        inStockCount: number;
        lowStockCount: number;
        outOfStockCount: number;
      }>
    >`
      SELECT 
        COUNT(*)::int AS "totalCount",
        COUNT(CASE WHEN "quantity" > "lowStockThreshold" THEN 1 END)::int AS "inStockCount",
        COUNT(CASE WHEN "quantity" > 0 AND "quantity" <= "lowStockThreshold" THEN 1 END)::int AS "lowStockCount",
        COUNT(CASE WHEN "quantity" <= 0 THEN 1 END)::int AS "outOfStockCount"
      FROM "Snack";
    `;

    const summaryCounts = counts[0] || {
      totalCount: 0,
      inStockCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    };

    // 2. Snack of the Week (Most voted, deterministic tie-breaking: voteCount DESC, lastVotedAt DESC, name ASC)
    const sotwResult = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        category: SnackCategoryType;
        quantity: number;
        lowStockThreshold: number;
        voteCount: number;
      }>
    >`
      SELECT 
        s.id,
        s.name,
        s.category,
        s.quantity,
        s."lowStockThreshold",
        COUNT(v.id)::int AS "voteCount",
        MAX(v."createdAt") AS "lastVotedAt"
      FROM "Snack" s
      JOIN "Vote" v ON s.id = v."snackId"
      GROUP BY s.id
      HAVING COUNT(v.id) > 0
      ORDER BY "voteCount" DESC, "lastVotedAt" DESC, s.name ASC
      LIMIT 1;
    `;

    let snackOfTheWeek = null;
    if (sotwResult.length > 0) {
      const winner = sotwResult[0];
      snackOfTheWeek = {
        id: winner.id,
        name: winner.name,
        category: winner.category,
        quantity: winner.quantity,
        lowStockThreshold: winner.lowStockThreshold,
        status: deriveSnackStatus(winner.quantity, winner.lowStockThreshold),
        voteCount: winner.voteCount,
      };
    }

    return {
      totalSnacks: summaryCounts.totalCount,
      inStockCount: summaryCounts.inStockCount,
      lowStockCount: summaryCounts.lowStockCount,
      outOfStockCount: summaryCounts.outOfStockCount,
      snackOfTheWeek,
    };
  }
}

export const snackService = new SnackService();
