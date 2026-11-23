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
import { storageService, StorageProvider, StorageUploadResult } from '../services/storageService';

const TEST_TIMEOUT_MS = 120000;
const testTimer = setTimeout(() => {
  console.error('\nImage test suite exceeded timeout threshold. Terminating.');
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

// Mock Storage Provider for isolated testing
class MockStorageProvider implements StorageProvider {
  public uploadedFiles: Map<string, { buffer: Buffer; mimeType: string }> = new Map();
  public deletedPaths: string[] = [];
  public shouldFailUpload = false;
  public shouldFailDelete = false;

  public async upload(
    storagePath: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<StorageUploadResult> {
    if (this.shouldFailUpload) {
      throw new Error('Simulated storage upload failure');
    }
    this.uploadedFiles.set(storagePath, { buffer: fileBuffer, mimeType });
    return {
      publicUrl: `https://mock-supabase.storage.test/snack-images/${storagePath}`,
      storagePath,
    };
  }

  public async delete(storagePath: string): Promise<void> {
    if (this.shouldFailDelete) {
      throw new Error('Simulated storage delete failure');
    }
    this.deletedPaths.push(storagePath);
    this.uploadedFiles.delete(storagePath);
  }

  public getPublicUrl(storagePath: string): string {
    return `https://mock-supabase.storage.test/snack-images/${storagePath}`;
  }

  public reset(): void {
    this.uploadedFiles.clear();
    this.deletedPaths = [];
    this.shouldFailUpload = false;
    this.shouldFailDelete = false;
  }
}

// Valid magic byte buffers
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
  0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0xff, 0xd9,
]);

const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
  0x34, 0x25, 0xa4, 0x00, 0x03, 0x70, 0x00, 0xfe, 0xfb, 0xfd, 0x50, 0x00,
]);

const FAKE_IMAGE_BUFFER = Buffer.from('This is a plain text file pretending to be an image.');

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

