process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { AddressInfo } from 'net';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { app } from '../app';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { generateToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';

// Safety timeout (generous for remote WAN database round trips)
const TEST_TIMEOUT_MS = 240000;
const testTimer = setTimeout(() => {
  console.error('\nAuth test suite exceeded timeout threshold. Terminating.');
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

export async function runAuthTests(): Promise<{ passed: number; failed: number }> {
  console.log('================================================================');
  console.log('    SNACK OVERFLOW — PHASE 3 AUTHENTICATION TEST SUITE         ');
  console.log('================================================================\n');

  await connectWithRetry();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}/api`;

  const timestamp = Date.now();
  const createdUserIds: string[] = [];
  const createdSnackIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // 1. User Registration (POST /api/auth/register)
    // ------------------------------------------------------------------------
    console.log('--- 1. User Registration ---');

    const regEmail = `auth_test_${timestamp}@snackoverflow.test`;
    const regPassword = 'SecurePassword123!';

    const regRes = await request(`${baseUrl}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Jane Doe',
        email: regEmail,
        password: regPassword,
      }),
    });

    assert(regRes.status === 201, 'POST /api/auth/register returns 201 CREATED');
    assert(regRes.data.success === true, 'Response indicates success: true');
    assert(regRes.data.data.user.name === 'Jane Doe', 'User name matches registered input');
    assert(regRes.data.data.user.email === regEmail.toLowerCase(), 'Email is normalized to lowercase');
    assert(regRes.data.data.user.role === 'MEMBER', 'Default role assigned is MEMBER');
    assert(typeof regRes.data.data.token === 'string' && regRes.data.data.token.length > 20, 'Returns signed JWT token');

    // Security check: ensure password or hash is NEVER exposed
    assert(regRes.data.data.user.password === undefined, 'User password is not present in response');
    assert(JSON.stringify(regRes.data).indexOf(regPassword) === -1, 'Plaintext password does not appear in response');

    createdUserIds.push(regRes.data.data.user.id);

    // Verify password hashing in database
    const dbUser = await prisma.user.findUnique({ where: { id: regRes.data.data.user.id } });
    assert(dbUser !== null, 'User saved in PostgreSQL database');
    assert(dbUser!.password !== regPassword, 'Password is not stored as plaintext');
    assert(dbUser!.password.startsWith('$2b$') || dbUser!.password.startsWith('$2a$'), 'Password is encrypted using bcrypt');
    const isBcryptMatch = await bcrypt.compare(regPassword, dbUser!.password);
    assert(isBcryptMatch === true, 'bcrypt correctly verifies hashed password');

    // Duplicate email registration rejected
    const dupRes = await request(`${baseUrl}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Jane Clone',
        email: regEmail,
        password: 'AnotherPassword123!',
      }),
    });
    assert(dupRes.status === 409, 'Duplicate email registration returns 409 Conflict');
    assert(dupRes.data.error.code === 'EMAIL_ALREADY_EXISTS', 'Error code is EMAIL_ALREADY_EXISTS');

    // Case-insensitive duplicate email registration rejected
    const upperDupRes = await request(`${baseUrl}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Jane Uppercase',
        email: regEmail.toUpperCase(),
        password: 'AnotherPassword123!',
      }),
    });
    assert(upperDupRes.status === 409, 'Case-insensitive duplicate email returns 409 Conflict');

    // Role escalation attempt during registration rejected
    const escalateRes = await request(`${baseUrl}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Hacker Admin',
        email: `hacker_${timestamp}@snackoverflow.test`,
        password: 'HackerPassword123!',
        role: 'ADMIN',
      }),
    });
    assert(
      escalateRes.status === 403 || escalateRes.status === 400,
      'Registration with ADMIN role is rejected with 403 or 400'
    );
    assert(
      escalateRes.data.error.code === 'ROLE_ESCALATION_FORBIDDEN' || escalateRes.data.error.code === 'VALIDATION_ERROR',
      'Role escalation attempt properly flagged'
    );

    // Missing & invalid input validation
    const missingNameRes = await request(`${baseUrl}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        email: `invalid_${timestamp}@snackoverflow.test`,
        password: 'ValidPassword123!',
      }),
    });
    assert(missingNameRes.status === 400, 'Missing name returns 400 VALIDATION_ERROR');

    const invalidEmailRes = await request(`${baseUrl}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Email User',
        email: 'not-an-email',
        password: 'ValidPassword123!',
      }),
    });
    assert(invalidEmailRes.status === 400, 'Invalid email returns 400 VALIDATION_ERROR');

    const shortPasswordRes = await request(`${baseUrl}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Short Password User',
        email: `shortpass_${timestamp}@snackoverflow.test`,
        password: 'short',
      }),
    });
    assert(shortPasswordRes.status === 400, 'Password < 8 characters returns 400 VALIDATION_ERROR');

    // ------------------------------------------------------------------------
    // 2. User Login (POST /api/auth/login)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. User Login ---');

    // Successful login
    const loginRes = await request(`${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: regEmail,
        password: regPassword,
      }),
    });
    assert(loginRes.status === 200, 'POST /api/auth/login returns 200 OK');
    assert(loginRes.data.success === true, 'Login response indicates success: true');
    assert(typeof loginRes.data.data.token === 'string', 'Login returns valid token string');
    assert(loginRes.data.data.user.email === regEmail.toLowerCase(), 'Login user email matches');
    assert(loginRes.data.data.user.password === undefined, 'Login response does not expose password hash');

    // Case-insensitive email login
    const upperLoginRes = await request(`${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: regEmail.toUpperCase(),
        password: regPassword,
      }),
    });
    assert(upperLoginRes.status === 200, 'Login with uppercase email succeeds via normalization');

    // Incorrect password
    const wrongPassRes = await request(`${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: regEmail,
        password: 'WrongPassword999!',
      }),
    });
    assert(wrongPassRes.status === 401, 'Incorrect password returns 401 Unauthorized');
    assert(wrongPassRes.data.error.code === 'INVALID_CREDENTIALS', 'Error code is INVALID_CREDENTIALS');
    assert(wrongPassRes.data.message === 'Invalid email or password', 'Generic error message prevents enumeration');

    // Unknown email login
    const unknownEmailRes = await request(`${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: `nonexistent_${timestamp}@snackoverflow.test`,
        password: 'SomePassword123!',
      }),
    });
    assert(unknownEmailRes.status === 401, 'Non-existent email returns 401 Unauthorized');
    assert(unknownEmailRes.data.error.code === 'INVALID_CREDENTIALS', 'Error code identical to wrong password');
    assert(unknownEmailRes.data.message === wrongPassRes.data.message, 'Message identical to wrong password (no user enumeration)');

    // Missing fields on login
    const missingLoginFieldRes = await request(`${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: regEmail,
      }),
    });
    assert(missingLoginFieldRes.status === 400, 'Missing password on login returns 400 VALIDATION_ERROR');

    // ------------------------------------------------------------------------
    // 3. JWT Verification & Claim Validation
    // ------------------------------------------------------------------------
    console.log('\n--- 3. JWT Authentication & Claims ---');

    const validMemberToken = loginRes.data.data.token;

    // Create a temporary snack to test authenticated routes
    const testSnack = await prisma.snack.create({
      data: {
        name: `Auth Test Snack ${timestamp}`,
        category: 'SWEET',
        quantity: 10,
        lowStockThreshold: 3,
      },
    });
    createdSnackIds.push(testSnack.id);

    // Valid JWT accesses protected route
    const validVoteRes = await request(`${baseUrl}/snacks/${testSnack.id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validMemberToken}` },
    });
    assert(validVoteRes.status === 200, 'Valid JWT token successfully accesses protected route');

    // Expired JWT rejected
    const expiredToken = jwt.sign(
      { userId: dbUser!.id, email: dbUser!.email, role: 'MEMBER' },
      config.jwtSecret,
      { expiresIn: '-1s' }
    );
    const expiredRes = await request(`${baseUrl}/snacks/${testSnack.id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert(expiredRes.status === 401, 'Expired JWT rejected with 401');
    assert(expiredRes.data.error.code === 'TOKEN_EXPIRED', 'Expired JWT returns TOKEN_EXPIRED');

    // Invalid signature (signed with rogue secret)
    const rogueToken = jwt.sign(
      { userId: dbUser!.id, email: dbUser!.email, role: 'MEMBER' },
      'wrong-rogue-secret-key-1234567890',
      { expiresIn: '1h' }
    );
    const rogueRes = await request(`${baseUrl}/snacks/${testSnack.id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rogueToken}` },
    });
    assert(rogueRes.status === 401, 'Invalid signature rejected with 401');
    assert(rogueRes.data.error.code === 'INVALID_TOKEN', 'Invalid signature returns INVALID_TOKEN');

    // Malformed token structure
    const malformedRes = await request(`${baseUrl}/snacks/${testSnack.id}/vote`, {
      method: 'POST',
      headers: { Authorization: 'Bearer this-is-not-a-valid-jwt' },
    });
    assert(malformedRes.status === 401, 'Malformed token rejected with 401 INVALID_TOKEN');

    // Empty Bearer token
    const emptyBearerRes = await request(`${baseUrl}/snacks/${testSnack.id}/vote`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' },
    });
    assert(emptyBearerRes.status === 401, 'Empty Bearer token rejected with 401 UNAUTHORIZED');

    // Missing token claim: missing role
    const missingRoleToken = jwt.sign(
      { userId: dbUser!.id, email: dbUser!.email },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
    const missingRoleRes = await request(`${baseUrl}/snacks/${testSnack.id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${missingRoleToken}` },
    });
    assert(missingRoleRes.status === 401, 'Token missing role claim rejected with 401');

    // Missing token claim: missing userId
    const missingUserIdToken = jwt.sign(
      { email: dbUser!.email, role: 'MEMBER' },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
    const missingUserIdRes = await request(`${baseUrl}/snacks/${testSnack.id}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${missingUserIdToken}` },
    });
    assert(missingUserIdRes.status === 401, 'Token missing userId claim rejected with 401');

    // ------------------------------------------------------------------------
    // 4. Role-Based Authorization & Privilege Escalation Defenses
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Role-Based Authorization & Privilege Escalation ---');

    // Create an Admin user in database for testing admin operations
    const adminUser = await prisma.user.create({
      data: {
        name: `Admin Tester ${timestamp}`,
        email: `admin_tester_${timestamp}@snackoverflow.test`,
        password: await hashPassword('AdminPass123!'),
        role: 'ADMIN',
      },
    });
    createdUserIds.push(adminUser.id);
    const adminToken = generateToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: 'ADMIN',
    });

    // MEMBER cannot create snack
    const memberCreateRes = await request(`${baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validMemberToken}` },
      body: JSON.stringify({
        name: `Member Attempt Snack ${timestamp}`,
        category: 'SWEET',
        quantity: 10,
        lowStockThreshold: 2,
      }),
    });
    assert(memberCreateRes.status === 403, 'MEMBER cannot create snacks (403 FORBIDDEN)');

    // MEMBER cannot restock snack
    const memberRestockRes = await request(`${baseUrl}/snacks/${testSnack.id}/restock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validMemberToken}` },
      body: JSON.stringify({ amount: 5 }),
    });
    assert(memberRestockRes.status === 403, 'MEMBER cannot restock snacks (403 FORBIDDEN)');

    // MEMBER cannot delete snack
    const memberDeleteRes = await request(`${baseUrl}/snacks/${testSnack.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${validMemberToken}` },
    });
    assert(memberDeleteRes.status === 403, 'MEMBER cannot delete snacks (403 FORBIDDEN)');

    // MEMBER cannot edit snack
    const memberPatchRes = await request(`${baseUrl}/snacks/${testSnack.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${validMemberToken}` },
      body: JSON.stringify({ name: 'Hacked Name' }),
    });
    assert(memberPatchRes.status === 403, 'MEMBER cannot edit snacks (403 FORBIDDEN)');

    // Privilege escalation attempt: passing role in body or query doesn't override JWT role
    const spoofRoleRes = await request(`${baseUrl}/snacks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validMemberToken}` },
      body: JSON.stringify({
        name: `Spoof Role Snack ${timestamp}`,
        category: 'SWEET',
        quantity: 10,
        lowStockThreshold: 2,
        role: 'ADMIN',
      }),
    });
    assert(spoofRoleRes.status === 403, 'Privilege escalation via request body role spoofing rejected (403 FORBIDDEN)');

    // ADMIN can restock snack
    const adminRestockRes = await request(`${baseUrl}/snacks/${testSnack.id}/restock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ amount: 5 }),
    });
    assert(adminRestockRes.status === 200, 'ADMIN successfully performs restock operation');

    console.log('\n================================================================');
    console.log(`AUTH TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================\n');

    return { passed: passedCount, failed: failedCount };
  } finally {
    console.log('Cleaning up isolated auth test records...');
    try {
      if (createdUserIds.length > 0 || createdSnackIds.length > 0) {
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
      }
      console.log('Isolated auth test cleanup complete.');
    } catch (cleanupErr: any) {
      console.warn('Warning during auth cleanup:', cleanupErr.message);
    }

    server.close();
    await prisma.$disconnect();
    clearTimeout(testTimer);
  }
}

// Standalone execution support
if (require.main === module || process.argv[1]?.includes('authTestSuite')) {
  runAuthTests()
    .then((results) => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal error during auth test run:', err);
      process.exit(1);
    });
}
