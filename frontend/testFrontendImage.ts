// Frontend Snack Image Upload & Storage Integration Verification
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
import { storageService, StorageProvider, StorageUploadResult } from '../backend/src/services/storageService';
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

// Mock Storage Provider
class MockStorageProvider implements StorageProvider {
  public uploadedFiles: Map<string, { buffer: Buffer; mimeType: string }> = new Map();
  public deletedPaths: string[] = [];

  public async upload(
    storagePath: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<StorageUploadResult> {
    this.uploadedFiles.set(storagePath, { buffer: fileBuffer, mimeType });
    return {
      publicUrl: `https://mock-supabase.storage.test/snack-images/${storagePath}`,
      storagePath,
    };
  }

  public async delete(storagePath: string): Promise<void> {
    this.deletedPaths.push(storagePath);
    this.uploadedFiles.delete(storagePath);
  }

  public getPublicUrl(storagePath: string): string {
    return `https://mock-supabase.storage.test/snack-images/${storagePath}`;
  }
}

const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

async function runFrontendImageTests() {
  console.log('================================================================');
  console.log('       SNACK OVERFLOW — FRONTEND IMAGE CLIENT TEST SUITE        ');
  console.log('================================================================\n');

  const mockProvider = new MockStorageProvider();
  storageService.setProvider(mockProvider);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const serverApiUrl = `http://localhost:${port}/api`;

  (global as any).window = {
    __APP_CONFIG__: {
      API_BASE_URL: serverApiUrl,
      WS_URL: `ws://localhost:${port}`,
    },
    location: { href: 'http://localhost:5173/' },
  };

  const timestamp = Date.now();
  const createdUserIds: string[] = [];
  const createdSnackIds: string[] = [];

  try {
    const adminPassword = 'AdminPassword123!';
    const hashedPassword = await hashPassword(adminPassword);
    const adminUser = await prisma.user.create({
      data: {
        name: `Frontend Image Admin ${timestamp}`,
        email: `fe_admin_img_${timestamp}@snackoverflow.test`,
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    createdUserIds.push(adminUser.id);

    // 1. Authenticate as Admin
    console.log('--- 1. Authenticate Admin ---');
    const loginRes = await authService.login(adminUser.email, adminPassword);
    assert(loginRes.success === true, 'Admin logged in via authService');
    assert(!!loginRes.data?.token, 'Received JWT token');

    // 2. Create Snack via frontend snackService
    console.log('\n--- 2. Create Snack ---');
    const createRes = await snackService.createSnack({
      name: `Frontend Image Test Snack ${timestamp}`,
      category: 'SWEET',
      quantity: 12,
      lowStockThreshold: 4,
    });
    assert(createRes.success === true, 'Snack created via snackService.createSnack');
    assert(!!createRes.data?.id, 'Snack ID returned');
    const snackId = createRes.data!.id;
    createdSnackIds.push(snackId);
    assert(createRes.data!.imageUrl === null, 'Initial imageUrl is null');

    // 3. Upload Image via frontend snackService
    console.log('\n--- 3. Upload Snack Image via snackService.uploadImage ---');
    const imageBlob = new Blob([VALID_PNG_BUFFER], { type: 'image/png' });
    const imageFile = new File([imageBlob], 'snack_photo.png', { type: 'image/png' });

    const uploadRes = await snackService.uploadImage(snackId, imageFile);
    assert(uploadRes.success === true, 'snackService.uploadImage succeeded');
    assert(typeof uploadRes.data?.imageUrl === 'string', 'Returned snack has imageUrl');
    assert(typeof uploadRes.data?.imagePath === 'string', 'Returned snack has imagePath');
    assert(uploadRes.data!.imageUrl!.includes('mock-supabase'), 'Returned imageUrl matches storage provider');
    assert(mockProvider.uploadedFiles.size === 1, 'Mock storage received 1 file');

    // 4. Verify via getSnackById
    console.log('\n--- 4. Verify snack retrieval with image ---');
    const getRes = await snackService.getSnackById(snackId);
    assert(getRes.success === true, 'snackService.getSnackById succeeded');
    assert(getRes.data?.imageUrl === uploadRes.data?.imageUrl, 'Retrieved imageUrl matches uploaded URL');

    // 5. Delete Image via frontend snackService
    console.log('\n--- 5. Delete Snack Image via snackService.deleteImage ---');
    const deleteRes = await snackService.deleteImage(snackId);
    assert(deleteRes.success === true, 'snackService.deleteImage succeeded');
    assert(deleteRes.data?.imageUrl === null, 'Returned snack imageUrl is null');
    assert(deleteRes.data?.imagePath === null, 'Returned snack imagePath is null');
    assert(mockProvider.deletedPaths.length === 1, 'Mock storage received delete request');

    // 6. Verify via getSnackById that image is null
    const getAfterDeleteRes = await snackService.getSnackById(snackId);
    assert(getAfterDeleteRes.data?.imageUrl === null, 'imageUrl is confirmed null in backend');

    console.log('\n================================================================');
    console.log(`  ALL FRONTEND IMAGE TESTS PASSED: ${passed} passing, ${failed} failing`);
    console.log('================================================================');
  } finally {
    storageService.resetProvider();
    apiClient.removeToken();

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

runFrontendImageTests().catch((err) => {
  console.error('Frontend image test suite failed:', err);
  process.exit(1);
});
