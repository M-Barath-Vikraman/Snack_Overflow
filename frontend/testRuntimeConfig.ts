import { getApiBaseUrl, getWsUrl } from './src/config/env';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✔ PASS: ${message}`);
  }
}

console.log('=== FRONTEND STRICT RUNTIME CONFIGURATION TEST ===\n');

// 1. Missing window context
(global as any).window = undefined;
let missingWindowErr = false;
try {
  getApiBaseUrl();
} catch (err: any) {
  missingWindowErr = err.message.includes('Window context is unavailable');
}
assert(missingWindowErr, 'getApiBaseUrl() throws when window is undefined');

// 2. Missing window.__APP_CONFIG__
(global as any).window = {};
let missingConfigErr = false;
try {
  getApiBaseUrl();
} catch (err: any) {
  missingConfigErr = err.message.includes('Missing runtime configuration: "window.__APP_CONFIG__" is undefined');
}
assert(missingConfigErr, 'getApiBaseUrl() throws descriptive error when window.__APP_CONFIG__ is undefined');

// 3. Empty or whitespace API_BASE_URL
(global as any).window = { __APP_CONFIG__: { API_BASE_URL: '   ' } };
let emptyUrlErr = false;
try {
  getApiBaseUrl();
} catch (err: any) {
  emptyUrlErr = err.message.includes('Invalid runtime API configuration: "API_BASE_URL" is missing or empty');
}
assert(emptyUrlErr, 'getApiBaseUrl() throws descriptive error when API_BASE_URL is empty or whitespace');

// 4. Valid runtime configuration
const mockUrl = 'https://railway.snackoverflow.production/api';
const mockWs = 'wss://railway.snackoverflow.production';
(global as any).window = {
  __APP_CONFIG__: {
    API_BASE_URL: mockUrl,
    WS_URL: mockWs,
  },
};
const apiUrl = getApiBaseUrl();
const wsUrl = getWsUrl();
assert(apiUrl === mockUrl, 'getApiBaseUrl() returns exact configured runtime API URL without fallback');
assert(wsUrl === mockWs, 'getWsUrl() returns exact configured runtime WebSocket URL without fallback');

console.log('\n=== ALL FRONTEND RUNTIME CONFIG TESTS PASSED ===');
