// Frontend Admin Activity History Verification
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import http from 'http';
import { AddressInfo } from 'net';
import { app } from '../backend/src/app';
import { prisma } from '../backend/src/config/database';
import { hashPassword } from '../backend/src/utils/password';
import activityService from './src/services/activityService';
import authService from './src/services/authService';
import apiClient from './src/services/apiClient';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    passed++;
    console.log(`  ✔ PASS: ${msg}`);
  }
}

// In-memory mock localStorage for Node testing environment
const storage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (key: string) => storage[key] || null,
  setItem: (key: string, val: string) => { storage[key] = val; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

async function runActivityFrontendTests() {
  console.log('================================================================');
  console.log('    SNACK OVERFLOW — FRONTEND ADMIN ACTIVITY TEST SUITE         ');
  console.log('================================================================\n');

  // Start in-process backend server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const serverApiUrl = `http://localhost:${port}/api`;

  const createdActivityIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSnackIds: string[] = [];

  let testError: any = null;

  try {
    // Set window.__APP_CONFIG__ for runtime config
    (global as any).window = {
      __APP_CONFIG__: {
        API_BASE_URL: serverApiUrl,
        WS_URL: `ws://localhost:${port}`,
      },
    };

    const timestamp = Date.now();
    const testAdminPassword = 'AdminPassword123!';
    const testMemberPassword = 'MemberPassword123!';

    // Create isolated test users and test snack
    const adminUser = await prisma.user.create({
      data: {
        name: `Frontend Admin ${timestamp}`,
        email: `fe_act_admin_${timestamp}@snackoverflow.test`,
        password: await hashPassword(testAdminPassword),
        role: 'ADMIN',
      },
    });
    createdUserIds.push(adminUser.id);

    const memberUser = await prisma.user.create({
      data: {
        name: `Frontend Member ${timestamp}`,
        email: `fe_act_member_${timestamp}@snackoverflow.test`,
        password: await hashPassword(testMemberPassword),
        role: 'MEMBER',
      },
    });
    createdUserIds.push(memberUser.id);

    const demoSnack = await prisma.snack.create({
      data: {
        name: `FE Activity Snack ${timestamp}`,
        category: 'SAVOURY',
        quantity: 20,
        lowStockThreshold: 5,
      },
    });
    createdSnackIds.push(demoSnack.id);

    assert(!!adminUser, 'Admin user created in database');
    assert(!!memberUser, 'Member user created in database');
    assert(!!demoSnack, 'Demo snack created in database');

    // Create 2 test activities for service verification
    const act1 = await prisma.activity.create({
      data: {
        userId: memberUser.id,
        snackId: demoSnack.id,
        action: 'CONSUMED',
        amount: 3,
      },
    });
    createdActivityIds.push(act1.id);

    const act2 = await prisma.activity.create({
      data: {
        userId: adminUser.id,
        snackId: demoSnack.id,
        action: 'RESTOCKED',
        amount: 12,
      },
    });
    createdActivityIds.push(act2.id);

    // -------------------------------------------------------------
    // 1. Unauthenticated Activity Service Fetch
    // -------------------------------------------------------------
    console.log('--- 1. Unauthenticated Frontend Activity Service Call ---');
    localStorage.clear();
    const unauthRes = await activityService.getActivities();
    assert(unauthRes.success === false, 'Unauthenticated getActivities returns success: false');
    assert(unauthRes.error?.code === 'UNAUTHORIZED', 'Unauthenticated request error code is UNAUTHORIZED');

    // -------------------------------------------------------------
    // 2. Member User Forbidden from Activity Service
    // -------------------------------------------------------------
    console.log('\n--- 2. Member User Role Guard Verification ---');
    const memberLoginRes = await authService.login(
      memberUser.email,
      testMemberPassword
    );
    assert(memberLoginRes.success, 'Member user logged in successfully');
    assert(memberLoginRes.data?.user.role === 'MEMBER', 'User role is confirmed MEMBER');

    const memberRes = await activityService.getActivities();
    assert(memberRes.success === false, 'Member getActivities returns success: false');
    assert(memberRes.error?.code === 'FORBIDDEN', 'Member request error code is FORBIDDEN');

    // -------------------------------------------------------------
    // 3. Admin User Access & Query Parameter Verification
    // -------------------------------------------------------------
    console.log('\n--- 3. Admin User Activity Service Verification ---');
    const adminLoginRes = await authService.login(
      adminUser.email,
      testAdminPassword
    );
    assert(adminLoginRes.success, 'Admin user logged in successfully');
    assert(adminLoginRes.data?.user.role === 'ADMIN', 'User role is confirmed ADMIN');

    // 3.1 Fetch all activities
    const allActivitiesRes = await activityService.getActivities();
    assert(allActivitiesRes.success === true, 'Admin getActivities succeeds');
    assert(Array.isArray(allActivitiesRes.data?.activities), 'Activities list is an array');
    assert(allActivitiesRes.data?.activities.length! >= 2, 'Contains at least 2 activities');
    assert(allActivitiesRes.data?.pagination.page === 1, 'Pagination page is 1');

    // 3.2 Filter by action = CONSUMED
    const consumedRes = await activityService.getActivities({ action: 'CONSUMED' });
    assert(consumedRes.success === true, 'getActivities with action=CONSUMED succeeds');
    assert(
      consumedRes.data?.activities.every((a) => a.action === 'CONSUMED'),
      'All returned activities are CONSUMED'
    );
    assert(
      consumedRes.data?.activities.some((a) => a.id === act1.id),
      'Activity 1 (CONSUMED) is present in filtered results'
    );

    // 3.3 Filter by action = RESTOCKED
    const restockedRes = await activityService.getActivities({ action: 'RESTOCKED' });
    assert(restockedRes.success === true, 'getActivities with action=RESTOCKED succeeds');
    assert(
      restockedRes.data?.activities.every((a) => a.action === 'RESTOCKED'),
      'All returned activities are RESTOCKED'
    );
    assert(
      restockedRes.data?.activities.some((a) => a.id === act2.id),
      'Activity 2 (RESTOCKED) is present in filtered results'
    );

    // 3.4 Search filter
    const searchRes = await activityService.getActivities({ search: demoSnack.name });
    assert(searchRes.success === true, 'getActivities with search filter succeeds');
    assert(
      searchRes.data?.activities.some((a) => a.id === act1.id),
      'Search query returned matching snack activity'
    );

    // 3.5 Sorting by amount
    const sortRes = await activityService.getActivities({ sortBy: 'amount', sortOrder: 'desc' });
    assert(sortRes.success === true, 'getActivities sorted by amount desc succeeds');
    const items = sortRes.data?.activities || [];
    for (let i = 0; i < items.length - 1; i++) {
      assert(items[i].amount >= items[i + 1].amount, `Sorted order verified at index ${i}`);
    }

    // 3.6 Pagination params
    const pageRes = await activityService.getActivities({ page: 1, limit: 1 });
    assert(pageRes.success === true, 'getActivities with page & limit succeeds');
    assert(pageRes.data?.activities.length === 1, 'Limit 1 returns exactly 1 item');
    assert(pageRes.data?.pagination.limit === 1, 'Pagination metadata reflects limit 1');

    // 3.7 Data Sanitization Check
    for (const act of allActivitiesRes.data?.activities || []) {
      assert((act.user as any).password === undefined, 'No password field in user relation');
      assert((act.user as any).passwordHash === undefined, 'No passwordHash field in user relation');
    }

  } catch (err: any) {
    console.error('Frontend activity test failure:', err);
    testError = err;
  } finally {
    // Clean up created test activities, snacks, and users
    if (createdActivityIds.length > 0 || createdSnackIds.length > 0 || createdUserIds.length > 0) {
      try {
        if (createdActivityIds.length > 0) {
          await prisma.activity.deleteMany({
            where: { id: { in: createdActivityIds } },
          });
        }
        if (createdSnackIds.length > 0) {
          await prisma.snack.deleteMany({
            where: { id: { in: createdSnackIds } },
          });
        }
        if (createdUserIds.length > 0) {
          await prisma.user.deleteMany({
            where: { id: { in: createdUserIds } },
          });
        }
        console.log(`\n✔ Cleaned up isolated test records (activities: ${createdActivityIds.length}, snacks: ${createdSnackIds.length}, users: ${createdUserIds.length})`);
      } catch (cleanErr: any) {
        console.error('Failed to cleanup activities:', cleanErr.message);
      }
    }
    server.close();
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`ALL FRONTEND ADMIN ACTIVITY TESTS PASSED: ${passed} / ${passed + failed}`);
  console.log('================================================================\n');

  if (testError || failed > 0) {
    process.exit(1);
  }
}

runActivityFrontendTests().catch((err) => {
  console.error('Fatal error in frontend activity tests:', err);
  process.exit(1);
});