async function runImageTestSuite() {
  console.log('================================================================');
  console.log('       SNACK OVERFLOW — SNACK IMAGE UPLOAD & STORAGE SUITE      ');
  console.log('================================================================\n');

  await connectWithRetry();

  const mockProvider = new MockStorageProvider();
  storageService.setProvider(mockProvider);

  // Setup server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}/api`;

  const timestamp = Date.now();
  const hashedPassword = await hashPassword('TestPassword123!');

  const createdUserIds: string[] = [];
  const createdSnackIds: string[] = [];

  let adminUser: { id: string; email: string; token: string };
  let memberUser: { id: string; email: string; token: string };

  try {
    // 1. Create test users
    const adminRecord = await prisma.user.create({
      data: {
        name: `Admin Image Tester ${timestamp}`,
        email: `admin_img_${timestamp}@test.com`,
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    createdUserIds.push(adminRecord.id);
    adminUser = {
      id: adminRecord.id,
      email: adminRecord.email,
      token: generateToken({ userId: adminRecord.id, email: adminRecord.email, role: 'ADMIN' }),
    };

    const memberRecord = await prisma.user.create({
      data: {
        name: `Member Image Tester ${timestamp}`,
        email: `member_img_${timestamp}@test.com`,
        password: hashedPassword,
        role: 'MEMBER',
      },
    });
    createdUserIds.push(memberRecord.id);
    memberUser = {
      id: memberRecord.id,
      email: memberRecord.email,
      token: generateToken({ userId: memberRecord.id, email: memberRecord.email, role: 'MEMBER' }),
    };

    // 2. Create test snack
    const snackRecord = await prisma.snack.create({
      data: {
        name: `Image Test Snack ${timestamp}`,
        category: 'SWEET',
        quantity: 20,
        lowStockThreshold: 5,
      },
    });
    createdSnackIds.push(snackRecord.id);

    console.log('--- 1. Authentication & Role Validation ---');

    // Test 1.1: Unauthenticated upload rejected with 401
    {
      const formData = new FormData();
      formData.append('image', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'test.png');

      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      assert(res.status === 401, 'Unauthenticated upload returns 401 Unauthorized');
      assert(data.success === false, 'Response success is false');
    }

    // Test 1.2: Regular member upload rejected with 403 Forbidden
    {
      const formData = new FormData();
      formData.append('image', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'test.png');

      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberUser.token}` },
        body: formData,
      });
      const data = await res.json();
      assert(res.status === 403, 'Member upload returns 403 Forbidden');
      assert(data.success === false, 'Member cannot upload snack image');
    }

    console.log('\n--- 2. File Validation & Magic Bytes ---');

    // Test 2.1: Rejection of fake image buffer (magic bytes mismatch)
    {
      const formData = new FormData();
      // File has .png name and image/png MIME, but contents are plain text
      formData.append('image', new Blob([FAKE_IMAGE_BUFFER], { type: 'image/png' }), 'fake.png');

      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.token}` },
        body: formData,
      });
      const data = await res.json();
      assert(res.status === 400, 'Fake image magic bytes rejected with 400 Bad Request');
      assert(data.error?.code === 'INVALID_FILE_TYPE', 'Error code is INVALID_FILE_TYPE');
    }

    // Test 2.2: Rejection of incorrect form field name
    {
      const formData = new FormData();
      formData.append('wrong_field', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'test.png');

      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.token}` },
        body: formData,
      });
      const data = await res.json();
      assert(res.status === 400, 'Incorrect field name returns 400 Bad Request');
    }

    // Test 2.3: Rejection of oversized file (> 5MB)
    {
      // Create a 5.1 MB buffer starting with valid PNG header
      const largeBuffer = Buffer.alloc(5.1 * 1024 * 1024);
      VALID_PNG_BUFFER.copy(largeBuffer, 0, 0, VALID_PNG_BUFFER.length);

      const formData = new FormData();
      formData.append('image', new Blob([largeBuffer], { type: 'image/png' }), 'large.png');

      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.token}` },
        body: formData,
      });
      const data = await res.json();
      assert(res.status === 400, 'File > 5MB rejected with 400 Bad Request');
      assert(data.error?.code === 'FILE_TOO_LARGE', 'Error code is FILE_TOO_LARGE');
    }

    console.log('\n--- 3. Successful Admin Image Upload ---');

    let initialStoragePath = '';
    let initialImageUrl = '';

    // Test 3.1: Admin uploads valid PNG image
    {
      const formData = new FormData();
      formData.append('image', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'snack.png');

      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.token}` },
        body: formData,
      });
      const data = await res.json();
      assert(res.status === 200, 'Valid PNG upload returns 200 OK');
      assert(data.success === true, 'Upload response success is true');
      assert(typeof data.data?.imageUrl === 'string', 'Returned snack has imageUrl');
      assert(typeof data.data?.imagePath === 'string', 'Returned snack has imagePath');
      assert(mockProvider.uploadedFiles.size === 1, 'Mock storage has 1 uploaded file');

      initialImageUrl = data.data.imageUrl;
      initialStoragePath = data.data.imagePath;

      // Verify in DB
      const dbSnack = await prisma.snack.findUnique({ where: { id: snackRecord.id } });
      assert(dbSnack?.imageUrl === initialImageUrl, 'Database has updated imageUrl');
      assert(dbSnack?.imagePath === initialStoragePath, 'Database has updated imagePath');
    }

    console.log('\n--- 4. Image Replacement & Old File Deletion ---');

    // Test 4.1: Replacing image deletes the old storage object and saves new one
    {
      const formData = new FormData();
      formData.append('image', new Blob([VALID_JPEG_BUFFER], { type: 'image/jpeg' }), 'replacement.jpg');

      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.token}` },
        body: formData,
      });
      const data = await res.json();
      assert(res.status === 200, 'Replacement upload returns 200 OK');
      assert(data.data.imagePath !== initialStoragePath, 'New imagePath generated');
      assert(mockProvider.deletedPaths.includes(initialStoragePath), 'Previous storagePath was deleted from storage');

      const dbSnack = await prisma.snack.findUnique({ where: { id: snackRecord.id } });
      assert(dbSnack?.imagePath === data.data.imagePath, 'DB updated with new imagePath');
    }

    console.log('\n--- 5. Image Deletion ---');

    // Test 5.1: Non-admin member cannot delete image
    {
      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${memberUser.token}` },
      });
      assert(res.status === 403, 'Member cannot delete image (403 Forbidden)');
    }

    // Test 5.2: Admin deletes image
    {
      const res = await fetch(`${baseUrl}/snacks/${snackRecord.id}/image`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminUser.token}` },
      });
      const data = await res.json();
      assert(res.status === 200, 'Admin delete image returns 200 OK');
      assert(data.data?.imageUrl === null, 'Returned snack imageUrl is null');
      assert(data.data?.imagePath === null, 'Returned snack imagePath is null');

      const dbSnack = await prisma.snack.findUnique({ where: { id: snackRecord.id } });
      assert(dbSnack?.imageUrl === null, 'DB imageUrl cleared to null');
      assert(dbSnack?.imagePath === null, 'DB imagePath cleared to null');
    }

    console.log('\n--- 6. Snack Deletion Cleans Up Storage ---');

    // Test 6.1: Upload image to a second snack, then delete that snack
    {
      const secondSnack = await prisma.snack.create({
        data: {
          name: `Delete Cleanup Snack ${timestamp}`,
          category: 'SAVOURY',
          quantity: 15,
          lowStockThreshold: 3,
        },
      });
      createdSnackIds.push(secondSnack.id);

      const formData = new FormData();
      formData.append('image', new Blob([VALID_WEBP_BUFFER], { type: 'image/webp' }), 'snack.webp');

      const uploadRes = await fetch(`${baseUrl}/snacks/${secondSnack.id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      const secondImagePath = uploadData.data.imagePath;

      // Delete the snack
      const delRes = await fetch(`${baseUrl}/snacks/${secondSnack.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminUser.token}` },
      });
      assert(delRes.status === 200, 'Snack deleted successfully (200 OK)');
      assert(mockProvider.deletedPaths.includes(secondImagePath), 'Associated image was removed from storage upon snack deletion');
    }

    console.log('\n================================================================');
    console.log(`  ALL IMAGE TESTS PASSED: ${passedCount} passing, ${failedCount} failing`);
    console.log('================================================================');
  } finally {
    // Reset storage provider
    storageService.resetProvider();

    // Clean up created snacks and users
    console.log('\nCleaning up test artifacts from database...');
    for (const snackId of createdSnackIds) {
      await prisma.snack.deleteMany({ where: { id: snackId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    await prisma.$disconnect();
    server.close();
  }
}

runImageTestSuite().catch((err) => {
  console.error('Fatal error in image test suite:', err);
  process.exit(1);
});
