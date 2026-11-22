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
│   │   └── InventoryPage.tsx  # Search, category/status filters, sorting & server pagination
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
2. `testFrontendIntegration.ts`: End-to-end verification covering auth flow, persistence, logout, dashboard summary, filtering, sorting, pagination, consumption, voting, admin operations, and `ON DELETE RESTRICT` error handling.

### 6.2 Production Build
From `frontend/`:
```bash
npm run build
```
Executes `tsc -b && vite build` and generates optimized bundles in `frontend/dist/`.
