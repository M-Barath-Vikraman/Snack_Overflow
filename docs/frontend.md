# Frontend Architecture & User Guide — Snack Overflow

## 1. Overview

The Snack Overflow frontend is a modern, responsive, full-stack office snack management web application built using **React 18**, **Vite**, and **TypeScript**. It connects directly to the backend REST APIs established in Phases 2 and 3 and uses a single runtime configuration mechanism for environment-agnostic deployment.

---

## 2. Strict Runtime Configuration

The application strictly separates configuration from compiled code:

- **Single Source of Truth**: [`public/config.js`](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/frontend/public/config.js)
  ```javascript
  window.__APP_CONFIG__ = {
    API_BASE_URL: "http://localhost:3000/api",
    WS_URL: "ws://localhost:3000"
  };
  ```
- **Configuration Reader**: [`src/config/env.ts`](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/frontend/src/config/env.ts)
  - Reads `window.__APP_CONFIG__.API_BASE_URL` at runtime.
  - No build-time `VITE_API_BASE_URL` dependencies.
  - No localhost fallbacks.
  - Fails fast and visibly with a dedicated configuration error screen if `config.js` is missing or malformed.
- **Switching Between Development & Production**:
  - In local development: `public/config.js` points to `http://localhost:3000/api`.
  - In staging/production: Mount or overwrite `/config.js` with your production API URL (e.g. `https://api.yourdomain.com/api`).
  - **No rebuilding required**: The static JavaScript bundle does not need to be recompiled when deploying across environments.

---

## 3. Application Architecture

```text
frontend/
├── public/
│   └── config.js              # Runtime configuration (source of truth)
├── src/
│   ├── config/
│   │   └── env.ts             # Runtime config reader with validation
│   ├── context/
│   │   └── AuthContext.tsx    # Global auth state, persistence & role helpers
│   ├── services/
│   │   ├── apiClient.ts       # Centralized HTTP client (JWT injection, error normalization)
│   │   ├── authService.ts     # Login, registration, token persistence
│   │   └── snackService.ts    # Snacks CRUD, search, filter, pagination, consume, vote, summary
│   ├── components/
│   │   ├── Layout.tsx         # Sidebar, mobile topbar, role badges, user profile, logout
│   │   ├── Modal.tsx          # Accessible, reusable modal dialog
│   │   ├── StatusBadge.tsx    # Derived stock badge (in_stock, low_stock, out_of_stock)
│   │   ├── CategoryBadge.tsx  # Category indicator (Sweet, Savoury, Drink, Healthy-ish)
│   │   ├── SnackCard.tsx      # Snack card with visual stock meter, voting & quick-consume
│   │   ├── SnackDetailModal.tsx # Full snack details, amount picker consume, vote toggle, admin actions
│   │   ├── AddEditSnackModal.tsx # Admin create and edit modal
│   │   ├── RestockModal.tsx   # Admin restock modal with stock preview
│   │   └── DeleteConfirmModal.tsx # Admin delete dialog with RESTRICT error explanation
│   ├── pages/
│   │   ├── LoginPage.tsx      # Email/password authentication
│   │   ├── RegisterPage.tsx   # Account creation (strictly MEMBER role)
│   │   ├── DashboardPage.tsx  # Metrics cards & Snack of the Week
│   │   ├── InventoryPage.tsx  # Search, category/status filters, sorting & server pagination
│   │   └── ActivityPage.tsx   # Admin-only audit log with real-time updates, filters, search & pagination
│   ├── styles/
│   │   └── main.css           # Clean SaaS CSS styling with responsive media queries
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces & types
│   ├── App.tsx                # Route switcher & runtime config error boundary
│   └── main.tsx               # Root entry point with AuthProvider
└── testFrontendIntegration.ts # End-to-end frontend integration test suite
```

---

## 4. Pages & User Flows

