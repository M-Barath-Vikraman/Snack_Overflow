// Frontend End-to-End Service & Integration Verification
import http from 'http';
import { AddressInfo } from 'net';
import { app } from '../backend/src/app';
import { prisma } from '../backend/src/config/database';
import { hashPassword } from '../backend/src/utils/password';
import { getApiBaseUrl, getWsUrl } from './src/config/env';
import authService from './src/services/authService';
import snackService from './src/services/snackService';
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

async function runFrontendTests() {
  console.log('================================================================');
  console.log('       SNACK OVERFLOW — FRONTEND INTEGRATION TEST SUITE         ');
  console.log('================================================================\n');

  // Start in-process backend server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const serverApiUrl = `http://localhost:${port}/api`;

  try {
    // --- 1. Runtime Environment Configuration Verification ---
    console.log('--- 1. Runtime Configuration Verification ---');
    
    // Set window.__APP_CONFIG__ dynamically as loaded from public/config.js
    (global as any).window = {
      __APP_CONFIG__: {
        API_BASE_URL: serverApiUrl,
        WS_URL: `ws://localhost:${port}`,
      },
      location: { href: 'http://localhost:5173/' },
    };

    const configuredApiUrl = getApiBaseUrl();
    assert(configuredApiUrl === serverApiUrl, 'Reads API_BASE_URL strictly from window.__APP_CONFIG__');
    assert(getWsUrl() === `ws://localhost:${port}`, 'Reads WS_URL strictly from window.__APP_CONFIG__');

    // Test dynamic reconfiguration without rebuilding assets
    (global as any).window.__APP_CONFIG__.API_BASE_URL = 'http://production.example.com/api';
    assert(getApiBaseUrl() === 'http://production.example.com/api', 'Dynamically switches API endpoint when config.js changes');

    // Reset to active local endpoint
    (global as any).window.__APP_CONFIG__.API_BASE_URL = serverApiUrl;

    // --- 2. Authentication Flow & Persistence ---
    console.log('\n--- 2. Authentication Flow & Persistence ---');
    const timestamp = Date.now();
    const testEmail = `fe_user_${timestamp}@snackoverflow.test`;
    const testPassword = 'Password123!';

    // Registration
    const regRes = await authService.register('Frontend Tester', testEmail, testPassword);
    assert(regRes.success === true, 'authService.register succeeds with valid input');
    assert(regRes.data?.user.role === 'MEMBER', 'Registered user assigned role MEMBER');
    assert(authService.hasToken() === true, 'JWT token automatically stored in apiClient / localStorage');
    assert(authService.getCurrentUser()?.email === testEmail.toLowerCase(), 'Current user restored in authService');

    // Logout
    authService.logout();
    assert(authService.hasToken() === false, 'authService.logout clears token from storage');
    assert(authService.getCurrentUser() === null, 'authService.logout clears user profile');

    // Login with invalid credentials
    const badLogin = await authService.login(testEmail, 'WrongPassword999!');
    assert(badLogin.success === false, 'Login with incorrect password rejected');
    assert(badLogin.error?.code === 'INVALID_CREDENTIALS', 'Returns error code INVALID_CREDENTIALS');

    // Login with valid credentials
    const loginRes = await authService.login(testEmail, testPassword);
    assert(loginRes.success === true, 'authService.login succeeds with valid credentials');
    assert(authService.hasToken() === true, 'JWT stored after login');
    const memberToken = loginRes.data?.token;

    // --- 3. Dashboard Summary Integration ---
    console.log('\n--- 3. Dashboard Summary Integration ---');
    const summaryRes = await snackService.getSummary();
    assert(summaryRes.success === true, 'snackService.getSummary returns 200 OK');
    assert(typeof summaryRes.data?.totalSnacks === 'number', 'Summary contains totalSnacks metric');
    assert(typeof summaryRes.data?.inStockCount === 'number', 'Summary contains inStockCount metric');
    assert(typeof summaryRes.data?.lowStockCount === 'number', 'Summary contains lowStockCount metric');
    assert(typeof summaryRes.data?.outOfStockCount === 'number', 'Summary contains outOfStockCount metric');

    // --- 4. Snack Listing, Search, Filter, Sort & Pagination ---
    console.log('\n--- 4. Snack Listing, Search, Filter, Sort & Pagination ---');
    const listRes = await snackService.getSnacks({ page: 1, limit: 10 });
    assert(listRes.success === true, 'snackService.getSnacks returns 200 OK');
    assert(Array.isArray(listRes.data?.snacks), 'Snacks returned as array');
    assert(listRes.data?.pagination.page === 1, 'Pagination reflects current page 1');
    assert(typeof listRes.data?.pagination.total === 'number', 'Pagination reflects total count');

    // Category filter
    const sweetRes = await snackService.getSnacks({ category: 'SWEET' });
    assert(sweetRes.success === true, 'Filtering by category SWEET succeeds');
    const allSweet = (sweetRes.data?.snacks || []).every((s) => s.category === 'SWEET');
    assert(allSweet, 'All returned items match category SWEET');

    // Sorting
    const sortRes = await snackService.getSnacks({ sortBy: 'quantity', sortOrder: 'desc' });
    assert(sortRes.success === true, 'Sorting by quantity desc succeeds');

    // --- 5. Admin & Member Operations ---
    console.log('\n--- 5. Admin & Member Operations ---');

    // Verify MEMBER cannot create snack
    const memberCreateAttempt = await snackService.createSnack({
      name: `Member Illegal Snack ${timestamp}`,
      category: 'SWEET',
      quantity: 10,
      lowStockThreshold: 2,
    });
    assert(memberCreateAttempt.success === false, 'MEMBER cannot create snack (403 FORBIDDEN)');
    assert(memberCreateAttempt.error?.code === 'FORBIDDEN', 'Error code is FORBIDDEN for unauthorized member action');

    // Create admin user directly in database
    const adminEmail = `fe_admin_${timestamp}@snackoverflow.test`;
    const adminRecord = await prisma.user.create({
      data: {
        name: 'Frontend Admin',
        email: adminEmail,
        password: await hashPassword(testPassword),
        role: 'ADMIN',
      },
    });

    // Login as admin
    const adminLogin = await authService.login(adminEmail, testPassword);
    assert(adminLogin.success === true, 'Admin login succeeds');
    assert(adminLogin.data?.user.role === 'ADMIN', 'Admin user recognized with ADMIN role');

    // Admin creates snack
    const snackName = `FE Test Pretzel ${timestamp}`;
    const createRes = await snackService.createSnack({
      name: snackName,
      category: 'SAVOURY',
      quantity: 5,
      lowStockThreshold: 3,
    });
    assert(createRes.success === true, 'Admin successfully creates snack via snackService.createSnack');
    const createdSnack = createRes.data!;
    assert(createdSnack.name === snackName, 'Created snack name matches');
    assert(createdSnack.status === 'IN_STOCK', 'Derived status is IN_STOCK');

    // Admin updates snack
    const updateRes = await snackService.updateSnack(createdSnack.id, {
      lowStockThreshold: 6,
    });
    assert(updateRes.success === true, 'Admin successfully updates lowStockThreshold via updateSnack');
    assert(updateRes.data?.status === 'LOW_STOCK', 'Status dynamically changes to LOW_STOCK when quantity (5) <= threshold (6)');

    // Admin restocks snack
    const restockRes = await snackService.restockSnack(createdSnack.id, 10);
    assert(restockRes.success === true, 'Admin successfully restocks snack via restockSnack');
    assert(restockRes.data?.quantity === 15, 'Quantity increased from 5 to 15');
    assert(restockRes.data?.status === 'IN_STOCK', 'Status returns to IN_STOCK after restock');

    // Member consumes snack
    apiClient.setToken(memberToken!);
    const consumeRes = await snackService.consumeSnack(createdSnack.id, 2);
    assert(consumeRes.success === true, 'Member consumes snack with Idempotency-Key');
    assert(consumeRes.data?.snack.quantity === 13, 'Stock decremented by 2 (to 13)');

    // Member votes and unvotes
    const voteRes = await snackService.voteSnack(createdSnack.id);
    assert(voteRes.success === true, 'Member votes for snack via voteSnack');
    assert(voteRes.data?.userVoted === true, 'userVoted is true after voting');

    const unvoteRes = await snackService.unvoteSnack(createdSnack.id);
    assert(unvoteRes.success === true, 'Member removes vote via unvoteSnack');
    assert(unvoteRes.data?.userVoted === false, 'userVoted is false after unvoting');

    // Admin attempts to delete snack with historical activity -> Expect 409 RELATION_RESTRICTED
    apiClient.setToken(adminLogin.data!.token);
    const deleteWithHistory = await snackService.deleteSnack(createdSnack.id);
    assert(deleteWithHistory.success === false, 'Deleting snack with historical activity is restricted');
    assert(
      deleteWithHistory.error?.code === 'RESTRICTED_BY_ACTIVITY_HISTORY' ||
        deleteWithHistory.error?.code === 'RELATION_RESTRICTED' ||
        deleteWithHistory.message?.includes('historical') ||
        deleteWithHistory.message?.includes('violates RESTRICT setting') ||
        deleteWithHistory.message?.includes('RESTRICT'),
      'Deletion blocked by database ON DELETE RESTRICT constraint to preserve historical activity'
    );

    // Insufficient stock handling: Consume more than available
    apiClient.setToken(memberToken!);
    const overConsume = await snackService.consumeSnack(createdSnack.id, 999);
    assert(overConsume.success === false, 'Consuming more than available stock fails');
    assert(
      overConsume.error?.code === 'INSUFFICIENT_STOCK' || overConsume.message?.includes('last packet'),
      'Returns INSUFFICIENT_STOCK ("Someone beat you to the last packet!")'
    );

    // Clean up test records
    console.log('\nCleaning up isolated frontend test artifacts...');
    await prisma.activity.deleteMany({
      where: {
        OR: [
          { userId: { in: [regRes.data!.user.id, adminRecord.id] } },
          { snackId: createdSnack.id },
        ],
      },
    });
    await prisma.snack.deleteMany({ where: { id: createdSnack.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [regRes.data!.user.id, adminRecord.id] } },
    });

    console.log('\n================================================================');
    console.log(`FRONTEND INTEGRATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');
  } finally {
    server.close();
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runFrontendTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

