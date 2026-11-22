# Concurrency & Idempotency Architecture — Snack Overflow

## 1. Concurrency Strategy: Atomic Consumption

### 1.1 The Challenge
In a shared workplace snack inventory, multiple users frequently attempt to consume the last remaining packets simultaneously. Simple application-side stock checking (e.g., `SELECT quantity`, checking `if (quantity >= amount)` in JavaScript, followed by `UPDATE quantity`) suffers from race conditions (Time-of-Check to Time-of-Use / TOCTOU), causing inventory to drop below zero.

### 1.2 PostgreSQL-Level Conditional Update
Snack Overflow achieves atomic stock protection directly within the database engine using PostgreSQL's row-level locking semantics on conditional updates:

```sql
UPDATE "Snack"
SET "quantity" = "quantity" - $amount, "updatedAt" = NOW()
WHERE "id" = $snackId AND "quantity" >= $amount
RETURNING id, name, category, quantity, "lowStockThreshold", "createdAt", "updatedAt";
```

### 1.3 Execution Mechanics
1. **Row Lock Acquisition**: When concurrent transactions attempt to update the same snack row, PostgreSQL serializes the updates by acquiring an exclusive row lock for the first transaction.
2. **Fresh Row Version Evaluation**: In PostgreSQL's default `READ COMMITTED` transaction isolation level, subsequent transactions block until the first transaction commits. Upon lock acquisition, the subsequent transaction re-evaluates the `WHERE` condition against the **newly committed row version**.
3. **Atomic Zero-Row Fallback**: If the updated quantity has dropped below `$amount`, the condition `"quantity" >= $amount` evaluates to `FALSE`. PostgreSQL updates **0 rows** and returns an empty result set.
4. **Transaction Abort & Zero Artifacts**:
   - When 0 rows are returned, the service throws `AppError('Someone beat you to the last packet!', 409, 'INSUFFICIENT_STOCK')`.
   - The entire transaction aborts and rolls back.
   - **No `Activity` record** is created, and **no `IdempotencyKey`** is committed.
5. **Database-Level Safeguard**:
   As a redundant safeguard, the PostgreSQL database CHECK constraint `CHECK ("quantity" >= 0)` guarantees that quantity cannot become negative even in the presence of unhandled edge cases or raw SQL queries.

### 1.4 Verified Test Scenario
- **Test Condition**: Initial snack quantity = 3 packets.
- **Concurrent Load**: 10 users simultaneously send `POST /api/snacks/:id/consume` (`amount: 1`) via `Promise.all`.
- **Actual Verified Outcome**:
  - Exactly **3 requests** succeeded with `200 OK`.
  - Exactly **7 requests** failed with `409 Conflict` (`"Someone beat you to the last packet!"`).
  - Final database stock: **exactly 0** (never negative).
  - Activity audit records committed: **exactly 3**.

---

## 2. Idempotency Architecture for Consumption

### 2.1 Overview & Header Specification
Network retries and mobile reconnects can duplicate client HTTP requests. Clients may supply the standard header:
```http
Idempotency-Key: <unique-client-uuid-or-token>
```

### 2.2 Model & Database Schema
```prisma
model IdempotencyKey {
  id             String    @id @default(uuid())
  key            String
  userId         String
  requestPath    String
  responseStatus Int?
  responseBody   Json?
  createdAt      DateTime  @default(now())
  expiresAt      DateTime?
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, key])
  @@index([expiresAt])
}
```

### 2.3 Key Lifecycle, Expiration & Idempotent Replay Flow

