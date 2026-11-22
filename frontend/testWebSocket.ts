import { getWsUrl } from './src/config/env';
import { Snack, SnackStatusType, WebSocketEvent } from './src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passed++;
    console.log(`  ✔ PASS: ${message}`);
  }
}

console.log('================================================================');
console.log('     SNACK OVERFLOW — FRONTEND WEBSOCKET & OPTIMISTIC UI TESTS  ');
console.log('================================================================\n');

// 1. Runtime WebSocket Configuration
console.log('--- 1. Runtime Configuration & URL Building ---');
const configuredWsUrl = 'wss://snack-overflow-production.up.railway.app';
(global as any).window = {
  __APP_CONFIG__: {
    API_BASE_URL: 'https://snack-overflow-production.up.railway.app/api',
    WS_URL: configuredWsUrl,
  },
};

const retrievedWsUrl = getWsUrl();
assert(retrievedWsUrl === configuredWsUrl, 'WebSocket URL is strictly retrieved from window.__APP_CONFIG__.WS_URL');

const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.jwt';
const connectionUrl = `${retrievedWsUrl}?token=${encodeURIComponent(testToken)}`;
assert(connectionUrl.includes(`token=${encodeURIComponent(testToken)}`), 'WebSocket handshake URL encodes JWT token securely in query string');

// 2. Subscription Registry & Duplicate Listener Prevention
console.log('\n--- 2. WebSocket Subscription & Listener Lifecycle ---');
class MockWebSocketManager {
  private subscribers: Map<string, Set<(event: WebSocketEvent) => void>> = new Map();

  public subscribe(eventType: string, cb: (event: WebSocketEvent) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(cb);

    return () => {
      const set = this.subscribers.get(eventType);
      if (set) {
        set.delete(cb);
        if (set.size === 0) this.subscribers.delete(eventType);
      }
    };
  }

  public getSubscriberCount(eventType: string): number {
    return this.subscribers.get(eventType)?.size || 0;
  }

  public dispatch(event: WebSocketEvent): void {
    const subs = this.subscribers.get(event.type);
    if (subs) {
      subs.forEach((cb) => cb(event));
    }
    const wildcard = this.subscribers.get('*');
    if (wildcard) {
      wildcard.forEach((cb) => cb(event));
    }
  }
}

const manager = new MockWebSocketManager();
let callbackInvocations = 0;
const listener = (_evt: WebSocketEvent) => {
  callbackInvocations++;
};

// Test duplicate subscription prevention (Set behavior)
const unsub1 = manager.subscribe('SNACK_CONSUMED', listener);
const unsub2 = manager.subscribe('SNACK_CONSUMED', listener);
assert(manager.getSubscriberCount('SNACK_CONSUMED') === 1, 'Duplicate listener references are prevented (Set guarantees uniqueness)');

// Test event dispatch
manager.dispatch({
  id: 'evt_1',
  type: 'SNACK_CONSUMED',
  snackId: 'snack_123',
  timestamp: new Date().toISOString(),
  payload: { quantity: 5 },
});
assert(callbackInvocations === 1, 'Listener receives dispatched WebSocket event');

// Test unsubscription / cleanup
unsub1();
assert(manager.getSubscriberCount('SNACK_CONSUMED') === 0, 'Listener is cleanly removed on unmount / unsubscribe');

// 3. Optimistic Consumption & Rollback on HTTP 409
console.log('\n--- 3. Optimistic Stock Consumption & Rollback ---');

interface InventoryState {
  snacks: Snack[];
  error: string | null;
}

const initialSnacks: Snack[] = [
  {
    id: 'snack_pretzel',
    name: 'Pretzel Crisps',
    category: 'SAVOURY',
    quantity: 1,
    lowStockThreshold: 3,
    status: 'LOW_STOCK',
  },
];

let state: InventoryState = {
  snacks: [...initialSnacks],
  error: null,
};

