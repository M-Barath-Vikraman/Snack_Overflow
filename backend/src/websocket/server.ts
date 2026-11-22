import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { WS_EVENTS, WebSocketMessage } from './events';

export class SnackWebSocketServer {
  private static instance: SnackWebSocketServer;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  private constructor() {}

  public static getInstance(): SnackWebSocketServer {
    if (!SnackWebSocketServer.instance) {
      SnackWebSocketServer.instance = new SnackWebSocketServer();
    }
    return SnackWebSocketServer.instance;
  }

  public init(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      logger.info(`WebSocket client connected. Total clients: ${this.clients.size}`);

      ws.on('message', (message: string) => {
        try {
          const parsed: WebSocketMessage = JSON.parse(message.toString());
          if (parsed.type === WS_EVENTS.PING) {
            ws.send(JSON.stringify({ type: WS_EVENTS.PONG, timestamp: new Date().toISOString() }));
          }
        } catch (err) {
          logger.warn('Failed to parse incoming WebSocket message', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info(`WebSocket client disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        logger.error('WebSocket connection error:', err);
      });
    });

    logger.info('WebSocket server initialized');
    return this.wss;
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast foundation - reserved for Phase 2 implementation.
   */
  public broadcast<T>(type: string, payload: T): void {
    if (!this.wss) return;
    const message = JSON.stringify({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

export const wsServer = SnackWebSocketServer.getInstance();