```text
Client Request (with Idempotency-Key: K)
                    │
                    ▼
       ┌───────────────────────────┐
       │ Check [userId, K] in DB   │
       └────────────┬──────────────┘
                    │
        Exists? ────┼───────────────────────────┐
                    │ No                        │ Yes
                    ▼                           ▼
       ┌──────────────────────────┐    ┌─────────────────────────────────┐
       │ Begin DB Transaction     │    │ Expired? (expiresAt < NOW())    │
       │ Atomic conditional stock │    └──────────────┬──────────────────┘
       │ update                   │                   │
       │ Insert [userId, K]       │         Yes ──────┴────────── No
       └────────────┬─────────────┘         │                     │
                    │                       ▼                     ▼
          Success? ─┼─────────┐        ┌─────────────────┐ ┌─────────────────────────────────┐
                    │ Yes     │No      │ Begin DB Tx     │ │ Completed? (responseStatus != 0)│
                    ▼         ▼        │ Delete expired  │ └──────────────┬──────────────────┘
       ┌────────────────┐ ┌──────────┐ │ [userId, K]     │                │
       │ Commit Tx:     │ │ Rollback │ │ Atomic stock    │    No ─────────┼────────── Yes
       │ Store Response │ │ Tx:      │ │ update          │    │                      │
       │ Return 200 OK  │ │ Return   │ │ Insert new key  │    ▼                      ▼
       └────────────────┘ │ 409      │ └────────┬────────┘ ┌──────────────┐       ┌──────────────────────┐
                          └──────────┘          │          │ 409 Conflict │       │ Verify Payload Hash  │
                                                ▼          │ (In Progress)│       └──────────┬───────────┘
                                           Success Tx?     └──────────────┘                  │
                                           Commit & return 200            Match? ───┼───────────┐
                                                                                    │ Yes       │ No
                                                                                    ▼           ▼
                                                                         ┌──────────────────┐ ┌──────────────┐
                                                                         │ Return Cached    │ │ 409 Conflict │
                                                                         │ Response (Replay)│ │ (Payload     │
                                                                         │ X-Idempotent: true││  Mismatch)   │
                                                                         └──────────────────┘ └──────────────┘
```

### 2.4 Safety Guarantees & Expired Key Reuse
1. **User Scoping**: Keys are uniquely scoped per user via `@@unique([userId, key])`. Different users cannot collide by choosing identical keys.
2. **Expired Key Reuse within Transaction**:
   - When an idempotency key's TTL expires (`expiresAt < NOW()`), clients are allowed to reuse that key.
   - Deletion of the expired record and insertion of the fresh record (with a new 24h TTL) are executed **inside the same database transaction** alongside the atomic stock decrement.
   - Scoped deletion (`deleteMany({ where: { userId, key, expiresAt: { lt: new Date() } } })`) guarantees that only the authenticated user's expired record is removed; unexpired or active records belonging to other users or sessions are untouched.
   - The PostgreSQL `@@unique([userId, key])` constraint guarantees that concurrent requests using the same expired key cannot both succeed: one will insert while the other fails with a unique constraint violation or lock conflict.
3. **Payload Protection**: For unexpired keys, the request parameters (`snackId`, `amount`) are hashed and validated upon replay. Reusing an existing active key with different parameters immediately returns `409 IDEMPOTENCY_KEY_MISMATCH`.
4. **No Orphan Keys on Failure**: Because key deletion and insertion occur inside the database transaction, any failure (e.g. insufficient stock or validation error) rolls back the entire transaction, leaving no dangling incomplete keys.
5. **TTL Policy**: Records have a 24-hour expiration policy (`expiresAt = NOW() + 24h`) indexed via `@@index([expiresAt])`.

---

## 3. Summary & Snack of the Week Selection Algorithm

The dashboard summary endpoint (`GET /api/snacks/summary`) evaluates inventory totals and identifies the **Snack of the Week** using deterministic database aggregation:

### 3.1 Selection Rules
1. **Primary Metric**: Highest total vote count (`COUNT(v.id) DESC`).
2. **Deterministic Tie-Breaking**:
   - Secondary: Most recent vote cast timestamp (`MAX(v.createdAt) DESC`).
   - Tertiary: Alphabetical snack name (`name ASC`).
3. **Zero Votes Fallback**: If no votes exist in the system, `snackOfTheWeek` cleanly returns `null` without throwing errors or synthesizing fictitious data.

### 3.2 SQL Implementation
```sql
SELECT 
  s.id,
  s.name,
  s.category,
  s.quantity,
  s."lowStockThreshold",
  COUNT(v.id)::int AS "voteCount",
  MAX(v."createdAt") AS "lastVotedAt"
FROM "Snack" s
JOIN "Vote" v ON s.id = v."snackId"
GROUP BY s.id
HAVING COUNT(v.id) > 0
ORDER BY "voteCount" DESC, "lastVotedAt" DESC, s.name ASC
LIMIT 1;
```
