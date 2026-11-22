import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorMiddleware';
import { wsServer } from '../websocket/server';
import { WS_EVENTS } from '../websocket/events';

export class VoteService {
  /**
   * Cast a vote for a snack by the authenticated user.
   * Enforces single vote per user per snack via database unique constraint.
   */
  public async castVote(params: {
    snackId: string;
    userId: string;
  }): Promise<{ snackId: string; totalVotes: number; userVoted: boolean }> {
    const { snackId, userId } = params;

    // Verify snack exists
    const snack = await prisma.snack.findUnique({
      where: { id: snackId },
      select: { id: true },
    });
    if (!snack) {
      throw new AppError('Snack not found', 404, 'NOT_FOUND');
    }

    try {
      await prisma.vote.create({
        data: {
          userId,
          snackId,
        },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('User has already voted for this snack', 409, 'ALREADY_VOTED');
      }
      throw err;
    }

    const totalVotes = await prisma.vote.count({ where: { snackId } });

    // Broadcast vote update
    wsServer.broadcast(WS_EVENTS.VOTE_UPDATED, {
      snackId,
      totalVotes,
      timestamp: new Date().toISOString(),
    });

    return {
      snackId,
      totalVotes,
      userVoted: true,
    };
  }

  /**
   * Remove a vote previously cast by the authenticated user.
   */
  public async removeVote(params: {
    snackId: string;
    userId: string;
  }): Promise<{ snackId: string; totalVotes: number; userVoted: boolean }> {
    const { snackId, userId } = params;

    // Verify snack exists
    const snack = await prisma.snack.findUnique({
      where: { id: snackId },
      select: { id: true },
    });
    if (!snack) {
      throw new AppError('Snack not found', 404, 'NOT_FOUND');
    }

    try {
      await prisma.vote.delete({
        where: {
          userId_snackId: {
            userId,
            snackId,
          },
        },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new AppError('User has not voted for this snack', 404, 'VOTE_NOT_FOUND');
      }
      throw err;
    }

    const totalVotes = await prisma.vote.count({ where: { snackId } });

    // Broadcast vote update
    wsServer.broadcast(WS_EVENTS.VOTE_UPDATED, {
      snackId,
      totalVotes,
      timestamp: new Date().toISOString(),
    });

    return {
      snackId,
      totalVotes,
      userVoted: false,
    };
  }
}

export const voteService = new VoteService();
