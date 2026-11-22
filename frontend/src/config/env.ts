declare global {
  interface Window {
    __APP_CONFIG__?: {
      API_BASE_URL?: string;
      WS_URL?: string;
    };
  }
}

/**
 * Retrieves the API Base URL at runtime.
 * Prioritizes window.__APP_CONFIG__.API_BASE_URL (runtime config from /config.js)
 * Falls back to Vite build-time env VITE_API_BASE_URL or default local development URL.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__APP_CONFIG__?.API_BASE_URL) {
    return window.__APP_CONFIG__.API_BASE_URL;
  }
  return (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3000/api';
}

/**
 * Retrieves the WebSocket URL at runtime.
 */
export function getWsUrl(): string {
  if (typeof window !== 'undefined' && window.__APP_CONFIG__?.WS_URL) {
    return window.__APP_CONFIG__.WS_URL;
  }
  return (import.meta.env.VITE_WS_URL as string) || 'ws://localhost:3000';
}
