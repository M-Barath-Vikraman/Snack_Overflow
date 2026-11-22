process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import http from 'http';
import { AddressInfo } from 'net';
import { app } from '../app';
import { prisma } from '../config/database';
import { generateToken } from '../utils/jwt';

const TEST_TIMEOUT_MS = 240000;
const testTimer = setTimeout(() => {
  console.error('\nActivity test suite exceeded timeout threshold. Terminating.');
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

async function request(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, body: data };
}

async function main() {
  console.log('================================================================');
  console.log('      PHASE 6: ADMIN ACTIVITY HISTORY TEST SUITE                ');
  console.log('================================================================\n');

  // Start in-process server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}/api`;

  const createdActivityIds: string[] = [];

  let testError: any = null;

  try {
    // 1. Fetch legitimate test users and a demo snack
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@snackoverflow.com' },
    });
    const memberUser = await prisma.user.findUnique({
      where: { email: 'member@snackoverflow.com' },
    });
    const demoSnack = await prisma.snack.findFirst({
      where: { name: 'Wasabi Peas' },
    });

    assert(!!adminUser, 'Admin user (admin@snackoverflow.com) exists');
    assert(!!memberUser, 'Member user (member@snackoverflow.com) exists');
    assert(!!demoSnack, 'Demo snack (Wasabi Peas) exists');

    const adminToken = generateToken({
      userId: adminUser!.id,
      email: adminUser!.email,
      role: 'ADMIN',
    });

    const memberToken = generateToken({
      userId: memberUser!.id,
      email: memberUser!.email,
      role: 'MEMBER',
    });

    // -------------------------------------------------------------
    // 2. Authentication and Authorization Tests
    // -------------------------------------------------------------
    console.log('\n--- 1. Authentication & Role Authorization ---');

    // 2.1 Unauthenticated request rejected with 401
    const unauthRes = await request(`${baseUrl}/activities`);
    assert(unauthRes.status === 401, 'Unauthenticated request is rejected with 401');
    assert(unauthRes.body?.error?.code === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');

    // 2.2 Member role rejected with 403 Forbidden
    const memberRes = await request(`${baseUrl}/activities`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert(memberRes.status === 403, 'Member request is rejected with 403 Forbidden');
    assert(memberRes.body?.error?.code === 'FORBIDDEN', 'Error code is FORBIDDEN');

    // 2.3 Admin role accepted with 200 OK
    const adminRes = await request(`${baseUrl}/activities`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminRes.status === 200, 'Admin request succeeds with 200 OK');
    assert(adminRes.body?.success === true, 'Response indicates success: true');
    assert(Array.isArray(adminRes.body?.data?.activities), 'Response contains activities array');
    assert(!!adminRes.body?.data?.pagination, 'Response contains pagination metadata');

    // -------------------------------------------------------------
    // 3. Validation & Constraint Enforcement
    // -------------------------------------------------------------
    console.log('\n--- 2. Request Validation & Constraints ---');

    // 3.1 Invalid action enum
    const badActionRes = await request(`${baseUrl}/activities?action=INVALID`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badActionRes.status === 400, 'Invalid action is rejected with 400');
    assert(badActionRes.body?.error?.code === 'VALIDATION_ERROR', 'Rejection code is VALIDATION_ERROR');

    // 3.2 Invalid sortBy
    const badSortRes = await request(`${baseUrl}/activities?sortBy=secretField`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badSortRes.status === 400, 'Invalid sortBy field is rejected with 400');

    // 3.3 Invalid sortOrder
    const badOrderRes = await request(`${baseUrl}/activities?sortOrder=sideways`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badOrderRes.status === 400, 'Invalid sortOrder is rejected with 400');

    // 3.4 Limit capped at 100
    const overLimitRes = await request(`${baseUrl}/activities?limit=101`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(overLimitRes.status === 400, 'Limit > 100 is rejected with 400');

    // 3.5 Page < 1
    const badPageRes = await request(`${baseUrl}/activities?page=0`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badPageRes.status === 400, 'Page < 1 is rejected with 400');

    // -------------------------------------------------------------
    // 4. Data Insertion, Filtering, Searching & Sorting
    // -------------------------------------------------------------
    console.log('\n--- 3. Filtering, Search, Sorting & Sanitization ---');

    // Create 3 deterministic test activities
    const act1 = await prisma.activity.create({
      data: {
        userId: memberUser!.id,
        snackId: demoSnack!.id,
        action: 'CONSUMED',
        amount: 2,
      },
    });
    createdActivityIds.push(act1.id);

    const act2 = await prisma.activity.create({
      data: {
        userId: adminUser!.id,
        snackId: demoSnack!.id,
        action: 'RESTOCKED',
        amount: 15,
      },
    });
    createdActivityIds.push(act2.id);

    const act3 = await prisma.activity.create({
      data: {
        userId: memberUser!.id,
        snackId: demoSnack!.id,
        action: 'CONSUMED',
        amount: 5,
      },
    });
    createdActivityIds.push(act3.id);

    // 4.1 Filter by action=CONSUMED
    const consumedFilterRes = await request(`${baseUrl}/activities?action=CONSUMED`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(consumedFilterRes.status === 200, 'Filter by action=CONSUMED returns 200');
    const consumedItems = consumedFilterRes.body.data.activities;
    assert(
      consumedItems.every((item: any) => item.action === 'CONSUMED'),
      'All returned activities have action === CONSUMED'
    );
    assert(
      consumedItems.some((item: any) => item.id === act1.id) &&
      consumedItems.some((item: any) => item.id === act3.id),
      'Created CONSUMED activities are included in filtered response'
    );
    assert(
      !consumedItems.some((item: any) => item.id === act2.id),
      'RESTOCKED activity is excluded when filtering by CONSUMED'
    );

    // 4.2 Filter by action=RESTOCKED
    const restockedFilterRes = await request(`${baseUrl}/activities?action=RESTOCKED`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(restockedFilterRes.status === 200, 'Filter by action=RESTOCKED returns 200');
    const restockedItems = restockedFilterRes.body.data.activities;
    assert(
      restockedItems.every((item: any) => item.action === 'RESTOCKED'),
      'All returned activities have action === RESTOCKED'
    );
    assert(
      restockedItems.some((item: any) => item.id === act2.id),
      'Created RESTOCKED activity is included in filtered response'
    );

    // 4.3 Search by User Name
    const searchNameRes = await request(`${baseUrl}/activities?search=${encodeURIComponent(memberUser!.name)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchNameRes.status === 200, 'Search by user name returns 200');
    assert(
      searchNameRes.body.data.activities.some((item: any) => item.id === act1.id),
      'Member activity found when searching by member user name'
    );

    // 4.4 Search by User Email
    const searchEmailRes = await request(`${baseUrl}/activities?search=member@snackoverflow.com`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchEmailRes.status === 200, 'Search by user email returns 200');
    assert(
      searchEmailRes.body.data.activities.some((item: any) => item.id === act1.id),
      'Member activity found when searching by email'
    );

    // 4.5 Search by Snack Name
    const searchSnackRes = await request(`${baseUrl}/activities?search=Wasabi`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchSnackRes.status === 200, 'Search by snack name returns 200');
    assert(
      searchSnackRes.body.data.activities.some((item: any) => item.id === act1.id),
      'Activity found when searching by partial snack name'
    );

    // 4.6 Sort by Amount (descending)
    const sortAmountDescRes = await request(`${baseUrl}/activities?sortBy=amount&sortOrder=desc`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(sortAmountDescRes.status === 200, 'Sort by amount desc returns 200');
    const amountDescList = sortAmountDescRes.body.data.activities;
    for (let i = 0; i < amountDescList.length - 1; i++) {
      assert(
        amountDescList[i].amount >= amountDescList[i + 1].amount,
        `Amount sort desc verified at index ${i}`
      );
    }

    // 4.7 Sort by Amount (ascending)
    const sortAmountAscRes = await request(`${baseUrl}/activities?sortBy=amount&sortOrder=asc`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(sortAmountAscRes.status === 200, 'Sort by amount asc returns 200');
    const amountAscList = sortAmountAscRes.body.data.activities;
    for (let i = 0; i < amountAscList.length - 1; i++) {
      assert(
        amountAscList[i].amount <= amountAscList[i + 1].amount,
        `Amount sort asc verified at index ${i}`
      );
    }

    // 4.8 Security & Sanitization Check: Password hashes must NEVER be exposed
    const sanitizeRes = await request(`${baseUrl}/activities`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    for (const act of sanitizeRes.body.data.activities) {
      assert(act.user && typeof act.user.id === 'string', 'Activity has populated user object');
      assert(typeof act.user.name === 'string', 'User object has name');
      assert(typeof act.user.email === 'string', 'User object has email');
      assert(typeof act.user.role === 'string', 'User object has role');
      assert(act.user.password === undefined, 'User object strictly excludes password');
      assert(act.user.passwordHash === undefined, 'User object strictly excludes passwordHash');
      assert(act.snack && typeof act.snack.id === 'string', 'Activity has populated snack object');
      assert(typeof act.snack.name === 'string', 'Snack object has name');
      assert(typeof act.snack.category === 'string', 'Snack object has category');
    }

    // 4.9 Pagination metadata check
    const pageLimitRes = await request(`${baseUrl}/activities?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(pageLimitRes.status === 200, 'Pagination query returns 200');
    assert(pageLimitRes.body.data.activities.length <= 2, 'Page size respects limit=2');
    assert(pageLimitRes.body.data.pagination.page === 1, 'Pagination page is 1');
    assert(pageLimitRes.body.data.pagination.limit === 2, 'Pagination limit is 2');
    assert(pageLimitRes.body.data.pagination.total >= 3, 'Total count reflects all activities');
    assert(pageLimitRes.body.data.pagination.totalPages >= 2, 'Total pages reflects pagination');

  } catch (err: any) {
    console.error('Test execution failed with error:', err);
    testError = err;
  } finally {
    // -------------------------------------------------------------
    // DB Clean up: Delete only created test activities
    // -------------------------------------------------------------
    if (createdActivityIds.length > 0) {
      let testError: any = null;

  try {
        await prisma.activity.deleteMany({
          where: { id: { in: createdActivityIds } },
        });
        console.log(`\n✔ Cleaned up ${createdActivityIds.length} test activity records from database`);
      } catch (cleanErr) {
        console.error('Failed to clean up test activities:', cleanErr);
      }
    }

    server.close();
    await prisma.$disconnect();
    clearTimeout(testTimer);
  }

  console.log('\n================================================================');
  console.log(`PHASE 6 ADMIN ACTIVITY TESTS PASSED: ${passedCount} / ${passedCount + failedCount}`);
  console.log('================================================================\n');

  if (testError || failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in activity test suite:', err);
  process.exit(1);
});
