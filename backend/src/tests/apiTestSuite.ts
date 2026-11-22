process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { AddressInfo } from 'net';
import http from 'http';
import { app } from '../app';
import { prisma } from '../config/database';
import { generateToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';

// Ensure safety timeout
const TEST_TIMEOUT_MS = 120000;
const testTimer = setTimeout(() => {
  console.error('\nTest suite exceeded timeout threshold. Terminating.');
  process.exit(1);
}, TEST_TIMEOUT_MS);
testTimer.unref();

interface TestContext {
  baseUrl: string;
  server: http.Server;
  adminUser: { id: string; email: string; token: string };
  memberUser1: { id: string; email: string; token: string };
  memberUser2: { id: string; email: string; token: string };
  createdSnackIds: string[];
  createdUserIds: string[];
}

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

async function request(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...((options.headers as any) || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
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

async function runTests() {
  console.log('================================================================');
  console.log('       SNACK OVERFLOW — PHASE 2 BACKEND API TEST SUITE          ');
  console.log('================================================================\n');

  // Verify and warm up database connection with retry
  await connectWithRetry();

  // 1. Setup in-process server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}/api`;

  const timestamp = Date.now();
  const hashedPassword = await hashPassword('TestPassword123!');

  // 2. Create isolated test users
  const adminUserRecord = await prisma.user.create({
    data: {
      name: `Admin Test ${timestamp}`,
      email: `test_admin_${timestamp}@snackoverflow.test`,
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  const member1Record = await prisma.user.create({
    data: {
      name: `Member 1 Test ${timestamp}`,
      email: `test_member1_${timestamp}@snackoverflow.test`,
      password: hashedPassword,
      role: 'MEMBER',
    },
  });

  const member2Record = await prisma.user.create({
    data: {
      name: `Member 2 Test ${timestamp}`,
      email: `test_member2_${timestamp}@snackoverflow.test`,
      password: hashedPassword,
      role: 'MEMBER',
    },
  });

  const ctx: TestContext = {
    baseUrl,
    server,
    adminUser: {
      id: adminUserRecord.id,
      email: adminUserRecord.email,
      token: generateToken({ userId: adminUserRecord.id, email: adminUserRecord.email, role: 'ADMIN' }),
    },
    memberUser1: {
      id: member1Record.id,
      email: member1Record.email,
      token: generateToken({ userId: member1Record.id, email: member1Record.email, role: 'MEMBER' }),
    },
    memberUser2: {
      id: member2Record.id,
      email: member2Record.email,
      token: generateToken({ userId: member2Record.id, email: member2Record.email, role: 'MEMBER' }),
    },
    createdSnackIds: [],
    createdUserIds: [adminUserRecord.id, member1Record.id, member2Record.id],
  };

  try {
    // ------------------------------------------------------------------------
    // TEST SUITE 1: Authorization & Validation
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Authorization & Input Validation ---');

    // 1.1 Unauthenticated POST /api/snacks rejected with 401
    const unauthPost = await request(`${ctx.baseUrl}/snacks`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Chips', category: 'SAVOURY', quantity: 10 }),
    });
    assert(unauthPost.status === 401, 'Unauthenticated POST /api/snacks returns 401');

    // 1.2 Member POST /api/snacks rejected with 403
    const memberPost = await request(`${ctx.baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
      body: JSON.stringify({ name: 'Chips', category: 'SAVOURY', quantity: 10 }),
    });
    assert(memberPost.status === 403, 'Member POST /api/snacks returns 403 FORBIDDEN');

    // 1.3 Invalid input validation (missing name, negative quantity)
    const invalidPost = await request(`${ctx.baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
      body: JSON.stringify({ name: '', category: 'INVALID_CATEGORY', quantity: -5 }),
    });
    assert(invalidPost.status === 400, 'Invalid snack input rejected with 400 VALIDATION_ERROR');

    // ------------------------------------------------------------------------
    // TEST SUITE 2: Snack CRUD Operations
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Snack Creation & Retrieval ---');

    const snackName1 = `Wasabi Peas ${timestamp}`;
    const snackName2 = `Dark Chocolate ${timestamp}`;

    // 2.1 Admin successfully creates Snack 1
    const createRes1 = await request(`${ctx.baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
      body: JSON.stringify({
        name: snackName1,
        category: 'SAVOURY',
        quantity: 15,
        lowStockThreshold: 5,
      }),
    });
    assert(createRes1.status === 201, 'Admin POST /api/snacks returns 201 CREATED');
    assert(createRes1.data.data.status === 'IN_STOCK', 'Snack status dynamically derived as IN_STOCK');
    const snack1Id = createRes1.data.data.id;
    ctx.createdSnackIds.push(snack1Id);

    // 2.2 Duplicate snack name rejected with 409
    const dupRes = await request(`${ctx.baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
      body: JSON.stringify({
        name: snackName1,
        category: 'SAVOURY',
        quantity: 5,
      }),
    });
    assert(dupRes.status === 409, 'Duplicate snack name rejected with 409 CONFLICT');

    // 2.3 Admin creates Snack 2 (low stock: quantity 4 <= threshold 5)
    const createRes2 = await request(`${ctx.baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
      body: JSON.stringify({
        name: snackName2,
        category: 'SWEET',
        quantity: 4,
        lowStockThreshold: 5,
      }),
    });
    assert(createRes2.status === 201, 'Second snack created');
    assert(createRes2.data.data.status === 'LOW_STOCK', 'Derived status is LOW_STOCK when 0 < qty <= threshold');
    const snack2Id = createRes2.data.data.id;
    ctx.createdSnackIds.push(snack2Id);

    // 2.4 GET /api/snacks/:id
    const getSingle = await request(`${ctx.baseUrl}/snacks/${snack1Id}`);
    assert(getSingle.status === 200, 'GET /api/snacks/:id returns 200');
    assert(getSingle.data.data.name === snackName1, 'Snack name matches retrieved data');

    // 2.5 GET nonexistent snack returns 404
    const getNotFound = await request(`${ctx.baseUrl}/snacks/00000000-0000-0000-0000-000000000000`);
    assert(getNotFound.status === 404, 'Nonexistent snack ID returns 404');

    // 2.6 Admin updates snack (PATCH)
    const patchRes = await request(`${ctx.baseUrl}/snacks/${snack1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
      body: JSON.stringify({ lowStockThreshold: 10 }),
    });
    assert(patchRes.status === 200, 'Admin PATCH /api/snacks/:id returns 200');
    assert(patchRes.data.data.lowStockThreshold === 10, 'Threshold updated correctly');

    // ------------------------------------------------------------------------
    // TEST SUITE 3: Search, Filtering & Pagination in PostgreSQL
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Search, Filtering, Pagination & Sorting ---');

    // 3.1 Search by name
    const searchRes = await request(`${ctx.baseUrl}/snacks?search=${encodeURIComponent(snackName1)}`);
    assert(searchRes.status === 200, 'GET /api/snacks with search returns 200');
    assert(searchRes.data.data.snacks.length === 1, 'Search finds exact matching snack');

    // 3.2 Filter by category
    const catRes = await request(`${ctx.baseUrl}/snacks?category=SWEET&search=${encodeURIComponent(timestamp.toString())}`);
    assert(catRes.status === 200, 'Category filter returns 200');
    assert(catRes.data.data.snacks.every((s: any) => s.category === 'SWEET'), 'All returned snacks match category filter');

    // 3.3 Filter by derived status in PostgreSQL
    const statusRes = await request(`${ctx.baseUrl}/snacks?status=LOW_STOCK&search=${encodeURIComponent(timestamp.toString())}`);
    assert(statusRes.status === 200, 'Status filter returns 200');
    assert(statusRes.data.data.snacks.every((s: any) => s.status === 'LOW_STOCK'), 'All returned snacks match derived LOW_STOCK status');

    // 3.4 Pagination metadata
    const pageRes = await request(`${ctx.baseUrl}/snacks?page=1&limit=1&search=${encodeURIComponent(timestamp.toString())}`);
    assert(pageRes.data.data.pagination.limit === 1, 'Pagination limit respected');
    assert(pageRes.data.data.pagination.total >= 2, 'Total count reflects all matching items');

    // ------------------------------------------------------------------------
    // TEST SUITE 4: Atomic Consumption & Insufficient Stock
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Atomic Consumption & Concurrency ---');

    // 4.1 Successful consumption
    const consumeRes1 = await request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
      body: JSON.stringify({ amount: 2 }),
    });
    assert(consumeRes1.status === 200, 'POST /api/snacks/:id/consume returns 200');
    assert(consumeRes1.data.data.snack.quantity === 13, 'Stock quantity decremented by exactly 2 (from 15 to 13)');
    assert(consumeRes1.data.data.activity.action === 'CONSUMED', 'Activity record created with action CONSUMED');

    // 4.2 Insufficient stock rejection
    const overConsumeRes = await request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
      body: JSON.stringify({ amount: 999 }),
    });
    assert(overConsumeRes.status === 409, 'Over-consumption rejected with 409 Conflict');
    assert(
      overConsumeRes.data.message === 'Someone beat you to the last packet!',
      'Returns expected error message: "Someone beat you to the last packet!"'
    );

    // 4.3 Concurrent Consumption Race Condition Test
    console.log('   Testing 10 concurrent requests for 3 available items...');
    const raceSnackName = `Race Packet ${timestamp}`;
    const raceSnackRes = await request(`${ctx.baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
      body: JSON.stringify({
        name: raceSnackName,
        category: 'SAVOURY',
        quantity: 3,
        lowStockThreshold: 1,
      }),
    });
    const raceSnackId = raceSnackRes.data.data.id;
    ctx.createdSnackIds.push(raceSnackId);

    // Fire 10 simultaneous consumption requests (each consuming 1 item)
    const concurrentRequests = Array.from({ length: 10 }).map((_, i) =>
      request(`${ctx.baseUrl}/snacks/${raceSnackId}/consume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${i % 2 === 0 ? ctx.memberUser1.token : ctx.memberUser2.token}` },
        body: JSON.stringify({ amount: 1 }),
      })
    );

    const raceResults = await Promise.all(concurrentRequests);
    const successCount = raceResults.filter((r) => r.status === 200).length;
    const conflictCount = raceResults.filter((r) => r.status === 409).length;

    assert(successCount === 3, `Exactly 3 concurrent requests succeeded (actual: ${successCount})`);
    assert(conflictCount === 7, `Exactly 7 concurrent requests failed with 409 (actual: ${conflictCount})`);

    // Verify final stock is exactly 0 and never negative
    const finalRaceSnack = await prisma.snack.findUnique({ where: { id: raceSnackId } });
    assert(finalRaceSnack?.quantity === 0, 'Final snack quantity in database is exactly 0 (no negative stock)');

    // Verify exactly 3 Activity records created
    const raceActivities = await prisma.activity.findMany({ where: { snackId: raceSnackId } });
    assert(raceActivities.length === 3, `Exactly 3 Activity records committed in database (actual: ${raceActivities.length})`);

    // ------------------------------------------------------------------------
    // TEST SUITE 5: Restocking
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Restocking ---');

    // 5.1 Member cannot restock
    const memberRestock = await request(`${ctx.baseUrl}/snacks/${snack1Id}/restock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
      body: JSON.stringify({ amount: 10 }),
    });
    assert(memberRestock.status === 403, 'Member restock rejected with 403');

    // 5.2 Admin restocks atomically
    const adminRestock = await request(`${ctx.baseUrl}/snacks/${snack1Id}/restock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
      body: JSON.stringify({ amount: 10 }),
    });
    assert(adminRestock.status === 200, 'Admin restock returns 200');
    assert(adminRestock.data.data.quantity === 23, 'Quantity incremented by 10 (from 13 to 23)');

    // ------------------------------------------------------------------------
    // TEST SUITE 6: Foreign Key Deletion Restriction
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Historical Activity & Deletion Restriction ---');

    // Since snack1 has Activity records, deleting it must be prevented by ON DELETE RESTRICT
    const deleteRestricted = await request(`${ctx.baseUrl}/snacks/${snack1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.adminUser.token}` },
    });
    assert(
      deleteRestricted.status === 409,
      'Deleting snack with existing activity records rejected with 409 (ON DELETE RESTRICT preserved)'
    );

    // ------------------------------------------------------------------------
    // TEST SUITE 7: Voting & Unvoting
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Voting & Unvoting ---');

    // 7.1 Member 1 votes for Snack 2
    const voteRes1 = await request(`${ctx.baseUrl}/snacks/${snack2Id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
    });
    assert(voteRes1.status === 200, 'Member 1 vote returns 200');
    assert(voteRes1.data.data.totalVotes === 1, 'Total votes is 1');
    assert(voteRes1.data.data.userVoted === true, 'userVoted is true');

    // 7.2 Duplicate vote rejected with 409
    const dupVote = await request(`${ctx.baseUrl}/snacks/${snack2Id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
    });
    assert(dupVote.status === 409, 'Duplicate vote by same user rejected with 409 Conflict');

    // 7.3 Member 2 votes for Snack 2
    const voteRes2 = await request(`${ctx.baseUrl}/snacks/${snack2Id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.memberUser2.token}` },
    });
    assert(voteRes2.status === 200, 'Member 2 vote succeeds');
    assert(voteRes2.data.data.totalVotes === 2, 'Total votes updated to 2');

    // 7.4 Member 1 unvotes
    const unvoteRes = await request(`${ctx.baseUrl}/snacks/${snack2Id}/vote`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
    });
    assert(unvoteRes.status === 200, 'Unvoting returns 200');
    assert(unvoteRes.data.data.totalVotes === 1, 'Total votes decremented to 1');

    // 7.5 Duplicate unvote returns 404
    const dupUnvote = await request(`${ctx.baseUrl}/snacks/${snack2Id}/vote`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.memberUser1.token}` },
    });
    assert(dupUnvote.status === 404, 'Unvoting when no vote exists returns 404');

    // ------------------------------------------------------------------------
    // TEST SUITE 8: Idempotency for Consumption & Expiration
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Idempotency Key Handling & Expiration ---');

    const idempKey = `IDEMP_${timestamp}_001`;

    // 8.1 First consumption with Idempotency-Key header
    const idempFirst = await request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.memberUser1.token}`,
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({ amount: 1 }),
    });
    assert(idempFirst.status === 200, 'Initial request with Idempotency-Key succeeds with 200');
    const stockAfterFirst = idempFirst.data.data.snack.quantity;

    // 8.2 Replay identical request with same unexpired key
    const idempReplay = await request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.memberUser1.token}`,
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({ amount: 1 }),
    });
    assert(idempReplay.status === 200, 'Unexpired key replay returns 200');
    assert(idempReplay.headers.get('x-idempotent-replay') === 'true', 'Replay header X-Idempotent-Replay is true');
    assert(
      idempReplay.data.data.snack.quantity === stockAfterFirst,
      'Stock quantity was NOT decremented a second time (idempotency preserved)'
    );

    // 8.3 Reusing same key with different amount rejected (payload mismatch)
    const idempMismatch = await request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.memberUser1.token}`,
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({ amount: 5 }), // Different amount!
    });
    assert(idempMismatch.status === 409, 'Key reuse with different request payload rejected with 409 Conflict');

    // 8.4 Simultaneous requests using the same new idempotency key
    const simKey = `SIM_KEY_${timestamp}`;
    const simRequests = [
      request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.memberUser1.token}`,
          'Idempotency-Key': simKey,
        },
        body: JSON.stringify({ amount: 1 }),
      }),
      request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.memberUser1.token}`,
          'Idempotency-Key': simKey,
        },
        body: JSON.stringify({ amount: 1 }),
      }),
    ];
    const simResults = await Promise.all(simRequests);
    const sim200Count = simResults.filter((r) => r.status === 200).length;
    const sim409Count = simResults.filter((r) => r.status === 409).length;
    assert(
      (sim200Count === 1 && sim409Count === 1) || (sim200Count === 2 && sim409Count === 0),
      'Simultaneous requests with identical key safely resolve (either 1 execution + 1 in-progress conflict, or replay)'
    );

    // 8.5 Expired key reuse: create an already expired key in database
    const expiredKeyName = `EXPIRED_KEY_${timestamp}`;
    await prisma.idempotencyKey.create({
      data: {
        key: expiredKeyName,
        userId: ctx.memberUser1.id,
        requestPath: `/api/snacks/${snack1Id}/consume`,
        responseStatus: 200,
        responseBody: { old: true },
        createdAt: new Date(Date.now() - 3600000), // 1 hour ago
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      },
    });

    const stockBeforeExpiredReuse = (await prisma.snack.findUnique({ where: { id: snack1Id } }))?.quantity || 0;

    // Send consume request with the expired key
    const expiredReuseRes = await request(`${ctx.baseUrl}/snacks/${snack1Id}/consume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.memberUser1.token}`,
        'Idempotency-Key': expiredKeyName,
      },
      body: JSON.stringify({ amount: 1 }),
    });

    assert(expiredReuseRes.status === 200, 'Expired key reuse succeeds with 200 (not rejected as conflict)');
    assert(!expiredReuseRes.headers.get('x-idempotent-replay'), 'Expired key reuse executes fresh consumption (not cached replay)');
    
    // Verify that the record was replaced in database with a fresh expiration
    const refreshedKeyRecord = await prisma.idempotencyKey.findUnique({
      where: {
        userId_key: {
          userId: ctx.memberUser1.id,
          key: expiredKeyName,
        },
      },
    });
    assert(
      !!refreshedKeyRecord && refreshedKeyRecord.expiresAt! > new Date(),
      'Expired key was atomically refreshed with future expiration in database'
    );

    const stockAfterExpiredReuse = (await prisma.snack.findUnique({ where: { id: snack1Id } }))?.quantity || 0;
    assert(stockAfterExpiredReuse === stockBeforeExpiredReuse - 1, 'Stock decremented for valid expired key reuse');

    // ------------------------------------------------------------------------
    // TEST SUITE 9: Dashboard Summary & Snack of the Week
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Dashboard Summary & Snack of the Week ---');

    const summaryRes = await request(`${ctx.baseUrl}/snacks/summary`);
    assert(summaryRes.status === 200, 'GET /api/snacks/summary returns 200');
    assert(typeof summaryRes.data.data.totalSnacks === 'number', 'totalSnacks is a number');
    assert(typeof summaryRes.data.data.inStockCount === 'number', 'inStockCount is a number');
    assert(typeof summaryRes.data.data.lowStockCount === 'number', 'lowStockCount is a number');
    assert(typeof summaryRes.data.data.outOfStockCount === 'number', 'outOfStockCount is a number');
    assert(summaryRes.data.data.snackOfTheWeek !== null, 'Snack of the Week is identified');
    assert(
      summaryRes.data.data.snackOfTheWeek.id === snack2Id,
      'Snack 2 (which holds the active vote) is elected Snack of the Week'
    );

    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================');
  } finally {
    // Isolated Cleanup: Clean only test records created during this run
    console.log('\nCleaning up isolated test artifacts...');
    try {
      // 1. Delete created idempotency keys
      await prisma.idempotencyKey.deleteMany({
        where: { userId: { in: ctx.createdUserIds } },
      });
      // 2. Delete created votes
      await prisma.vote.deleteMany({
        where: {
          OR: [
            { userId: { in: ctx.createdUserIds } },
            { snackId: { in: ctx.createdSnackIds } },
          ],
        },
      });
      // 3. Delete created activities
      await prisma.activity.deleteMany({
        where: {
          OR: [
            { userId: { in: ctx.createdUserIds } },
            { snackId: { in: ctx.createdSnackIds } },
          ],
        },
      });
      // 4. Delete created snacks
      await prisma.snack.deleteMany({
        where: { id: { in: ctx.createdSnackIds } },
      });
      // 5. Delete created users
      await prisma.user.deleteMany({
        where: { id: { in: ctx.createdUserIds } },
      });
      console.log('Isolated test cleanup completed cleanly.');
    } catch (cleanupErr: any) {
      console.warn('Warning during test cleanup:', cleanupErr.message);
    }

    server.close();
    await prisma.$disconnect();
    clearTimeout(testTimer);
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runTests();
