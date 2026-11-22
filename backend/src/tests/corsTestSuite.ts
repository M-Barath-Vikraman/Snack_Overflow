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

  // Test 2: Configured origin is accepted
  const configured = getAllowedOrigins();
  assert(configured.length > 0, `At least one allowed origin configured: [${configured.join(', ')}]`);

  for (const origin of configured) {
    assert(isOriginAllowed(origin) === true, `Configured origin '${origin}' is explicitly accepted`);
    assert(
      isOriginAllowed(`${origin}/`) === true,
      `Configured origin with trailing slash '${origin}/' is normalized and accepted`
    );
  }

  // Test 3: Localhost development origins are accepted
  assert(isOriginAllowed('http://localhost:5173') === true, 'http://localhost:5173 accepted');
  assert(isOriginAllowed('http://localhost:8080') === true, 'http://localhost:8080 accepted');
  assert(isOriginAllowed('http://127.0.0.1:3000') === true, 'http://127.0.0.1:3000 accepted');

  // Test 4: Unrelated & unauthorized origins are rejected
  assert(
    isOriginAllowed('https://evil-hacker.com') === false,
    'Unrelated origin https://evil-hacker.com is strictly rejected'
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

  console.log('\n--- 2. HTTP CORS Middleware Integration Tests ---');

  // Ensure server is listening on an ephemeral port
  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(0, resolve));
  }
  const port = (server.address() as AddressInfo).port;

  const validTestOrigin = configured[0] || 'http://localhost:5173';
  const unauthorizedOrigin = 'https://unauthorized-attacker.example.com';

  // Test 5: HTTP GET with configured origin
  const resAllowed = await makeHttpRequest(port, '/health', 'GET', {
    Origin: validTestOrigin,
  });
  assert(resAllowed.statusCode === 200, 'HTTP GET /health with allowed origin returns 200 OK');
  assert(
    resAllowed.headers['access-control-allow-origin'] === validTestOrigin,
    `Response returns Access-Control-Allow-Origin matching '${validTestOrigin}'`
  );
  assert(
    resAllowed.headers['access-control-allow-credentials'] === 'true',
    'Response returns Access-Control-Allow-Credentials: true'
  );

  // Test 6: HTTP OPTIONS preflight request with configured origin
  const resPreflight = await makeHttpRequest(port, '/api/auth/login', 'OPTIONS', {
    Origin: validTestOrigin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type, Authorization',
  });
  assert(
    resPreflight.statusCode === 204 || resPreflight.statusCode === 200,
    'Preflight OPTIONS request returns 204/200'
  );
  assert(
    resPreflight.headers['access-control-allow-origin'] === validTestOrigin,
    'Preflight returns Access-Control-Allow-Origin for configured origin'
  );

  // Test 7: HTTP GET with unauthorized origin is rejected
  const resRejected = await makeHttpRequest(port, '/health', 'GET', {
    Origin: unauthorizedOrigin,
  });
  // CORS rejection in Express either returns error (500) or does NOT return Access-Control-Allow-Origin
  const allowOriginHeader = resRejected.headers['access-control-allow-origin'];
  assert(
    allowOriginHeader !== unauthorizedOrigin,
    `Unauthorized origin '${unauthorizedOrigin}' does not receive Access-Control-Allow-Origin`
  );

  // Test 8: HTTP GET without Origin header behaves normally
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

  // Test 9: WebSocket with configured origin succeeds
  const wsAllowed = await new Promise<boolean>((resolve) => {
    const ws = new WebSocket(`${wsBaseUrl}?token=${dummyToken}`, {
      headers: { Origin: validTestOrigin },
    });
    ws.on('open', () => {
      ws.close();
      resolve(true);
    });
    ws.on('error', () => resolve(false));
  });
  assert(wsAllowed === true, `WebSocket connection with configured origin '${validTestOrigin}' succeeds`);

  // Test 10: WebSocket with unauthorized origin is rejected with HTTP 403
  const wsRejectedResult = await new Promise<{ rejected: boolean; code?: number }>((resolve) => {
    const ws = new WebSocket(`${wsBaseUrl}?token=${dummyToken}`, {
      headers: { Origin: unauthorizedOrigin },
    });
    ws.on('open', () => {
      ws.close();
      resolve({ rejected: false });
    });
    ws.on('unexpected-response', (_req, res) => {
      resolve({ rejected: true, code: res.statusCode });
    });
    ws.on('error', (err: any) => {
      // Node ws throws on unexpected 403 response
      resolve({ rejected: true, code: err.message?.includes('403') ? 403 : undefined });
    });
  });
  assert(
    wsRejectedResult.rejected === true,
    `WebSocket connection with unauthorized origin '${unauthorizedOrigin}' is rejected`
  );
  if (wsRejectedResult.code) {
    assert(wsRejectedResult.code === 403, 'WebSocket rejected handshake with HTTP 403 Forbidden');
  }

  // Test 11: WebSocket without Origin header succeeds
  const wsNoOrigin = await new Promise<boolean>((resolve) => {
    const ws = new WebSocket(`${wsBaseUrl}?token=${dummyToken}`);
    ws.on('open', () => {
      ws.close();
      resolve(true);
    });
    ws.on('error', () => resolve(false));
  });
  assert(wsNoOrigin === true, 'WebSocket connection without Origin header succeeds');

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