### 4.1 Authentication Pages
- **Login (`LoginPage.tsx`)**:
  - Connects to `POST /api/auth/login`.
  - Verifies email and password.
  - Automatically stores JWT in `localStorage` and populates `AuthContext`.
  - Redirects authenticated users to the dashboard.
- **Registration (`RegisterPage.tsx`)**:
  - Connects to `POST /api/auth/register`.
  - Requires full name, valid email, and minimum 8-character password.
  - Automatically assigns the `MEMBER` role; prevents role selection or elevation.
  - Automatically stores JWT upon successful registration.

### 4.2 Dashboard (`DashboardPage.tsx`)
- Connected to `GET /api/snacks/summary`.
- **4 Metric Cards**:
  1. *Total Snack Varieties*
  2. *Fully Stocked* (green)
  3. *Low Stock Alert* (amber, when `quantity <= lowStockThreshold`)
  4. *Out of Stock* (red, when `quantity == 0`)
- **Snack of the Week**:
  - Highlights the most popular snack elected by community vote.
  - Displays friendly empty state when no community votes exist yet.
- **Recent Pantry Additions**: Quick overview table with direct navigation to the full inventory.

### 4.3 Snack Pantry Inventory (`InventoryPage.tsx`)
- Connected to `GET /api/snacks`.
- **Server-Side Search**: Debounced search by snack name (`search` query param).
- **Category Filtering**: Dropdown filter for `SWEET`, `SAVOURY`, `DRINK`, and `HEALTHY_ISH`.
- **Stock Status Filtering**: Filter by derived status `IN_STOCK`, `LOW_STOCK`, and `OUT_OF_STOCK`.
- **Server-Side Sorting**: Sort by `Newest First`, `Name (A-Z)`, `Highest Stock`, or `Lowest Stock`.
- **Server-Side Pagination**: Shows current page, total pages, and total item count with Previous/Next controls.
- **Quick Actions**:
  - *Grab One*: Instantly consumes 1 packet with an automatically generated `Idempotency-Key` header.
  - *Vote*: Heart toggle button to cast or remove votes.
  - *Card Click*: Opens the comprehensive `SnackDetailModal`.

### 4.4 Admin Activity History (`ActivityPage.tsx` — Phase 6)
- Connected to `GET /api/activities`.
- Strictly accessible to users with the `ADMIN` role. Hidden from navigation for `MEMBER` users and protected at the route level in `App.tsx`.
- **Audit Table**:
  - Displays timestamp formatted to local date and time.
  - Displays user profile (Name and Email).
  - Displays action badge (`😋 Consumed` in red/amber, `📦 Restocked` in green).
  - Displays snack name with associated category badge.
  - Displays net amount (`-X` for consumed, `+X` for restocked).
- **Filtering & Search**:
  - Action filter: `All Actions`, `Consumed`, `Restocked`.
  - Search input: 300ms debounced search matching user name, user email, or snack name.
  - Sorting: `Newest First`, `Oldest First`, `Highest Amount`, `Lowest Amount`.
- **Server-Side Pagination**: Full page navigation with Previous/Next controls and page indicators.
- **Real-Time Synchronization**:
  - Subscribed to `SNACK_CONSUMED` and `SNACK_RESTOCKED` WebSocket events.
  - Automatically triggers a debounced refresh (250ms) to update activity logs live without page reload.
  - Features reconnection reconciliation: automatically synchronizes on WebSocket reconnect.

---

## 5. Member vs. Admin Role Differences

| Feature / Action | MEMBER | ADMIN |
|---|:---:|:---:|
| Browse Inventory, Search, Filter | ✅ | ✅ |
| View Dashboard & Snack of the Week | ✅ | ✅ |
| Consume Snack (with Idempotency-Key) | ✅ | ✅ |
| Vote & Unvote for Snacks | ✅ | ✅ |
| "+ Add New Snack" Action | ❌ (Hidden) | ✅ |
| Edit Snack Details | ❌ (Hidden) | ✅ |
| Restock Inventory | ❌ (Hidden) | ✅ |
| Delete Snack Item | ❌ (Hidden) | ✅ |
| View Admin Activity History | ❌ (Hidden) | ✅ |

