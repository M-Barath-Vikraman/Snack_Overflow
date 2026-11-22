# Real-Time WebSocket Architecture & Synchronization — Snack Overflow (Phase 5)

## 1. Overview

Snack Overflow utilizes a native WebSocket architecture powered by the Node.js `ws` library on the backend and native browser WebSockets on the frontend. Real-time synchronization keeps stock levels, community votes, and dashboard statistics in lockstep across all connected users without polling or page refreshes.

---

## 2. WebSocket Server Architecture

- **Protocol**: Standard WebSocket (`ws://` in development, `wss://` in production).
- **Endpoint**: Configured dynamically via `WS_URL` in `window.__APP_CONFIG__` (e.g. `ws://localhost:3000`).
- **Singleton Server**: Managed via `SnackWebSocketServer` (`backend/src/websocket/server.ts`), integrated into the shared HTTP server.
- **Connection Isolation**: Each client connection is mapped to an authenticated user context (`userId`, `email`, `role`).

---

## 3. Handshake Authentication & Security

### 3.1 Authentication Mechanism
WebSocket connections must be authenticated upon initial handshake. Clients provide a signed JWT Bearer token via either:
1. **URL Query Parameter**: `${WS_URL}?token=${encodeURIComponent(jwtToken)}`
2. **Subprotocol Header**: `Sec-WebSocket-Protocol: ${jwtToken}`

### 3.2 Handshake Validation Flow
1. The server extracts the token from the incoming upgrade request.
2. The server calls `verifyToken(token)` using HMAC SHA-256 and `JWT_SECRET`.
3. If the token is **missing, invalid, tampered, or expired**:
   - The connection is immediately terminated with WebSocket close code **`4401`** (Unauthorized) and a descriptive reason (e.g., `Unauthorized: Missing authentication token` or `Unauthorized: jwt expired`).
4. If valid, the connection is registered in memory alongside the cryptographically verified `UserPayload` (`userId`, `email`, `role`).

> [!IMPORTANT]
> Client-supplied roles or user IDs in message bodies are never trusted. All client identities are permanently bound to the verified JWT signature established during handshake.

---

## 4. Standardized Event Envelope

Every event broadcast by the backend conforms to a consistent JSON envelope:

```typescript
export interface WebSocketEventEnvelope<T = any> {
  id: string;        // Unique event ID (e.g. "evt_1795334829126_a1b2c3d4")
  type: WsEventType; // Standardized event type
  snackId: string;   // Affected snack ID
  timestamp: string; // ISO 8601 UTC timestamp
  payload: T;        // Typed event data
}
```

Sensitive fields (passwords, password hashes, secrets, internal database connection strings) are **strictly forbidden** from broadcast payloads.

---

## 5. Event Catalog

### 5.1 Stock Events

#### `SNACK_CONSUMED`
Broadcast when any user consumes stock.
```json
{
  "id": "evt_1795334829126_e7f8g9h0",
  "type": "SNACK_CONSUMED",
  "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
  "timestamp": "2026-11-22T08:00:00.000Z",
  "payload": {
    "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
    "name": "Sparkling Lime Water",
    "quantity": 11,
    "lowStockThreshold": 6,
    "status": "IN_STOCK",
    "action": "CONSUMED",
    "amount": 1,
    "voteCount": 3,
    "updatedAt": "2026-11-22T08:00:00.000Z"
  }
}
```

#### `SNACK_RESTOCKED`
Broadcast when an admin restocks inventory.
```json
{
  "id": "evt_1795334829127_a2b3c4d5",
  "type": "SNACK_RESTOCKED",
  "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
  "timestamp": "2026-11-22T08:01:00.000Z",
  "payload": {
    "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
    "name": "Sparkling Lime Water",
    "quantity": 25,
    "lowStockThreshold": 6,
    "status": "IN_STOCK",
    "action": "RESTOCKED",
    "amount": 14,
    "voteCount": 3,
    "updatedAt": "2026-11-22T08:01:00.000Z"
  }
}
```

#### `SNACK_CREATED`
Broadcast when an admin registers a new snack item.
```json
{
  "id": "evt_1795334829128_c3d4e5f6",
  "type": "SNACK_CREATED",
  "snackId": "89e888f2-g7c8-5c2b-c354-92gc7gdd5d5b",
  "timestamp": "2026-11-22T08:02:00.000Z",
  "payload": {
    "snack": {
      "id": "89e888f2-g7c8-5c2b-c354-92gc7gdd5d5b",
      "name": "Organic Dried Mango",
      "category": "SWEET",
      "quantity": 20,
      "lowStockThreshold": 5,
      "status": "IN_STOCK",
      "voteCount": 0,
      "createdAt": "2026-11-22T08:02:00.000Z",
      "updatedAt": "2026-11-22T08:02:00.000Z"
    }
  }
}
```

