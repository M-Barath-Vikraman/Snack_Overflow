import { ActivityActionType, SnackStatusType } from '../types';

export const WS_EVENTS = {
  // Client to Server
  SUBSCRIBE: 'SUBSCRIBE',
  UNSUBSCRIBE: 'UNSUBSCRIBE',
  PING: 'PING',

  // Server to Client
  PONG: 'PONG',
  STOCK_UPDATED: 'STOCK_UPDATED',
  VOTE_UPDATED: 'VOTE_UPDATED',
  ERROR: 'ERROR',
} as const;

export type WsEventType = typeof WS_EVENTS[keyof typeof WS_EVENTS];

export interface StockUpdatePayload {
  snackId: string;
  name: string;
  quantity: number;
  lowStockThreshold: number;
  status: SnackStatusType;
  action: ActivityActionType;
  amount: number;
  timestamp: string;
}

export interface VoteUpdatePayload {
  snackId: string;
  totalVotes: number;
  timestamp: string;
}

export interface WebSocketMessage<T = any> {
  type: WsEventType;
  payload?: T;
  timestamp: string;
}
