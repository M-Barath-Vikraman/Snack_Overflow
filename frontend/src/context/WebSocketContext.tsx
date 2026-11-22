import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { getWsUrl } from '../config/env';
import { useAuth } from './AuthContext';
import { WsConnectionStatus, WebSocketEvent } from '../types';

type EventCallback = (event: WebSocketEvent) => void;

interface WebSocketContextType {
  status: WsConnectionStatus;
  lastEvent: WebSocketEvent | null;
  subscribe: (eventType: string, callback: EventCallback) => () => void;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<WsConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isManuallyClosedRef = useRef<boolean>(false);

  // Clear timers helper
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        isManuallyClosedRef.current = true;
        socketRef.current.close(1000, 'User logged out');
        socketRef.current = null;
      }
      setStatus('disconnected');
      clearTimers();
      return;
    }

    // Do not duplicate active or opening sockets
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.CONNECTING ||
        socketRef.current.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    clearTimers();
    isManuallyClosedRef.current = false;
    setStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

    try {
      const baseWsUrl = getWsUrl();
      const wsUrlWithToken = `${baseWsUrl}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrlWithToken);
      socketRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStatus('connected');

        // Setup keep-alive heartbeat ping every 25s
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 25000);
      };

      ws.onmessage = (messageEvent) => {
        try {
          const parsed = JSON.parse(messageEvent.data);
          if (parsed.type === 'PONG') {
            return;
          }

          const event: WebSocketEvent = {
            id: parsed.id || `evt_${Date.now()}`,
            type: parsed.type,
            snackId: parsed.snackId || parsed.payload?.snackId || '',
            timestamp: parsed.timestamp || new Date().toISOString(),
            payload: parsed.payload,
          };

          setLastEvent(event);

          // Dispatch to specific event subscribers
          const specificSubs = subscribersRef.current.get(event.type);
          if (specificSubs) {
            specificSubs.forEach((cb) => {
              try {
                cb(event);
              } catch (err) {
                console.error(`Error in WebSocket listener for ${event.type}:`, err);
              }
            });
          }

          // Dispatch to wildcard subscribers
          const allSubs = subscribersRef.current.get('*');
          if (allSubs) {
            allSubs.forEach((cb) => {
              try {
                cb(event);
              } catch (err) {
                console.error('Error in wildcard WebSocket listener:', err);
              }
            });
          }
        } catch (err) {
          console.warn('Failed to parse incoming WebSocket message', err);
        }
      };

      ws.onclose = (event) => {
        if (pingIntervalRef.current) {
          window.clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // If closed intentionally or unauthenticated (code 4401 or 1008), do not reconnect automatically
        if (isManuallyClosedRef.current || event.code === 4401 || event.code === 1008) {
          setStatus('disconnected');
          socketRef.current = null;
          return;
        }

        setStatus('reconnecting');
        socketRef.current = null;

        // Exponential backoff with ceiling (1s, 2s, 4s, 8s, max 10s)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = (err) => {
        console.warn('WebSocket encountered error:', err);
      };
    } catch (err) {
      console.error('Failed to initialize WebSocket connection:', err);
      setStatus('disconnected');
    }
  }, [isAuthenticated, token, clearTimers]);

  // Connect / Disconnect whenever auth status or token changes
  useEffect(() => {
    connect();

    return () => {
      isManuallyClosedRef.current = true;
      clearTimers();
      if (socketRef.current) {
        socketRef.current.close(1000, 'App unmounted');
        socketRef.current = null;
      }
    };
  }, [connect, clearTimers]);

  // Manual reconnect handler
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (socketRef.current) {
      isManuallyClosedRef.current = true;
      socketRef.current.close();
      socketRef.current = null;
    }
    connect();
  }, [connect]);

  // Subscription management to prevent duplicate listeners and support unmount cleanup
  const subscribe = useCallback((eventType: string, callback: EventCallback): (() => void) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, new Set());
    }
    subscribersRef.current.get(eventType)!.add(callback);

    // Return cleanup function
    return () => {
      const set = subscribersRef.current.get(eventType);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          subscribersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ status, lastEvent, subscribe, reconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