*Note*: In addition to UI role adaptations, backend authorization remains authoritative. Attempting to bypass the UI results in an HTTP 403 `FORBIDDEN` error.

---

## 6. Build & Test Commands

### 6.1 Frontend Test Suite
From `frontend/`:
```bash
npm test
```
Executes:
1. `testRuntimeConfig.ts`: 5 tests verifying strict `window.__APP_CONFIG__` enforcement, missing config errors, and empty URL rejection.
2. `testFrontendIntegration.ts`: 47 tests covering auth flow, persistence, logout, dashboard summary, filtering, sorting, pagination, consumption, voting, admin operations, and `ON DELETE RESTRICT` error handling.
3. `testWebSocket.ts`: 21 tests verifying runtime WebSocket URL retrieval, duplicate listener prevention, unmount cleanup, optimistic consume & 409 rollback, optimistic voting & rollback, offline REST mode, and exponential backoff calculations.
4. `testActivity.ts`: 86 tests verifying admin activity access, member role rejection, query filters (action, search, sort, pagination), sanitized relations, and real-time reconciliation.

### 6.2 Production Build
From `frontend/`:
```bash
npm run build
```
Executes `tsc -b && vite build` and generates optimized bundles in `frontend/dist/`.

---

## 7. Real-Time WebSockets & Optimistic UI (Phase 5)

### 7.1 WebSocket Hook & Context
- Centralized `WebSocketProvider` (`frontend/src/context/WebSocketContext.tsx`) manages a single active connection per browser tab.
- Automatically connects to `getWsUrl()` using the signed JWT token on user login.
- Subscriptions are managed using a Set registry that guarantees zero duplicate listeners and automatically unregisters callbacks when components unmount.

### 7.2 Connection Status Indicator
The top header and sidebar incorporate a real-time `ConnectionStatusBadge`:
- 🟢 **Live Sync**: Connected and listening for updates.
- 🟡 **Reconnecting...**: Reconnecting using exponential backoff (1s, 2s, 4s, 8s, max 10s).
- ⚪ **Offline (REST)**: Offline mode. Full REST API functionality continues seamlessly.

### 7.3 Optimistic Stock Consumption & Rollback
When a user clicks "Grab One" or consumes stock:
1. **Immediate Local Decrement**: The quantity in the React state immediately decreases by the consumption amount, and derived stock status updates (e.g. `IN_STOCK` $\to$ `LOW_STOCK` or `OUT_OF_STOCK`).
2. **REST Dispatch**: The request is sent to `POST /api/snacks/:id/consume` with a unique `Idempotency-Key`.
3. **Reconciliation**: On success (`200 OK`), state is reconciled with authoritative PostgreSQL server data.
4. **Automatic Rollback**: If the server rejects the request (e.g. `409 Conflict` with `INSUFFICIENT_STOCK`), the local state rolls back to its exact pre-optimistic snapshot, and an alert is displayed:
   `"Someone beat you to the last packet!"`

### 7.4 Optimistic Voting & Rollback
When a user clicks the heart button:
1. **In-Flight Lock**: Rapid duplicate clicks are blocked via `votingIds` state.
2. **Immediate Toggle**: `hasUserVoted` flips immediately, and `voteCount` increments/decrements.
3. **REST Dispatch**: Call is made to `POST` or `DELETE /api/snacks/:id/vote`.
4. **Reconciliation / Rollback**: On success, `totalVotes` aligns with the server response; on network or API failure, state rolls back to the previous snapshot.

### 7.5 Reconnection State Reconciliation
When the WebSocket connection is restored after a network outage, `InventoryPage` and `DashboardPage` automatically execute background REST calls (`fetchSnacks()`, `fetchDashboardData()`) to catch up on any inventory changes or votes that occurred while disconnected.

