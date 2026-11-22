# Snack Overflow 🍿

A modern, full-stack snack management system designed for team offices and collaborative workplaces.

## Approved Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL (hosted on Railway) |
| **ORM** | Prisma 5.22.0 |
| **Authentication** | JWT (jsonwebtoken) + bcrypt |
| **Validation** | Zod |
| **Real-time** | WebSockets (`ws`) |
| **Containerization (Future)** | Docker |
| **Container Registry (Future)** | GitHub Container Registry (GHCR) |
| **CI/CD (Future)** | GitHub Actions |
| **Deployment (Future)** | Railway |

---

## Project Status

- [x] **Phase 1 — Project Foundation & Initial Migration** (Completed & Verified)
- [x] **Phase 2 — Backend Core APIs** (Completed & Verified with 60 automated tests)
- [x] **Phase 3 — Authentication & User Management** (Completed & Verified with 48 automated tests)
- [x] **Phase 4 — Frontend Dashboard & UI** (Completed & Verified with 52 automated tests)
- [x] **Phase 5 — Real-time WebSockets & Optimistic UI** (Completed & Verified with 49 automated tests)
- [x] **Phase 6 — Admin Activity History & Bonus Features** (Completed & Verified with 342 automated assertions)
- [x] **Phase 7 — Docker & Docker Compose** (Completed & Verified with Multi-Stage Builds & Healthy Containers)
- [x] **Phase 8 — GitHub Actions CI/CD & GHCR** (Completed & Verified with Automated Pipeline & Image Publishing)
- [ ] **Phase 9 — Railway Production Deployment** (Pending)

---

## API Endpoints Implemented

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `POST` | `/api/auth/register` | Public | Register new user (default `MEMBER`, password hashed with bcrypt) |
| `POST` | `/api/auth/login` | Public | Authenticate credentials and return signed JWT |

### Activities History (`/api/activities`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/activities` | **Admin Only** | Paginated, filtered, sorted audit trail of team consumption and restocks |

### Snacks Inventory (`/api/snacks`)

| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/health` | Public | System & database connectivity health check |
| `GET` | `/api/health` | Public | Standard API health check |
| `GET` | `/api/snacks` | Public / Optional Auth | Paginated, filtered, sorted snack inventory (PostgreSQL-level) |
| `GET` | `/api/snacks/summary` | Public | Dashboard inventory totals and Snack of the Week |
| `GET` | `/api/snacks/:id` | Public / Optional Auth | Single snack details, derived status, and vote status |
| `POST` | `/api/snacks` | **Admin Only** | Create a new snack item |
| `PATCH` | `/api/snacks/:id` | **Admin Only** | Update permitted snack fields |
| `DELETE` | `/api/snacks/:id` | **Admin Only** | Delete snack (restricted if historical activity exists) |
| `POST` | `/api/snacks/:id/consume` | **Authenticated** | Atomic stock consumption with `Idempotency-Key` support |
| `POST` | `/api/snacks/:id/restock` | **Admin Only** | Atomic inventory restocking |
| `POST` | `/api/snacks/:id/vote` | **Authenticated** | Vote for a snack (one vote per user) |
| `DELETE` | `/api/snacks/:id/vote` | **Authenticated** | Remove vote for a snack |

See [docs/api.md](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/docs/api.md) for full request/response contracts and query parameters.
See [docs/realtime.md](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/docs/realtime.md) for the WebSocket architecture, event catalog, and reconnection strategy.
See [docs/frontend.md](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/docs/frontend.md) for optimistic UI updates, rollbacks, and connection indicators.
See [docs/docker.md](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/docs/docker.md) for containerization, multi-stage builds, and Docker Compose orchestration.
See [docs/ci-cd.md](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/docs/ci-cd.md) for GitHub Actions CI/CD pipeline, security policies, and GHCR image publishing.
See [docs/concurrency.md](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/docs/concurrency.md) for the atomic concurrency and idempotency specifications.
See [docs/security.md](file:///C:/Users/barat/Desktop/bpf/Snack_Overflow/docs/security.md) for JWT token policies and WebSocket handshake verification.

---

## Testing & Verification

Run the automated backend test suite:
```bash
cd backend
npm test
```

### Initial Demo Seed Data
To seed initial demo accounts and snacks idempotently:
```bash
cd backend
npm run seed
```

**Seeded Accounts**:
- Admin: `admin@snackoverflow.com` (`AdminPassword123!`)
- Member: `member@snackoverflow.com` (`MemberPassword123!`)

**Seeded Inventory**:
- Dark Chocolate Almonds (SWEET, Qty: 24, Threshold: 5)
- Wasabi Peas (SAVOURY, Qty: 18, Threshold: 5)
- Sparkling Lime Water (DRINK, Qty: 12, Threshold: 6)
- Roasted Seaweed Crisps (HEALTHY_ISH, Qty: 15, Threshold: 4)

### Verified Test Coverage (55 passing assertions):
1. **Authorization & RBAC**: Admin-only route protection, member route access, unauthenticated request rejection.
2. **Input Validation**: Zod schema rejection on missing/invalid body, query, and path parameters.
3. **Snack CRUD**: Creation, single retrieval, editing, and name uniqueness enforcement.
4. **PostgreSQL Filtering & Pagination**: Search (`ILIKE`), category filtering, derived status filtering (`IN_STOCK`, `LOW_STOCK`), and pagination metadata.
5. **Atomic Concurrency**: 10 simultaneous consumption requests for 3 items $\rightarrow$ exactly 3 succeed, 7 fail with 409 (`"Someone beat you to the last packet!"`), zero negative stock, exactly 3 Activity records created.
6. **Restocking**: Atomic increment and Activity audit record creation.
7. **Referential Integrity**: Deletion of snacks with linked Activity records prevented via `ON DELETE RESTRICT`.
8. **Voting & Unvoting**: Single vote per user enforced by composite unique constraint `Vote(userId, snackId)`, duplicate vote rejection, and vote count tracking.
9. **Idempotency**: Replaying requests with identical `Idempotency-Key` returns original cached response with `X-Idempotent-Replay: true` without double-decrementing stock; key reuse with different parameters is rejected.
10. **Dashboard Summary**: Accurate category counts and deterministic Snack of the Week calculation.

---

## Remaining Bonus Features Verification Summary

| Bonus Feature | Implementation Details | Status | Verified In |
|---|---|:---:|---|
| **User Signup & Normalization** | Dedicated `POST /api/auth/register` with Zod validation, lowercase email normalization, bcrypt hashing (work factor 10), and automatic `MEMBER` role assignment with anti-escalation enforcement. | **Complete** | `authTestSuite.ts` & `testFrontendIntegration.ts` |
| **Server-Side Sorting** | Multi-field PostgreSQL sorting on `/api/snacks` (`createdAt`, `name`, `quantity`, `category`) and `/api/activities` (`createdAt`, `amount`) with deterministic secondary ID sorting to prevent page jitter. | **Complete** | `apiTestSuite.ts` & `activityTestSuite.ts` |
| **Optimistic UI with Rollback** | Instant client-side stock deduction and vote tally toggle with automatic error rollback and user alerts upon HTTP 409 (`INSUFFICIENT_STOCK`) conflicts. | **Complete** | `testWebSocket.ts` |
| **Real-Time WebSockets** | Handshake JWT authentication, close code 4401 on invalid/expired tokens, post-commit event broadcasting, four explicit connection states, and exponential backoff with jitter. | **Complete** | `websocketTestSuite.ts` & `testWebSocket.ts` |
| **Idempotency-Key Support** | RFC-compliant `Idempotency-Key` tracking with 24-hour expiration in PostgreSQL, atomic hash validation, and cached replay responses with `X-Idempotent-Replay: true`. | **Complete** | `apiTestSuite.ts` |
| **Admin Activity History** | Admin-only audit trail (`GET /api/activities`) with search, action filtering, sorting, pagination, strict user sanitization (zero password hashes), and live debounced real-time synchronization. | **Complete** | `activityTestSuite.ts` & `testActivity.ts` |
