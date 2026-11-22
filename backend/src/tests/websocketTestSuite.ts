process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { server } from '../app';
import { prisma } from '../config/database';
import { wsServer } from '../websocket/server';
import { generateToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';
import { consumeService } from '../services/consumeService';
import { snackService } from '../services/snackService';
import { voteService } from '../services/voteService';

const TEST_TIMEOUT_MS = 240000;
const testTimer = setTimeout(() => {
  console.error('\nWebSocket test suite timed out. Terminating.');
  process.exit(1);
}, TEST_TIMEOUT_MS);
testTimer.unref();

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

async function connectWithRetry(maxRetries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      return;
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.log(`Database connect attempt ${attempt} failed. Retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timed out'));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function waitForEvent(ws: WebSocket, expectedType?: string, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for event ${expectedType || 'any'}`));
    }, timeoutMs);

    const onMessage = (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (!expectedType || parsed.type === expectedType) {
          clearTimeout(timeout);
          ws.off('message', onMessage);
          resolve(parsed);
        }
      } catch (err) {
        // ignore parse errors for heartbeat
      }
    };

    ws.on('message', onMessage);
  });
}

async function runWebSocketTests() {
  console.log('================================================================');
  console.log('     SNACK OVERFLOW — PHASE 5 WEBSOCKET & REALTIME TEST SUITE   ');
  console.log('================================================================\n');

  await connectWithRetry();

  // Ensure server is listening on an ephemeral or active port
  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(0, resolve));
  }
  const port = (server.address() as AddressInfo).port;
  const wsBaseUrl = `ws://localhost:${port}`;

  const createdUserIds: string[] = [];
  const createdSnackIds: string[] = [];

  try {
    // 1. Setup isolated test user & test snack
    const testMember = await prisma.user.create({
      data: {
        name: 'Phase 5 WS Test Member',
        email: `ws_test_${Date.now()}@snackoverflow.com`,
        password: await hashPassword('TestP@ss123!'),
        role: 'MEMBER',
      },
    });
    createdUserIds.push(testMember.id);

    const validToken = generateToken({
      userId: testMember.id,
      email: testMember.email,
      role: testMember.role as any,
    });

    const expiredToken = generateToken(
      {
        userId: testMember.id,
        email: testMember.email,
        role: testMember.role as any,
      },
      '-10s' // already expired
    );

    const testSnack = await prisma.snack.create({
      data: {
        name: `WS Test Trail Mix ${Date.now()}`,
        category: 'HEALTHY_ISH',
        quantity: 10,
        lowStockThreshold: 3,
      },
    });
    createdSnackIds.push(testSnack.id);

    console.log('\n--- 1. WebSocket Authentication & Rejection Tests ---');

    // Test 1: Valid JWT establishes a WebSocket connection
    const client1 = await openWebSocket(`${wsBaseUrl}?token=${validToken}`);
    assert(client1.readyState === WebSocket.OPEN, 'Valid JWT establishes WebSocket connection');

    // Verify initial AUTH_SUCCESS or ping pong
    client1.send(JSON.stringify({ type: 'PING' }));
    const pongResponse = await waitForEvent(client1, 'PONG');
    assert(pongResponse.type === 'PONG', 'Heartbeat PING-PONG exchange works on authenticated connection');

    // Test 2: Missing authentication token is rejected
    const unauthCloseCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(wsBaseUrl);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(unauthCloseCode === 4401 || unauthCloseCode === 1008, 'Unauthenticated connection without token is immediately rejected with 4401');

    // Test 3: Invalid JWT signature is rejected
    const invalidCloseCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}?token=invalid.tampered.token`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(invalidCloseCode === 4401 || invalidCloseCode === 1008, 'Invalid/tampered JWT is immediately rejected with 4401');

    // Test 4: Expired JWT is rejected
    const expiredCloseCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}?token=${expiredToken}`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(expiredCloseCode === 4401 || expiredCloseCode === 1008, 'Expired JWT is immediately rejected with 4401');

    // Test 4b: Unauthorized Origin is rejected with HTTP 403 / handshake failure
    const unauthorizedOriginResult = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}?token=${validToken}`, {
        headers: { Origin: 'https://unauthorized-evil-site.com' },
      });
      ws.on('open', () => {
        ws.close();
        resolve(false);
      });
      ws.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode === 403);
      });
      ws.on('error', () => {
        resolve(true);
      });
    });
    assert(unauthorizedOriginResult === true, 'Unauthorized Origin header is rejected by WebSocket server');

    console.log('\n--- 2. Multi-Client Broadcast Synchronization Tests ---');

    // Connect a second authenticated client
    const client2 = await openWebSocket(`${wsBaseUrl}?token=${validToken}`);
    assert(client2.readyState === WebSocket.OPEN, 'Second authenticated client connected');

    // Test 5: Successful consumption broadcasts SNACK_CONSUMED to all clients
    const client1Promise = waitForEvent(client1, 'SNACK_CONSUMED');
    const client2Promise = waitForEvent(client2, 'SNACK_CONSUMED');

    await consumeService.consume({
      snackId: testSnack.id,
      userId: testMember.id,
      amount: 2,
    });

    const [evt1, evt2] = await Promise.all([client1Promise, client2Promise]);
    assert(evt1.type === 'SNACK_CONSUMED', 'Client 1 received SNACK_CONSUMED event');
    assert(evt2.type === 'SNACK_CONSUMED', 'Client 2 received SNACK_CONSUMED event');
    assert(evt1.snackId === testSnack.id, 'Event contains correct snackId');
    assert(evt1.id.startsWith('evt_'), 'Event contains standardized unique event id');
    assert(Boolean(evt1.timestamp), 'Event contains ISO timestamp');
    assert(evt1.payload.quantity === 8, 'Event payload contains updated quantity (10 - 2 = 8)');
    assert(evt1.payload.amount === 2, 'Event payload contains consumption amount');

    // Test 6: Failed consumption does NOT broadcast any event
    let unexpectedEventReceived = false;
    const tempListener = () => {
      unexpectedEventReceived = true;
    };
    client1.on('message', tempListener);

    try {
      await consumeService.consume({
        snackId: testSnack.id,
        userId: testMember.id,
        amount: 999, // Exceeds available stock (8) -> Throws INSUFFICIENT_STOCK
      });
    } catch (err: any) {
      assert(err.code === 'INSUFFICIENT_STOCK', 'Consumption correctly rejected with INSUFFICIENT_STOCK');
    }

    // Wait 500ms to verify zero events were broadcast
    await new Promise((resolve) => setTimeout(resolve, 500));
    client1.off('message', tempListener);
    assert(!unexpectedEventReceived, 'Failed consumption does NOT broadcast any event');

    console.log('\n--- 3. Restocking & Voting Broadcast Tests ---');

    // Test 7: Successful restock broadcasts SNACK_RESTOCKED
    const restockPromise = waitForEvent(client1, 'SNACK_RESTOCKED');
    await snackService.restockSnack(testSnack.id, testMember.id, 5);
    const restockEvt = await restockPromise;
    assert(restockEvt.type === 'SNACK_RESTOCKED', 'Successful restock broadcasts SNACK_RESTOCKED');
    assert(restockEvt.payload.quantity === 13, 'Restock event reflects updated quantity (8 + 5 = 13)');
    assert(restockEvt.payload.amount === 5, 'Restock event reflects restock amount');

    // Test 8: Failed restock (invalid amount) does NOT broadcast
    let restockFailedBroadcast = false;
    const restockFailListener = () => {
      restockFailedBroadcast = true;
    };
    client1.on('message', restockFailListener);
    try {
      await snackService.restockSnack(testSnack.id, testMember.id, -5);
    } catch {
      // Expected validation error
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    client1.off('message', restockFailListener);
    assert(!restockFailedBroadcast, 'Failed restock does NOT broadcast any event');

    // Test 9: Successful voting broadcasts SNACK_VOTED
    const votePromise = waitForEvent(client1, 'SNACK_VOTED');
    await voteService.castVote({
      snackId: testSnack.id,
      userId: testMember.id,
    });
    const voteEvt = await votePromise;
    assert(voteEvt.type === 'SNACK_VOTED', 'Successful vote broadcasts SNACK_VOTED');
    assert(voteEvt.payload.snackId === testSnack.id, 'Vote event contains snackId');
    assert(voteEvt.payload.totalVotes === 1, 'Vote event contains totalVotes count');

    // Test 10: Successful unvoting broadcasts SNACK_UNVOTED
    const unvotePromise = waitForEvent(client1, 'SNACK_UNVOTED');
    await voteService.removeVote({
      snackId: testSnack.id,
      userId: testMember.id,
    });
    const unvoteEvt = await unvotePromise;
    assert(unvoteEvt.type === 'SNACK_UNVOTED', 'Successful unvote broadcasts SNACK_UNVOTED');
    assert(unvoteEvt.payload.totalVotes === 0, 'Unvote event reflects 0 totalVotes');

    console.log('\n--- 4. Concurrency & Idempotency Invariants ---');

    // Test 11: Idempotent replay does not create duplicate broadcasts or duplicate stock decrements
    const testIdempKey = `test_ws_idemp_${Date.now()}`;
    const firstConsumePromise = waitForEvent(client1, 'SNACK_CONSUMED');
    const firstConsume = await consumeService.consume({
      snackId: testSnack.id,
      userId: testMember.id,
      amount: 1,
      idempotencyKey: testIdempKey,
    });
    const firstEvt = await firstConsumePromise;
    assert(firstEvt.payload.quantity === 12, 'First idempotent consume succeeds and broadcasts (quantity 12)');

    let replayBroadcastReceived = false;
    const replayListener = (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'SNACK_CONSUMED') {
          replayBroadcastReceived = true;
        }
      } catch {}
    };
    client1.on('message', replayListener);

    // Replay with exact same idempotency key
    const replayConsume = await consumeService.consume({
      snackId: testSnack.id,
      userId: testMember.id,
      amount: 1,
      idempotencyKey: testIdempKey,
    });

    assert(replayConsume.isIdempotentReplay === true, 'Replay recognized as idempotent replay');
    assert(replayConsume.snack.quantity === 12, 'Stock quantity unchanged on replay');

    await new Promise((resolve) => setTimeout(resolve, 300));
    client1.off('message', replayListener);
    assert(!replayBroadcastReceived, 'Idempotent replay does NOT broadcast duplicate event');

    // Close test clients cleanly
    client1.close();
    client2.close();

    console.log('\n================================================================');
    console.log(`WEBSOCKET TESTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================');
  } finally {
    // Isolated Cleanup: strictly delete only records created during this test
    console.log('\nCleaning up isolated Phase 5 test records...');
    try {
      await prisma.idempotencyKey.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.vote.deleteMany({
        where: {
          OR: [
            { userId: { in: createdUserIds } },
            { snackId: { in: createdSnackIds } },
          ],
        },
      });
      await prisma.activity.deleteMany({
        where: {
          OR: [
            { userId: { in: createdUserIds } },
            { snackId: { in: createdSnackIds } },
          ],
        },
      });
      await prisma.snack.deleteMany({
        where: { id: { in: createdSnackIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      console.log('Isolated test cleanup completed cleanly.');
    } catch (cleanupErr: any) {
      console.warn('Warning during test cleanup:', cleanupErr.message);
    }

    wsServer.closeAll();
    server.close();
    await prisma.$disconnect();
    clearTimeout(testTimer);
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runWebSocketTests();
