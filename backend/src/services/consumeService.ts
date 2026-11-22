import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { deriveSnackStatus, SnackCategoryType, SnackStatusType } from '../types';
import { AppError } from '../middleware/errorMiddleware';
import { wsServer } from '../websocket/server';
import { WS_EVENTS } from '../websocket/events';

export interface ConsumeResult {
  snack: {
    id: string;
    name: string;
    category: SnackCategoryType;
    quantity: number;
    lowStockThreshold: number;
    status: SnackStatusType;
    voteCount: number;
    updatedAt: string;
  };
  activity: {
    id: string;
    action: 'CONSUMED';
    amount: number;
    createdAt: string;
  };
  isIdempotentReplay?: boolean;
}

export class ConsumeService {
  /**
   * Atomically consumes a specified amount of snack units.
   * Enforces non-negative stock at PostgreSQL level.
   * Full Idempotency-Key support with transaction rollback, replay safety, and expired key reuse.
   */
  public async consume(params: {
    snackId: string;
    userId: string;
    amount: number;
    idempotencyKey?: string;
  }): Promise<ConsumeResult> {
    const { snackId, userId, amount, idempotencyKey } = params;

    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new AppError('Consumption amount must be a positive integer', 400, 'INVALID_AMOUNT');
    }

    const requestPath = `/api/snacks/${snackId}/consume`;
    const payloadHash = JSON.stringify({ snackId, amount });

    // 1. Fast read for unexpired completed key replay
    if (idempotencyKey) {
      const existingRecord = await prisma.idempotencyKey.findUnique({
        where: {
          userId_key: {
            userId,
            key: idempotencyKey,
          },
        },
      });

      if (existingRecord) {
        const isExpired = existingRecord.expiresAt && existingRecord.expiresAt < new Date();

        if (!isExpired) {
          // If in progress (incomplete)
          if (!existingRecord.responseStatus || !existingRecord.responseBody) {
            throw new AppError(
              'A request with this Idempotency-Key is currently in progress',
              409,
              'IDEMPOTENCY_IN_PROGRESS'
            );
          }

          // Verify payload matching to prevent key reuse with differing parameters
          const storedPayload = (existingRecord.responseBody as any)?._requestPayload;
          if (
            existingRecord.requestPath !== requestPath ||
            (storedPayload && storedPayload !== payloadHash)
          ) {
            throw new AppError(
              'Idempotency key reuse with different request parameters is forbidden',
              409,
              'IDEMPOTENCY_KEY_MISMATCH'
            );
          }

          // Return stored original response (replay)
          const cached = existingRecord.responseBody as any;
          return {
            ...cached,
            isIdempotentReplay: true,
          };
        }
      }
    }

    // 2. Execute Atomic Transaction in PostgreSQL
    const transactionResult = await prisma.$transaction(
      async (tx) => {
        let createdIdempId: string | null = null;

        // If idempotency key provided, handle expired key cleanup and reservation in transaction
        if (idempotencyKey) {
          // Delete only the exact expired record matching this user and key
          await tx.idempotencyKey.deleteMany({
            where: {
              userId,
              key: idempotencyKey,
              expiresAt: { lt: new Date() },
            },
          });

          try {
            const idemp = await tx.idempotencyKey.create({
              data: {
                key: idempotencyKey,
                userId,
                requestPath,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour TTL
              },
            });
            createdIdempId = idemp.id;
          } catch (err: any) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw new AppError(
                'A request with this Idempotency-Key is currently in progress',
                409,
                'IDEMPOTENCY_IN_PROGRESS'
              );
            }
            throw err;
          }
        }

        // 3. Conditional Atomic Stock Decrement in PostgreSQL
        // Row-level lock acquired by UPDATE prevents race conditions.
        const updatedRows = await tx.$queryRaw<
          Array<{
            id: string;
            name: string;
            category: SnackCategoryType;
            quantity: number;
            lowStockThreshold: number;
            createdAt: Date;
            updatedAt: Date;
          }>
        >`
          UPDATE "Snack"
          SET "quantity" = "quantity" - ${amount}, "updatedAt" = NOW()
          WHERE "id" = ${snackId} AND "quantity" >= ${amount}
          RETURNING id, name, category, quantity, "lowStockThreshold", "createdAt", "updatedAt";
        `;

        if (updatedRows.length === 0) {
          // Verify if snack exists or stock was insufficient
          const snackExists = await tx.snack.findUnique({
            where: { id: snackId },
            select: { id: true, quantity: true },
          });

          if (!snackExists) {
            throw new AppError('Snack not found', 404, 'NOT_FOUND');
          }

          // Insufficient stock: throws AppError, rolling back transaction completely
          // (No IdempotencyKey or Activity record is created!)
          throw new AppError('Someone beat you to the last packet!', 409, 'INSUFFICIENT_STOCK');
        }

        const updatedSnack = updatedRows[0];

        // 4. Create Activity Record in same transaction
        const activity = await tx.activity.create({
          data: {
            userId,
            snackId,
            action: 'CONSUMED',
            amount,
          },
        });

        // 5. Query vote count
        const voteCount = await tx.vote.count({ where: { snackId } });

        const status = deriveSnackStatus(updatedSnack.quantity, updatedSnack.lowStockThreshold);

        const result: ConsumeResult = {
          snack: {
            id: updatedSnack.id,
            name: updatedSnack.name,
            category: updatedSnack.category,
            quantity: updatedSnack.quantity,
            lowStockThreshold: updatedSnack.lowStockThreshold,
            status,
            voteCount,
            updatedAt: updatedSnack.updatedAt.toISOString(),
          },
          activity: {
            id: activity.id,
            action: 'CONSUMED',
            amount: activity.amount,
            createdAt: activity.createdAt.toISOString(),
          },
        };

        // 6. Complete Idempotency record with response payload
        if (idempotencyKey && createdIdempId) {
          await tx.idempotencyKey.update({
            where: { id: createdIdempId },
            data: {
              responseStatus: 200,
              responseBody: {
                ...result,
                _requestPayload: payloadHash,
              },
            },
          });
        }

        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 15000,
        timeout: 30000,
      }
    );

    // 7. Post-Commit WebSocket Broadcast
    wsServer.broadcast({
      type: WS_EVENTS.SNACK_CONSUMED,
      snackId: transactionResult.snack.id,
      payload: {
        snackId: transactionResult.snack.id,
        name: transactionResult.snack.name,
        quantity: transactionResult.snack.quantity,
        lowStockThreshold: transactionResult.snack.lowStockThreshold,
        status: transactionResult.snack.status,
        action: 'CONSUMED',
        amount,
        voteCount: transactionResult.snack.voteCount,
        updatedAt: transactionResult.snack.updatedAt,
      },
    });

    return transactionResult;
  }
}

export const consumeService = new ConsumeService();
