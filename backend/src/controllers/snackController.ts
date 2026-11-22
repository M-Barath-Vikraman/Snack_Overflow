import { Request, Response, NextFunction } from 'express';
import { snackService } from '../services/snackService';
import { consumeService } from '../services/consumeService';
import { voteService } from '../services/voteService';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../middleware/errorMiddleware';

export class SnackController {
  /**
   * GET /api/snacks
   * Server-side search, filtering by category and status, pagination, sorting.
   */
  public async listSnacks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUserId = req.user?.userId;
      const result = await snackService.listSnacks(req.query as any, currentUserId);
      sendSuccess(res, result, 'Snacks retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/snacks/summary
   * Dashboard inventory totals and Snack of the Week.
   */
  public async getSummary(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await snackService.getSummary();
      sendSuccess(res, summary, 'Dashboard summary retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/snacks/:id
   * Single snack with derived status and vote info.
   */
  public async getSnackById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUserId = req.user?.userId;
      const snack = await snackService.getSnackById(req.params.id, currentUserId);
      sendSuccess(res, snack, 'Snack retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/snacks
   * Admin-only: Create a new snack item.
   */
  public async createSnack(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const snack = await snackService.createSnack(req.body);
      sendSuccess(res, snack, 'Snack created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/snacks/:id
   * Admin-only: Update permitted snack fields.
   */
  public async updateSnack(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const snack = await snackService.updateSnack(req.params.id, req.body);
      sendSuccess(res, snack, 'Snack updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/snacks/:id
   * Admin-only: Delete snack if relationships permit.
   */
  public async deleteSnack(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await snackService.deleteSnack(req.params.id);
      sendSuccess(res, null, 'Snack deleted successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/snacks/:id/consume
   * Authenticated: Atomic snack consumption with Idempotency-Key support.
   */
  public async consumeSnack(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const idempotencyKey = req.header('Idempotency-Key') || undefined;

      const result = await consumeService.consume({
        snackId: req.params.id,
        userId: req.user.userId,
        amount: req.body.amount,
        idempotencyKey,
      });

      if (result.isIdempotentReplay) {
        res.setHeader('X-Idempotent-Replay', 'true');
      }

      sendSuccess(res, result, 'Snack consumed successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/snacks/:id/restock
   * Admin-only: Restock snack quantity atomically.
   */
  public async restockSnack(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const result = await snackService.restockSnack(
        req.params.id,
        req.user.userId,
        req.body.amount
      );

      sendSuccess(res, result, 'Snack restocked successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/snacks/:id/vote
   * Authenticated: Cast vote for a snack.
   */
  public async castVote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const result = await voteService.castVote({
        snackId: req.params.id,
        userId: req.user.userId,
      });

      sendSuccess(res, result, 'Vote recorded successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/snacks/:id/vote
   * Authenticated: Remove vote for a snack.
   */
  public async removeVote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const result = await voteService.removeVote({
        snackId: req.params.id,
        userId: req.user.userId,
      });

      sendSuccess(res, result, 'Vote removed successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const snackController = new SnackController();
