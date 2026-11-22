# Database Documentation — Snack Overflow

## 1. Overview & Connection Architecture

Snack Overflow utilizes **PostgreSQL** hosted on **Railway**, interfaced via **Prisma ORM**.

A single shared Railway PostgreSQL instance powers both local development and future production deployments:
- **Local Development**: Connects through Railway's **Public Database URL** (e.g., `postgresql://postgres:...@gondola.proxy.rlwy.net:PORT/railway`).
- **Production Deployment (Railway)**: Connects through Railway's **Private Database URL** (e.g., `postgresql://postgres:...@postgres.railway.internal:5432/railway`) for minimal network latency and private cloud networking.

> ⚠️ **CRITICAL RULE**: Never run destructive migration commands (`prisma migrate reset` or manual `DROP TABLE`) against the shared Railway database.

---

## 2. Schema Architecture & Entity Definitions

### 2.1 Entity Relationship Diagram

```text
┌──────────────┐         1:N          ┌──────────────┐
│     User     ├─────────────────────►│     Vote     │
│              │                      │              │
│  - id (PK)   │◄─────────────────────┤  - id (PK)   │
│  - name      │         N:1          │  - userId(FK)│
│  - email (U) │                      │  - snackId(FK│
│  - password  │                      └──────┬───────┘
│  - role      │                             │
│              │         1:N          N:1    │
│              ├───────────────┐      ┌──────┘
│              │               │      │
│              │               ▼      ▼
│              │         ┌──────────────┐
│              │         │    Snack     │
│              │         │              │
│              │         │  - id (PK)   │
│              │         │  - name (U)  │
│              │         │  - category  │
│              │         │  - quantity  │
│              │         │  - threshold │
│              │         └──────▲───────┘
│              │                │
│              │         1:N    │ N:1 (Restrict)
│              ├───────────────┐│
│              │ (Restrict)    ▼│
│              │         ┌──────────────┐
│              │         │   Activity   │
│              │         │  (Audit Log) │
│              │         │  - id (PK)   │
│              │         │  - userId(FK)│
│              │         │  - snackId(FK│
│              │         │  - action    │
│              │         │  - amount    │
│              │         │  - createdAt │
│              │         └──────────────┘
│              │
│              │         1:N          ┌───────────────────────────┐
│              └─────────────────────►│      IdempotencyKey       │
│                                     │                           │
│                                     │  - id (PK)                │
│                                     │  - key                    │
│                                     │  - userId (FK)            │
│                                     │  - requestPath            │
│                                     │  - responseStatus         │
│                                     │  - responseBody           │
│                                     │  - createdAt              │
│                                     │  - expiresAt              │
│                                     │  - U([userId, key])       │
│                                     └───────────────────────────┘
```

---

## 3. Entity Details, Constraints & Design Decisions

### 3.1 User
Represents team members and administrators.
- `id`: UUID (Primary Key, `@default(uuid())`).
- `name`: String.
- `email`: String (`@unique` creates the primary unique index `User_email_key`).
- `password`: Hashed string (bcrypt).
- `role`: Enum (`ADMIN`, `MEMBER`), default `MEMBER`.
- `createdAt`, `updatedAt`: Timestamps.

### 3.2 Snack
Represents inventory items.
- `id`: UUID (Primary Key, `@default(uuid())`).
- `name`: String (`@unique` creates the unique index `Snack_name_key`).
- `category`: Enum (`SWEET`, `SAVOURY`, `DRINK`, `HEALTHY_ISH`), indexed via `@@index([category])`.
- `quantity`: Integer (Default 0).
- `lowStockThreshold`: Integer (Default 5).
- `createdAt`, `updatedAt`: Timestamps.

#### Snack Status Derivation
Per system specification, **Snack Status is dynamically derived and NEVER stored in the database**:
- If `quantity <= 0` $\rightarrow$ `'OUT_OF_STOCK'`
- If `0 < quantity <= lowStockThreshold` $\rightarrow$ `'LOW_STOCK'`
- If `quantity > lowStockThreshold` $\rightarrow$ `'IN_STOCK'`

Implemented in `src/types/index.ts` via `deriveSnackStatus(quantity, lowStockThreshold)`.

