import { ActivityActionType, SnackCategoryType, SnackStatusType } from '../types';

export const WS_EVENTS = {
  // Stock events
  SNACK_CREATED: 'SNACK_CREATED',
  SNACK_UPDATED: 'SNACK_UPDATED',
  SNACK_DELETED: 'SNACK_DELETED',
  SNACK_CONSUMED: 'SNACK_CONSUMED',
  SNACK_RESTOCKED: 'SNACK_RESTOCKED',

  // Voting events
  SNACK_VOTED: 'SNACK_VOTED',
  SNACK_UNVOTED: 'SNACK_UNVOTED',

  // Lifecycle & heartbeat events
  PING: 'PING',
  PONG: 'PONG',
  ERROR: 'ERROR',
  AUTH_SUCCESS: 'AUTH_SUCCESS',

  // Legacy compatibility aliases
  STOCK_UPDATED: 'SNACK_CONSUMED',
  VOTE_UPDATED: 'SNACK_VOTED',
} as const;

export type WsEventType = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface WebSocketEventEnvelope<T = any> {
  id: string;
  type: WsEventType;
  snackId: string;
  timestamp: string;
  payload: T;
}

export interface SnackPayload {
  id: string;
  name: string;
  category: SnackCategoryType;
  quantity: number;
  lowStockThreshold: number;
  status: SnackStatusType;
  voteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockEventPayload {
  snackId: string;
  name: string;
  quantity: number;
  lowStockThreshold: number;
  status: SnackStatusType;
  action: ActivityActionType;
  amount: number;
  voteCount?: number;
  updatedAt?: string;
}

export interface VoteEventPayload {
  snackId: string;
  totalVotes: number;
}

export interface DeleteEventPayload {
  snackId: string;
}

export interface WebSocketMessage<T = any> {
  type: WsEventType | string;
  payload?: T;
  timestamp?: string;
}