#### `SNACK_UPDATED`
Broadcast when an admin edits snack metadata or threshold.
```json
{
  "id": "evt_1795334829129_e5f6g7h8",
  "type": "SNACK_UPDATED",
  "snackId": "89e888f2-g7c8-5c2b-c354-92gc7gdd5d5b",
  "timestamp": "2026-11-22T08:03:00.000Z",
  "payload": {
    "snack": { ... }
  }
}
```

#### `SNACK_DELETED`
Broadcast when an admin removes a snack.
```json
{
  "id": "evt_1795334829130_g7h8i9j0",
  "type": "SNACK_DELETED",
  "snackId": "89e888f2-g7c8-5c2b-c354-92gc7gdd5d5b",
  "timestamp": "2026-11-22T08:04:00.000Z",
  "payload": {
    "snackId": "89e888f2-g7c8-5c2b-c354-92gc7gdd5d5b"
  }
}
```

---

### 5.2 Voting Events

#### `SNACK_VOTED`
Broadcast when a user casts a vote.
```json
{
  "id": "evt_1795334829131_k1l2m3n4",
  "type": "SNACK_VOTED",
  "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
  "timestamp": "2026-11-22T08:05:00.000Z",
  "payload": {
    "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
    "totalVotes": 4
  }
}
```

#### `SNACK_UNVOTED`
Broadcast when a user withdraws a vote.
```json
{
  "id": "evt_1795334829132_m3n4o5p6",
  "type": "SNACK_UNVOTED",
  "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
  "timestamp": "2026-11-22T08:06:00.000Z",
  "payload": {
    "snackId": "78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a",
    "totalVotes": 3
  }
}
```

---

### 5.3 System & Heartbeat Events

- **`PING`**: Client-to-server heartbeat message (`{"type":"PING"}`). Sent every 25 seconds by the frontend.
- **`PONG`**: Server-to-client reply confirming socket liveness.
- **`AUTH_SUCCESS`**: Sent by the server immediately upon successful JWT validation.

---

## 6. Post-Commit Broadcast Consistency

To guarantee transactional integrity:
1. **Strict Post-Commit Ordering**: Broadcast calls (`wsServer.broadcast(...)`) are invoked **strictly after** the underlying Prisma `$transaction` or database statement successfully resolves.
2. **Zero False Events on Failure**: If a consumption attempt encounters insufficient inventory, PostgreSQL returns 0 updated rows and throws `AppError(..., 409, 'INSUFFICIENT_STOCK')`. The transaction is aborted, and the broadcast line is never reached.
3. **Idempotency Replay Safety**: When an idempotency key replay occurs (`isIdempotentReplay: true`), no new stock change occurs and **no duplicate broadcast** is emitted.

---

## 7. Frontend Lifecycle & Reconnection Strategy

### 7.1 Connection States
The application exposes four explicit connection states via `useWebSocket()`:
- `connecting`: Handshake in progress.
- `connected`: Active, live socket. Status indicator displays green **"Live Sync"**.
- `reconnecting`: Temporary network interruption. Status indicator displays amber **"Reconnecting..."**.
- `disconnected`: Logged out or offline. Status indicator displays slate **"Offline (REST)"**.

### 7.2 Exponential Backoff with Jitter Ceiling
When a socket drops unintentionally (e.g. Wi-Fi blip or proxy restart), the client reconnects automatically:
$$\text{delay} = \min(1000 \times 2^{\text{attempt}}, 10000)\text{ ms}$$
- Attempt 0: 1,000 ms
- Attempt 1: 2,000 ms
- Attempt 2: 4,000 ms
- Attempt 3: 8,000 ms
- Attempt 4+: 10,000 ms ceiling

If the connection is rejected with code `4401` (expired or invalid token) or closed intentionally upon logout, automatic reconnection is suspended.

### 7.3 State Reconciliation on Reconnect
When the connection transitions from `reconnecting` or `disconnected` back to `connected`, the application executes a background REST fetch (`fetchSnacks()` and `fetchDashboardData()`) to seamlessly recover any events missed while offline.

### 7.4 Offline REST Mode
A WebSocket disconnection **never disables or blocks** standard user operations. All REST endpoints (`/api/snacks`, `/consume`, `/vote`, etc.) continue functioning independently over HTTP.

---

## 8. Automated Testing & Verification

Run the dedicated real-time test suite:
```bash
# Backend WebSocket test suite (connection auth, reject bad token, post-commit consistency, multi-client sync)
cd backend
npx tsx src/tests/websocketTestSuite.ts

# Frontend WebSocket & Optimistic UI test suite
cd frontend
npm test
```
