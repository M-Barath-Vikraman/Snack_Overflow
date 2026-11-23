import { config } from './env';

/**
 * Returns an array of normalized allowed origins configured for the application.
 * Checks FRONTEND_ORIGIN and FRONTEND_URL from process.env and config.
 * Normalization removes trailing slashes and trims whitespace.
 * Wildcard '*' is strictly filtered out to prevent arbitrary origin acceptance.
 */
export function getAllowedOrigins(): string[] {
  const sources = [
    process.env.FRONTEND_ORIGIN,
    config.frontendOrigin,
    process.env.FRONTEND_URL,
    config.frontendUrl,
  ].filter((val): val is string => typeof val === 'string' && val.trim().length > 0);

  const rawOrigins = sources.join(',');
  return Array.from(
    new Set(
      rawOrigins
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter((origin) => origin.length > 0 && origin !== '*')
    )
  );
}

/**
 * Checks whether an incoming origin header is permitted by the application's CORS policy.
 *
 * Rules:
 * 1. Requests without an Origin header (e.g., server-to-server, curl, same-origin) are allowed.
 * 2. Exact match against normalized configured frontend origins (from FRONTEND_ORIGIN / FRONTEND_URL).
 * 3. Localhost and 127.0.0.1 origins are allowed for local development and Docker environments.
 * 4. Wildcard '*' and arbitrary origins are rejected.
 */
export function isOriginAllowed(origin?: string): boolean {
  // 1. Requests without an Origin header are permitted (direct tools, curl, internal container health checks)
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.trim().replace(/\/+$/, '');
  const allowedOrigins = getAllowedOrigins();

  // 2. Exact match against configured origins
  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // 3. Allow standard local development and Docker browser requests on standard hostnames
  if (
    /^http:\/\/localhost(:\d+)?$/.test(normalizedOrigin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(normalizedOrigin)
  ) {
    return true;
  }

  // 4. Reject all other origins
  return false;
}
