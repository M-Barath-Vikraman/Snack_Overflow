declare global {
  interface Window {
    __APP_CONFIG__?: {
      API_BASE_URL?: string;
      WS_URL?: string;
    };
  }
}

/**
 * Retrieves the API Base URL strictly from window.__APP_CONFIG__ at runtime.
 * Throws a descriptive configuration error if missing or invalid.
 * Does NOT rely on build-time environment variables or localhost fallbacks.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error('Window context is unavailable. Runtime API configuration requires a browser environment.');
  }

  const runtimeConfig = window.__APP_CONFIG__;
  if (!runtimeConfig) {
    throw new Error(
      'Missing runtime configuration: "window.__APP_CONFIG__" is undefined. ' +
      'Please ensure /config.js is properly loaded before application initialization.'
    );
  }

  const apiUrl = runtimeConfig.API_BASE_URL;
  if (!apiUrl || typeof apiUrl !== 'string' || apiUrl.trim() === '') {
    throw new Error(
      'Invalid runtime API configuration: "API_BASE_URL" is missing or empty in window.__APP_CONFIG__. ' +
      'Please ensure public/config.js defines a valid API endpoint.'
    );
  }

  return apiUrl.trim();
}

/**
 * Retrieves the WebSocket URL strictly from window.__APP_CONFIG__ at runtime.
 * Throws a descriptive configuration error if missing or invalid.
 * Does NOT rely on build-time environment variables or localhost fallbacks.
 */
export function getWsUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error('Window context is unavailable. Runtime WebSocket configuration requires a browser environment.');
  }

  const runtimeConfig = window.__APP_CONFIG__;
  if (!runtimeConfig) {
    throw new Error(
      'Missing runtime configuration: "window.__APP_CONFIG__" is undefined. ' +
      'Please ensure /config.js is properly loaded before application initialization.'
    );
  }

  const wsUrl = runtimeConfig.WS_URL;
  if (!wsUrl || typeof wsUrl !== 'string' || wsUrl.trim() === '') {
    throw new Error(
      'Invalid runtime WebSocket configuration: "WS_URL" is missing or empty in window.__APP_CONFIG__. ' +
      'Please ensure public/config.js defines a valid WebSocket endpoint.'
    );
  }

  return wsUrl.trim();
}
