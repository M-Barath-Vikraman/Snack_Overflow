# Database Documentation — Snack Overflow

## 1. Overview & Connection Architecture

Snack Overflow utilizes **PostgreSQL** hosted on **Railway**, interfaced via **Prisma ORM (v5.22.0)**.

A single shared Railway PostgreSQL instance powers both local development and future production deployments:
- **Local Development**: Connects through Railway's **Public Database URL** (`DATABASE_URL` in `backend/.env`).
- **Production Deployment (Railway)**: Connects through Railway's **Private Database URL** (`postgres.railway.internal`) for minimal network latency and private cloud networking.
- **Single Database Guarantee**: Both local development and cloud production target the same Railway PostgreSQL database (`railway`).

> ⚠️ **CRITICAL SAFETY RULE**: Never run destructive migration commands (`prisma migrate reset`, `prisma db push --force-reset`, or manual `DROP TABLE`) against the shared Railway database.

---

## 2. Migration Status

- **Initial Migration**: `20261122000000_init_schema`
- **Execution Date**: Sun Nov 22 2026 10:19:12 GMT+0530
- **Status**: ✅ **APPLIED AND VERIFIED**
- **Command Executed**: `npx prisma migrate deploy`

---

## 3. Verified Schema & Database Constraints

### 3.1 Application Tables (All Verified in `public` Schema)
1. **`User`**: Team members and administrators.
2. **`Snack`**: Inventory items.
3. **`Vote`**: Snack requests and restock votes by members.
4. **`Activity`**: Audit trail of restocks and consumptions.
5. **`IdempotencyKey`**: Deduplication cache for transactional consumption operations.
6. **`_prisma_migrations`**: Prisma migration audit log.

---

### 3.2 Database-Level PostgreSQL CHECK Constraints (Verified)
The following database-level check constraints were applied and verified via `information_schema.check_constraints`:

| Table | Constraint Name | PostgreSQL Clause | Purpose |
|---|---|---|---|
| `Snack` | `snack_quantity_non_negative` | `(quantity >= 0)` | Guarantees stock quantity can never drop below zero at the DB engine level. |
| `Snack` | `snack_threshold_non_negative` | `("lowStockThreshold" >= 0)` | Guarantees threshold value is never negative. |
| `Activity` | `activity_amount_positive` | `(amount > 0)` | Guarantees consumption or restock amounts are strictly positive ($> 0$). |

---

### 3.3 Unique Constraints (Verified via Unique Indexes)

| Table | Constraint / Index Name | Columns | Guarantee |
|---|---|---|---|
| `User` | `User_email_key` | `email` | Each email address must be unique across all users. |
| `Snack` | `Snack_name_key` | `name` | Snack names must be unique. |
| `Vote` | `Vote_userId_snackId_key` | `(userId, snackId)` | A user can only vote for a given snack once. |
| `IdempotencyKey` | `IdempotencyKey_userId_key_key` | `(userId, key)` | Keys are uniquely scoped per user, preventing cross-user key collisions. |

---

### 3.4 Foreign Keys & Referential Deletion Behavior (Verified)

| Dependent Table | Column | References | ON DELETE Rule | Architectural Reason |
|---|---|---|:---:|---|
| `Activity` | `userId` | `User(id)` | **`RESTRICT`** | Preserves historical audit records permanently even if user accounts are deactivated. |
| `Activity` | `snackId` | `Snack(id)` | **`RESTRICT`** | Preserves historical restock/consumption records permanently. |
| `Vote` | `userId` | `User(id)` | `CASCADE` | Member votes are removed if user profile is removed. |
| `Vote` | `snackId` | `Snack(id)` | `CASCADE` | Votes are cleared if a snack is removed. |
| `IdempotencyKey` | `userId` | `User(id)` | `CASCADE` | Transient idempotency records are cleaned up with user profile. |

---

### 3.5 PostgreSQL Indexes (Verified)

- **`User`**: `User_pkey` (`id`), `User_email_key` (`email`).
- **`Snack`**: `Snack_pkey` (`id`), `Snack_name_key` (`name`), `Snack_category_idx` (`category`).
- **`Vote`**: `Vote_pkey` (`id`), `Vote_userId_snackId_key` (`userId, snackId`), `Vote_snackId_idx` (`snackId`).
- **`Activity`**: `Activity_pkey` (`id`), `Activity_userId_idx` (`userId`), `Activity_snackId_idx` (`snackId`), `Activity_createdAt_idx` (`createdAt`).
- **`IdempotencyKey`**: `IdempotencyKey_pkey` (`id`), `IdempotencyKey_userId_key_key` (`userId, key`), `IdempotencyKey_expiresAt_idx` (`expiresAt`).

---

### 3.6 PostgreSQL Enums (Verified)
- **`Role`**: `ADMIN`, `MEMBER`
- **`SnackCategory`**: `SWEET`, `SAVOURY`, `DRINK`, `HEALTHY_ISH`
- **`ActivityAction`**: `RESTOCKED`, `CONSUMED`

---

### 3.7 Snack Status Architecture Rule
Per project specification, **Snack Status is derived at runtime and is NOT stored in the database**:
- If `quantity <= 0` $\rightarrow$ `'OUT_OF_STOCK'`
- If `0 < quantity <= lowStockThreshold` $\rightarrow$ `'LOW_STOCK'`
- If `quantity > lowStockThreshold` $\rightarrow$ `'IN_STOCK'`

Implemented in `src/types/index.ts` via `deriveSnackStatus(quantity, lowStockThreshold)`.

---

## 4. Commands for Future Prisma Migrations

When schema changes are required in future phases:

1. **Modify Schema**: Update `backend/prisma/schema.prisma`.
2. **Validate Syntax (Offline)**:
   ```bash
   npx prisma validate
   ```
3. **Generate Migration without Auto-Applying (to review or inject custom SQL)**:
   ```bash
   npx prisma migrate dev --name <migration_name> --create-only
   ```
4. **Deploy Migration to Railway Database**:
   ```bash
   npx prisma migrate deploy
   ```
5. **Regenerate Prisma Client**:
   ```bash
   npx prisma generate
   ```
6. **Verify Migration**:
   ```bash
   npx tsx src/scripts/quickVerify.ts
   ```

> ⚠️ Always use `prisma migrate deploy` for applying migrations to the Railway PostgreSQL database.
