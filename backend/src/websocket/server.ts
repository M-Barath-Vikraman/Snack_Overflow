import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { verifyToken } from '../utils/jwt';
import { UserPayload } from '../types';
import { WS_EVENTS, WebSocketEventEnvelope, WsEventType } from './events';
import { isOriginAllowed } from '../config/cors';

export interface AuthenticatedClientInfo {
  user: UserPayload;
  connectedAt: Date;
}

export class SnackWebSocketServer {
  private static instance: SnackWebSocketServer;
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, AuthenticatedClientInfo> = new Map();

  private constructor() {}

  public static getInstance(): SnackWebSocketServer {
    if (!SnackWebSocketServer.instance) {
      SnackWebSocketServer.instance = new SnackWebSocketServer();
    }
    return SnackWebSocketServer.instance;
  }

  public init(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({
      server,
      verifyClient: (info, callback) => {
        const origin =
          info.origin && info.origin.length > 0
            ? info.origin
            : (info.req.headers.origin as string | undefined);

        if (!isOriginAllowed(origin)) {
          logger.warn(`WebSocket connection rejected: Origin ${origin} not allowed by CORS`);
          return callback(false, 403, `Origin ${origin} not allowed by CORS`);
        }
        return callback(true);
      },
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      // 1. Authenticate connection via JWT in query string or Sec-WebSocket-Protocol header
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url || '', `http://${host}`);
      let token = url.searchParams.get('token');

      if (!token && req.headers['sec-websocket-protocol']) {
        const protocols = req.headers['sec-websocket-protocol'].split(',');
        token = protocols[0].trim();
      }

      if (!token) {
        logger.warn('WebSocket connection rejected: Missing authentication token');
        ws.close(4401, 'Unauthorized: Missing authentication token');
        return;
      }

      let user: UserPayload;
      try {
        user = verifyToken(token);
      } catch (err: any) {
        logger.warn(`WebSocket connection rejected: ${err.message || 'Invalid or expired token'}`);
        ws.close(4401, `Unauthorized: ${err.message || 'Invalid or expired token'}`);
        return;
      }

      // 2. Register authenticated connection
      this.clients.set(ws, {
        user,
        connectedAt: new Date(),
      });
      logger.info(
        `WebSocket client authenticated: user=${user.email} (role=${user.role}). Total active: ${this.clients.size}`
      );

      // Send initial authentication success confirmation
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: WS_EVENTS.AUTH_SUCCESS,
            id: `evt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
            timestamp: new Date().toISOString(),
            payload: {
              userId: user.userId,
              email: user.email,
              role: user.role,
            },
          })
        );
      }

      // 3. Handle messages (Heartbeat / Ping-Pong)
      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === WS_EVENTS.PING) {
            ws.send(
              JSON.stringify({
                type: WS_EVENTS.PONG,
                id: `evt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
                timestamp: new Date().toISOString(),
              })
            );
          }
        } catch (err) {
          logger.warn('Failed to parse incoming WebSocket message', err);
        }
      });

      // 4. Handle client disconnection
      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info(`WebSocket client disconnected. Total active: ${this.clients.size}`);
      });

      // 5. Handle socket errors
      ws.on('error', (err) => {
        logger.error('WebSocket connection error:', err);
        this.clients.delete(ws);
      });
    });

    logger.info('WebSocket server initialized with JWT handshake authentication');
    return this.wss;
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public getClientInfo(ws: WebSocket): AuthenticatedClientInfo | undefined {
    return this.clients.get(ws);
  }

  /**
   * Broadcast an event to all connected, authenticated clients.
   * Ensures standardized event envelope:
   * - type
   * - id (unique)
   * - timestamp (ISO)
   * - snackId
   * - payload
   */
  public broadcast<T>(event: {
    type: WsEventType;
    snackId: string;
    payload: T;
  }): void {
    if (!this.wss || this.clients.size === 0) return;

    const envelope: WebSocketEventEnvelope<T> = {
      id: `evt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      type: event.type,
      snackId: event.snackId,
      timestamp: new Date().toISOString(),
      payload: event.payload,
    };

    const message = JSON.stringify(envelope);

    this.clients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Cleanly closes all client connections (primarily used for test teardown).
   */
  public closeAll(): void {
    this.clients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutting down');
      }
    });
    this.clients.clear();
  }
}

export const wsServer = SnackWebSocketServer.getInstance();