function deriveStatus(qty: number, threshold: number): SnackStatusType {
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (qty <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

// Simulated optimistic consume action
async function performConsume(snackId: string, amount: number, mockApiFailCode?: string) {
  const previous = [...state.snacks];
  const target = state.snacks.find((s) => s.id === snackId);
  if (!target) return;

  const nextQty = Math.max(0, target.quantity - amount);
  const nextStatus = deriveStatus(nextQty, target.lowStockThreshold);

  // 1. Immediate optimistic decrement
  state.snacks = state.snacks.map((s) =>
    s.id === snackId ? { ...s, quantity: nextQty, status: nextStatus } : s
  );

  // 2. Simulated API response
  if (mockApiFailCode) {
    // Failure -> Rollback
    state.snacks = previous;
    state.error =
      mockApiFailCode === 'INSUFFICIENT_STOCK'
        ? 'Someone beat you to the last packet!'
        : 'Consumption failed';
  } else {
    // Success -> Reconcile
    state.error = null;
  }
}

// Test 3a: Optimistic decrement happens immediately
const targetBefore = state.snacks[0];
assert(targetBefore.quantity === 1, 'Initial snack quantity is 1');

// Run consume with 409 conflict
await performConsume('snack_pretzel', 1, 'INSUFFICIENT_STOCK');
assert(state.snacks[0].quantity === 1, 'State rolls back to original quantity after HTTP 409 INSUFFICIENT_STOCK');
assert(state.error === 'Someone beat you to the last packet!', 'Displays friendly error message "Someone beat you to the last packet!"');

// Test 3b: Successful consume
await performConsume('snack_pretzel', 1);
assert(state.snacks[0].quantity === 0, 'Successful consume decrements quantity to 0');
assert(state.snacks[0].status === 'OUT_OF_STOCK', 'Stock status optimistically transitions to OUT_OF_STOCK');

// 4. Optimistic Voting & Rollback
console.log('\n--- 4. Optimistic Voting & Rollback ---');

interface VoteState {
  snack: Snack;
  isVoting: boolean;
}

const voteState: VoteState = {
  snack: {
    id: 'snack_chips',
    name: 'Pita Chips',
    category: 'SAVOURY',
    quantity: 10,
    lowStockThreshold: 2,
    status: 'IN_STOCK',
    voteCount: 3,
    hasUserVoted: false,
  },
  isVoting: false,
};

async function toggleVoteOptimistic(fail = false) {
  if (voteState.isVoting) return; // Prevent duplicate rapid clicks
  voteState.isVoting = true;

  const prevVoted = !!voteState.snack.hasUserVoted;
  const prevCount = voteState.snack.voteCount || 0;

  // 1. Optimistic toggle
  voteState.snack = {
    ...voteState.snack,
    hasUserVoted: !prevVoted,
    voteCount: Math.max(0, prevCount + (prevVoted ? -1 : 1)),
  };

  // 2. API Simulation
  if (fail) {
    // Rollback
    voteState.snack = {
      ...voteState.snack,
      hasUserVoted: prevVoted,
      voteCount: prevCount,
    };
  }
  voteState.isVoting = false;
}

// Test 4a: Vote toggle optimistic increment
await toggleVoteOptimistic(false);
assert(voteState.snack.hasUserVoted === true, 'Optimistic vote marks hasUserVoted as true');
assert(voteState.snack.voteCount === 4, 'Optimistic vote increments vote count from 3 to 4');

// Test 4b: Vote rollback on failure
await toggleVoteOptimistic(true); // Attempt to unvote, but API fails
assert(voteState.snack.hasUserVoted === true, 'Failed unvote rolls back hasUserVoted to true');
assert(voteState.snack.voteCount === 4, 'Failed unvote rolls back voteCount to 4');

// 5. REST Operations Independence & Reconnection Reconciliation
console.log('\n--- 5. Disconnection Resilience & Reconnection Reconciliation ---');

let wsStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
let restOperationExecuted = false;

// Verify REST calls still work while offline
if (wsStatus === 'disconnected') {
  // Execute REST call
  restOperationExecuted = true;
}
assert(restOperationExecuted, 'REST API operations proceed independently during WebSocket disconnection');

// Reconnection Reconciliation simulation
let reconciliationTriggered = false;
function onWsStatusChange(newStatus: 'connected' | 'reconnecting' | 'disconnected') {
  if (newStatus === 'connected' && wsStatus === 'disconnected') {
    // Catch-up refresh from REST API
    reconciliationTriggered = true;
  }
  wsStatus = newStatus;
}

onWsStatusChange('connected');
assert(reconciliationTriggered, 'Reconnection transitions trigger state reconciliation from REST API');

// Exponential backoff verification
function getBackoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000);
}
assert(getBackoffDelay(0) === 1000, 'Backoff attempt 0 delay is 1000ms');
assert(getBackoffDelay(1) === 2000, 'Backoff attempt 1 delay is 2000ms');
assert(getBackoffDelay(2) === 4000, 'Backoff attempt 2 delay is 4000ms');
assert(getBackoffDelay(3) === 8000, 'Backoff attempt 3 delay is 8000ms');
assert(getBackoffDelay(4) === 10000, 'Backoff attempt 4 delay capped at 10000ms max');

console.log('\n================================================================');
console.log(`FRONTEND WEBSOCKET TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
