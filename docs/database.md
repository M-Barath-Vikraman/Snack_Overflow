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

---

## 5. Post-Phase 4 Database Audit & Targeted Test-Data Cleanup

A post-implementation audit and approved transactional cleanup of test-generated records was conducted on Sun Nov 22 2026.

### 5.1 Pre-Deletion Verification
- All target records identified during the read-only audit were verified via exact primary keys.
- Confirmed legitimate user accounts exist: `admin@snackoverflow.com` (`ADMIN`) and `member@snackoverflow.com` (`MEMBER`).
- Vote `5bc3c9f0-08b1-4b5c-8d2c-2e750a4c83a8` had already been removed via UI unvote prior to the cleanup transaction, leaving 2 test-linked votes.

### 5.2 Atomic Transactional Deletion
Targeted deletion was executed within a single interactive database transaction (`prisma.$transaction`) in referential integrity order:
1. **IdempotencyKey**: Exactly 1 record deleted (`dd19ef32-5946-4067-b405-9dc536842be3`).
2. **Votes**: Exactly 2 records deleted (`30d34981-0a4b-4308-a1a0-73330867851d`, `ec4f190b-b641-4159-b28e-0faa64d354a1`).
3. **Activities**: Exactly 6 records deleted (`0a142fa1-14e0-42b1-8107-a26989318fd3`, `28284fdd-97bf-49ef-a43d-2b80590eb89d`, `96e63231-39ae-4e33-979e-7b736ec67e6f`, `a8ebe20c-de01-438a-a2b6-59c64f0da8dc`, `c428fef0-7512-47bd-8793-1a0ddd1bfae0`, `f9e21830-f338-48c1-b3e1-0abc4a7a324b`).
4. **Snacks**: Exactly 7 records deleted (`18d7a3cc-610c-4e2f-a07c-cb3e0ab6f13e`, `0ad6c6bb-0b53-4606-85d9-f01689e543e2`, `78d777f1-f6b7-4b1a-b243-81fb6fcc4c4a`, `c98a1620-18e4-4cfb-bfbc-6a347e080d71`, `2eebeae7-80ce-435d-b337-88fc19393a45`, `6aad9bbc-3307-4b28-b7f9-894ae452e950`, `37c95eaf-3875-4348-9fd8-f8f10358118b`).
5. **Users**: Exactly 8 records deleted (`a358f5c6-38e9-472e-b8aa-e3835125fa32`, `25d5155e-d278-490b-b26e-089797d28712`, `e213a924-f551-4615-ba6b-60eb120bf07e`, `0bf8ff47-a847-420e-bf29-4adaa40cc509`, `b264b1ee-e2ad-461c-9bd5-1ab02a83e2ad`, `f1a90fa1-331f-4d88-88c5-0008e345574f`, `6a783c99-3442-4f68-91ef-fbe1dcc616ee`, `b4352c17-db09-4cfd-8692-d80a1c496dc9`).

### 5.3 Post-Cleanup Verification & Final Table Counts
- **`Snack`**: 0 records
- **`User`**: 2 records (only `admin@snackoverflow.com` and `member@snackoverflow.com`)
- **`Vote`**: 0 records
- **`Activity`**: 0 records
- **`IdempotencyKey`**: 0 records
- Database schema, foreign key constraints, and migrations remain 100% intact.

---

## 6. Initial Demo Inventory Seeding

An approved set of four initial pantry snacks was seeded into the Railway PostgreSQL database using the idempotent seed script (`prisma/seed.ts`).

### 6.1 Approved Demo Snacks

| Name | Category | Initial Quantity | Low Stock Alert Threshold |
|---|:---:|:---:|:---:|
| **Dark Chocolate Almonds** | `SWEET` | 24 | 5 |
| **Wasabi Peas** | `SAVOURY` | 18 | 5 |
| **Sparkling Lime Water** | `DRINK` | 12 | 6 |
| **Roasted Seaweed Crisps** | `HEALTHY_ISH` | 15 | 4 |

### 6.2 Idempotency & Safety
- **Unique Name Constraint**: Uses `upsert` matching `where: { name }`.
- **Quantity Preservation**: If a snack item already exists, `update: {}` leaves its existing quantity and properties untouched.
- **User Safety**: Preserves existing user accounts (`admin@snackoverflow.com` and `member@snackoverflow.com`).
- **Seed Command**:
  ```bash
  cd backend
  npm run seed
  ```
