process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { app, server } from '../app';
import { config } from '../config/env';
import { isOriginAllowed, getAllowedOrigins } from '../config/cors';
import { generateToken } from '../utils/jwt';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedCount++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedCount++;
    console.log(`  ✔ PASS: ${message}`);
  }
}

function makeHttpRequest(
  port: number,
  path: string,
  method: string = 'GET',
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function testWebSocketOrigin(
  wsBaseUrl: string,
  token: string,
  origin?: string
): Promise<{ success: boolean; statusCode?: number }> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    if (origin !== undefined) {
      headers['Origin'] = origin;
    }

    const ws = new WebSocket(`${wsBaseUrl}?token=${token}`, { headers });

    ws.on('open', () => {
      ws.close();
      resolve({ success: true, statusCode: 101 });
    });

    ws.on('unexpected-response', (_req, res) => {
      resolve({ success: false, statusCode: res.statusCode });
    });

    ws.on('error', (err: any) => {
      const code = err.message?.includes('403') ? 403 : undefined;
      resolve({ success: false, statusCode: code });
    });
  });
}

async function runCorsTestSuite() {
  console.log('================================================================');
  console.log('       SNACK OVERFLOW — CORS & ORIGIN VALIDATION TEST SUITE     ');
  console.log('================================================================\n');

  console.log('--- 1. Origin Policy & Normalization Unit Tests ---');

  // Test 1: Requests without Origin header are allowed
  assert(
    isOriginAllowed(undefined) === true,
    'Requests without an Origin header (curl, mobile, server-to-server) are permitted'
  );
  assert(
    isOriginAllowed('') === true,
    'Empty Origin header is treated safely as no origin and permitted'
  );

  // Test 2: Localhost and 127.0.0.1 development origins are accepted
  assert(isOriginAllowed('http://localhost:5173') === true, 'localhost origin http://localhost:5173 is accepted');
  assert(isOriginAllowed('http://localhost:3000') === true, 'localhost origin http://localhost:3000 is accepted');
  assert(isOriginAllowed('http://localhost:8080') === true, 'localhost origin http://localhost:8080 is accepted');
  assert(isOriginAllowed('http://127.0.0.1:5173') === true, '127.0.0.1 origin http://127.0.0.1:5173 is accepted');
  assert(isOriginAllowed('http://127.0.0.1:3000') === true, '127.0.0.1 origin http://127.0.0.1:3000 is accepted');

  // Test 3: Configured local LAN development origin is accepted
  const lanDevOrigin = 'http://172.23.192.1:5173';
  // Ensure lanDevOrigin is present in allowed origins via FRONTEND_ORIGIN
  process.env.FRONTEND_ORIGIN = `http://localhost:5173,${lanDevOrigin}`;
  assert(
    getAllowedOrigins().includes(lanDevOrigin),
    `Configured local LAN development origin '${lanDevOrigin}' is present in getAllowedOrigins()`
  );
  assert(
    isOriginAllowed(lanDevOrigin) === true,
    `Configured local LAN development origin '${lanDevOrigin}' is accepted`
  );
  assert(
    isOriginAllowed(`${lanDevOrigin}/`) === true,
    `Configured local LAN development origin with trailing slash '${lanDevOrigin}/' is accepted`
  );

  // Test 4: Configured production frontend origin is accepted
  const prodOrigin = 'https://snack-overflow-frontend-production-fdb918f5.up.railway.app';
  process.env.FRONTEND_ORIGIN = `http://localhost:5173,${lanDevOrigin},${prodOrigin}`;
  assert(
    getAllowedOrigins().includes(prodOrigin),
    `Configured production frontend origin '${prodOrigin}' is present in getAllowedOrigins()`
  );
  assert(
    isOriginAllowed(prodOrigin) === true,
    `Configured production frontend origin '${prodOrigin}' is accepted`
  );
  assert(
    isOriginAllowed(`${prodOrigin}/`) === true,
    `Configured production frontend origin with trailing slash '${prodOrigin}/' is accepted`
  );

  // Test 5: Rejection of unrelated & unauthorized external origins
  const unauthorizedOrigin = 'https://unauthorized-attacker.example.com';
  assert(
    isOriginAllowed('https://evil-hacker.com') === false,
    'Unrelated external origin https://evil-hacker.com is strictly rejected'
  );
  assert(
    isOriginAllowed(unauthorizedOrigin) === false,
    `Unrelated external origin ${unauthorizedOrigin} is strictly rejected`
  );
  assert(
    isOriginAllowed('https://random-unauthorized-app.railway.app') === false,
    'Unrelated Railway app origin is strictly rejected'
  );
  assert(
    isOriginAllowed('http://not-localhost.com:8080') === false,
    'Deceptive hostname http://not-localhost.com:8080 is rejected'
  );
  assert(isOriginAllowed('null') === false, "String 'null' origin is rejected");
  assert(isOriginAllowed('*') === false, "Wildcard '*' origin is rejected");

  console.log('\n--- 2. HTTP CORS Middleware Integration Tests ---');

  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(0, resolve));
  }
  const port = (server.address() as AddressInfo).port;

  // Test 6: HTTP request from localhost frontend origin
  const resLocalhost = await makeHttpRequest(port, '/health', 'GET', {
    Origin: 'http://localhost:5173',
  });
  assert(resLocalhost.statusCode === 200, 'HTTP GET /health from http://localhost:5173 returns 200 OK');
  assert(
    resLocalhost.headers['access-control-allow-origin'] === 'http://localhost:5173',
    'Response returns Access-Control-Allow-Origin: http://localhost:5173'
  );
  assert(
    resLocalhost.headers['access-control-allow-credentials'] === 'true',
    'Response returns Access-Control-Allow-Credentials: true'
  );

  // Test 7: HTTP request from 127.0.0.1 frontend origin
  const resLoopback = await makeHttpRequest(port, '/health', 'GET', {
    Origin: 'http://127.0.0.1:5173',
  });
  assert(resLoopback.statusCode === 200, 'HTTP GET /health from http://127.0.0.1:5173 returns 200 OK');
  assert(
    resLoopback.headers['access-control-allow-origin'] === 'http://127.0.0.1:5173',
    'Response returns Access-Control-Allow-Origin: http://127.0.0.1:5173'
  );

  // Test 8: HTTP request from configured local LAN development origin
  const resLan = await makeHttpRequest(port, '/health', 'GET', {
    Origin: lanDevOrigin,
  });
  assert(resLan.statusCode === 200, `HTTP GET /health from LAN origin ${lanDevOrigin} returns 200 OK`);
  assert(
    resLan.headers['access-control-allow-origin'] === lanDevOrigin,
    `Response returns Access-Control-Allow-Origin: ${lanDevOrigin}`
  );

  // Test 9: HTTP request from configured production frontend origin
  const resProd = await makeHttpRequest(port, '/health', 'GET', {
    Origin: prodOrigin,
  });
  assert(resProd.statusCode === 200, `HTTP GET /health from production origin ${prodOrigin} returns 200 OK`);
  assert(
    resProd.headers['access-control-allow-origin'] === prodOrigin,
    `Response returns Access-Control-Allow-Origin: ${prodOrigin}`
  );

  // Test 10: HTTP preflight OPTIONS request
  const resPreflight = await makeHttpRequest(port, '/api/auth/login', 'OPTIONS', {
    Origin: lanDevOrigin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type, Authorization',
  });
  assert(
    resPreflight.statusCode === 204 || resPreflight.statusCode === 200,
    'Preflight OPTIONS request returns 204/200'
  );
  assert(
    resPreflight.headers['access-control-allow-origin'] === lanDevOrigin,
    `Preflight returns Access-Control-Allow-Origin matching LAN origin ${lanDevOrigin}`
  );

  // Test 11: HTTP request with unauthorized origin is rejected
  const resRejected = await makeHttpRequest(port, '/health', 'GET', {
    Origin: unauthorizedOrigin,
  });
  assert(
    resRejected.headers['access-control-allow-origin'] !== unauthorizedOrigin,
    `Unauthorized origin '${unauthorizedOrigin}' does not receive Access-Control-Allow-Origin`
  );

  // Test 12: HTTP request without Origin header succeeds
  const resNoOrigin = await makeHttpRequest(port, '/health', 'GET');
  assert(resNoOrigin.statusCode === 200, 'HTTP GET /health without Origin header succeeds with 200 OK');
  assert(
    !resNoOrigin.headers['access-control-allow-origin'],
    'No Access-Control-Allow-Origin header attached when Origin is omitted'
  );

  console.log('\n--- 3. WebSocket Origin Validation Integration Tests ---');

  const wsBaseUrl = `ws://127.0.0.1:${port}`;
  const dummyToken = generateToken({
    userId: '00000000-0000-0000-0000-000000000001',
    email: 'cors_test@snackoverflow.com',
    role: 'MEMBER',
  });

  // Test 13: WebSocket with localhost origin succeeds
  const wsLocalhost = await testWebSocketOrigin(wsBaseUrl, dummyToken, 'http://localhost:5173');
  assert(wsLocalhost.success === true, 'WebSocket connection with origin http://localhost:5173 succeeds');

  // Test 14: WebSocket with 127.0.0.1 origin succeeds
  const wsLoopback = await testWebSocketOrigin(wsBaseUrl, dummyToken, 'http://127.0.0.1:5173');
  assert(wsLoopback.success === true, 'WebSocket connection with origin http://127.0.0.1:5173 succeeds');

  // Test 15: WebSocket with configured local LAN origin succeeds
  const wsLan = await testWebSocketOrigin(wsBaseUrl, dummyToken, lanDevOrigin);
  assert(wsLan.success === true, `WebSocket connection with configured LAN origin '${lanDevOrigin}' succeeds`);

  // Test 16: WebSocket with configured production origin succeeds
  const wsProd = await testWebSocketOrigin(wsBaseUrl, dummyToken, prodOrigin);
  assert(wsProd.success === true, `WebSocket connection with configured production origin '${prodOrigin}' succeeds`);

  // Test 17: WebSocket with unauthorized origin is rejected with HTTP 403
  const wsRejected = await testWebSocketOrigin(wsBaseUrl, dummyToken, unauthorizedOrigin);
  assert(
    wsRejected.success === false,
    `WebSocket connection with unauthorized origin '${unauthorizedOrigin}' is rejected`
  );
  assert(
    wsRejected.statusCode === 403,
    'WebSocket rejected unauthorized origin handshake with HTTP 403 Forbidden'
  );

  // Test 18: WebSocket without Origin header succeeds
  const wsNoOrigin = await testWebSocketOrigin(wsBaseUrl, dummyToken, undefined);
  assert(wsNoOrigin.success === true, 'WebSocket connection without Origin header succeeds');

  console.log('\n================================================================');
  console.log(`CORS & ORIGIN TESTS PASSED: ${passedCount} / ${passedCount + failedCount}`);
  console.log('================================================================\n');

  // Close server cleanly
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

runCorsTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in CORS test suite:', err);
    process.exit(1);
  });