#### PostgreSQL CHECK Constraints on Snack
Prisma schema does not support native `@check` attributes. Database-level constraints are defined in the migration SQL:
1. **`Snack.quantity >= 0`**:
   ```sql
   ALTER TABLE "Snack" ADD CONSTRAINT snack_quantity_non_negative CHECK ("quantity" >= 0);
   ```
   Prevents race conditions and guarantees at the PostgreSQL engine level that snack inventory can never be negative.
2. **`Snack.lowStockThreshold >= 0`**:
   ```sql
   ALTER TABLE "Snack" ADD CONSTRAINT snack_threshold_non_negative CHECK ("lowStockThreshold" >= 0);
   ```
   Guarantees threshold values cannot be set to nonsensical negative numbers.

### 3.3 Vote
Tracks member votes for restocking or requesting snacks.
- `id`: UUID (Primary Key).
- `userId`: Foreign key referencing `User(id)` with `onDelete: Cascade`.
- `snackId`: Foreign key referencing `Snack(id)` with `onDelete: Cascade`.
- `createdAt`: Timestamp.
- **Constraints & Indexes**:
  - `@@unique([userId, snackId])`: Guarantees each user can vote for a given snack only once.
  - `@@index([snackId])`: Dedicated index for querying and tallying votes for a specific snack.

### 3.4 Activity
Historical audit trail of inventory restocks and member consumptions.
- `id`: UUID (Primary Key).
- `userId`: Foreign key referencing `User(id)` with **`onDelete: Restrict`**.
- `snackId`: Foreign key referencing `Snack(id)` with **`onDelete: Restrict`**.
- `action`: Enum (`RESTOCKED`, `CONSUMED`).
- `amount`: Integer.
- `createdAt`: Timestamp.
- **Foreign-Key Deletion Behavior (`Restrict`)**:
  Both `User` and `Snack` relations use `onDelete: Restrict`. Historical consumption and restock activity records must be permanently preserved for auditing, reporting, and accounting. A user or snack with linked activity cannot be deleted without preserving or archiving history.
- **PostgreSQL CHECK Constraint on Activity**:
  3. **`Activity.amount > 0`**:
     ```sql
     ALTER TABLE "Activity" ADD CONSTRAINT activity_amount_positive CHECK ("amount" > 0);
     ```
     Guarantees that consumption or restock amounts must always be strictly positive numbers.
- **Indexes**:
  - `@@index([userId])`: Quick retrieval of user activity history.
  - `@@index([snackId])`: Quick retrieval of snack audit history.
  - `@@index([createdAt])`: Chronological feed sorting.

### 3.5 IdempotencyKey
Ensures safe retries for consume and transactional requests without duplicate state mutations.
- `id`: UUID (Primary Key).
- `key`: String (Client-provided idempotency key, e.g. UUID).
- `userId`: Foreign key referencing `User(id)` with `onDelete: Cascade`.
- `requestPath`: String.
- `responseStatus`: Optional cached HTTP status.
- `responseBody`: Optional cached JSON response.
- `createdAt`: Timestamp.
- `expiresAt`: Optional timestamp for TTL expiration.
- **Composite Uniqueness Decision (`[userId, key]`)**:
  Uniqueness is scoped per user via `@@unique([userId, key])`. Scoping keys per user prevents accidental collisions between different users who may submit common client-generated identifiers (or predictable request numbers), while ensuring that retries by the same user are safely deduplicated.
- **Indexes**:
  - `@@unique([userId, key])`: Primary lookup index for verifying idempotency keys per user.
  - `@@index([expiresAt])`: Efficient index for TTL expiration and automated background key cleanup.

---

## 4. Prepared Initial Migration SQL

The migration script has been prepared in:
`backend/prisma/migrations/20261122000000_init_schema/migration.sql`

It contains all required DDL statements along with the three PostgreSQL CHECK constraints:
```sql
ALTER TABLE "Snack" ADD CONSTRAINT snack_quantity_non_negative CHECK ("quantity" >= 0);
ALTER TABLE "Snack" ADD CONSTRAINT snack_threshold_non_negative CHECK ("lowStockThreshold" >= 0);
ALTER TABLE "Activity" ADD CONSTRAINT activity_amount_positive CHECK ("amount" > 0);
```

> ⚠️ **Status**: Prepared offline. No database migrations have been executed, and no modifications have been made to the live Railway database.
