# API Documentation — Snack Overflow (Phase 2)

## 1. Overview & Base URL

- **Base URL**: `/api`
- **Default Port**: `3000` (e.g. `http://localhost:3000/api`)
- **Protocol**: HTTP/1.1 (JSON format)
- **Authentication**: JWT Bearer token in the `Authorization` header (`Bearer <token>`).

---

## 2. Global Response & Error Envelope

All responses adhere to a consistent standard JSON structure.

### Success Envelope (`200 OK`, `201 CREATED`)
```json
{
  "success": true,
  "message": "Human-readable confirmation message",
  "data": { ... },
  "timestamp": "2026-11-22T05:00:00.000Z"
}
```

### Error Envelope (`400`, `401`, `403`, `404`, `409`, `500`)
```json
{
  "success": false,
  "message": "Descriptive error message",
  "error": {
    "code": "ERROR_CODE",
    "details": null
  },
  "timestamp": "2026-11-22T05:00:00.000Z"
}
```

---

## 3. Endpoints

### 3.1 `GET /api/snacks`
Lists snacks with server-side search, filtering, pagination, and sorting. Filtering and pagination are executed entirely in PostgreSQL.

- **Access**: Public / Optional Authentication (if authenticated, `hasUserVoted` is populated).
- **Query Parameters**:
  | Parameter | Type | Default | Description |
  |---|---|---|---|
  | `search` | `string` | — | Case-insensitive substring match on snack name (`ILIKE %search%`). |
  | `category` | `string` | — | Filter by `SWEET`, `SAVOURY`, `DRINK`, `HEALTHY_ISH`. |
  | `status` | `string` | — | Filter by derived status: `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`. |
  | `page` | `integer` | `1` | Page number (min 1). |
  | `limit` | `integer` | `20` | Results per page (min 1, max 100). |
  | `sortBy` | `string` | `createdAt` | Sort column: `name`, `category`, `quantity`, `createdAt`. |
  | `sortOrder` | `string` | `desc` | Sort direction: `asc`, `desc`. |

- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Snacks retrieved successfully",
  "data": {
    "snacks": [
      {
        "id": "7b09ad84-482f-48d8-9588-e9f086e3f019",
        "name": "Wasabi Peas",
        "category": "SAVOURY",
        "quantity": 13,
        "lowStockThreshold": 5,
        "status": "IN_STOCK",
        "voteCount": 4,
        "hasUserVoted": true,
        "createdAt": "2026-11-22T05:41:47.000Z",
        "updatedAt": "2026-11-22T05:42:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "timestamp": "2026-11-22T05:42:00.000Z"
}
```

---

### 3.2 `GET /api/snacks/summary`
Calculates inventory statistics and identifies the deterministic **Snack of the Week**.

- **Access**: Public / Authenticated
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Dashboard summary retrieved successfully",
  "data": {
    "totalSnacks": 12,
    "inStockCount": 8,
    "lowStockCount": 3,
    "outOfStockCount": 1,
    "snackOfTheWeek": {
      "id": "5e2ed3ac-d3b5-45b1-8012-9bf3a036a10a",
      "name": "Dark Chocolate Sea Salt",
      "category": "SWEET",
      "quantity": 18,
      "lowStockThreshold": 5,
      "status": "IN_STOCK",
      "voteCount": 9
    }
  },
  "timestamp": "2026-11-22T05:48:26.000Z"
}
```
*Note*: If no votes exist across the system, `snackOfTheWeek` returns `null`.

---

### 3.3 `GET /api/snacks/:id`
Retrieves a single snack by its UUID.

- **Access**: Public / Optional Authentication (`hasUserVoted` is included if token provided).
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Snack retrieved successfully",
  "data": {
    "id": "7b09ad84-482f-48d8-9588-e9f086e3f019",
    "name": "Wasabi Peas",
    "category": "SAVOURY",
    "quantity": 13,
    "lowStockThreshold": 5,
    "status": "IN_STOCK",
    "voteCount": 4,
    "hasUserVoted": false,
    "createdAt": "2026-11-22T05:41:47.000Z",
    "updatedAt": "2026-11-22T05:42:00.000Z"
  },
  "timestamp": "2026-11-22T05:42:00.000Z"
}
```
- **Error**: Returns `404 NOT_FOUND` if snack does not exist.

---

### 3.4 `POST /api/snacks`
Creates a new snack item.

- **Access**: **Admin-only** (`role === 'ADMIN'`).
- **Request Body**:
```json
{
  "name": "Matcha Pocky",
  "category": "SWEET",
  "quantity": 25,
  "lowStockThreshold": 5
}
```
- **Response (`201 CREATED`)**: Returns created snack with derived status.
- **Errors**:
  - `400 VALIDATION_ERROR`: Missing or invalid fields.
  - `401 UNAUTHORIZED`: Missing/invalid token.
  - `403 FORBIDDEN`: Non-admin user.
  - `409 DUPLICATE_NAME`: A snack with this name already exists.

---

### 3.5 `PATCH /api/snacks/:id`
Updates permitted fields of a snack item.

- **Access**: **Admin-only** (`role === 'ADMIN'`).
- **Request Body**: (At least one field required)
```json
{
  "name": "Matcha Pocky Family Pack",
  "lowStockThreshold": 8
}
```
- **Response (`200 OK`)**: Returns updated snack.
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 DUPLICATE_NAME`.

---

### 3.6 `DELETE /api/snacks/:id`
Deletes a snack item.

- **Access**: **Admin-only** (`role === 'ADMIN'`).
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Snack deleted successfully",
  "data": null,
  "timestamp": "2026-11-22T05:45:00.000Z"
}
```
- **Referential Integrity Guarantee**: If the snack has linked consumption or restock audit logs, the request is rejected with `409 RELATION_RESTRICTED` to preserve historical records (`ON DELETE RESTRICT`).

---

### 3.7 `POST /api/snacks/:id/consume`
Atomically decrements stock and creates an `Activity` audit record (`action: 'CONSUMED'`) in a single PostgreSQL transaction.

- **Access**: Authenticated (`ADMIN` or `MEMBER`).
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Idempotency-Key: <string>` (Optional, highly recommended for transactional safety).
- **Request Body**:
```json
{
  "amount": 1
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Snack consumed successfully",
  "data": {
    "snack": {
      "id": "7b09ad84-482f-48d8-9588-e9f086e3f019",
      "name": "Wasabi Peas",
      "category": "SAVOURY",
      "quantity": 12,
      "lowStockThreshold": 5,
      "status": "IN_STOCK",
      "voteCount": 4,
      "updatedAt": "2026-11-22T05:45:10.000Z"
    },
    "activity": {
      "id": "93a152d2-8b4e-4f18-bb58-132d7ec581a9",
      "action": "CONSUMED",
      "amount": 1,
      "createdAt": "2026-11-22T05:45:10.000Z"
    }
  },
  "timestamp": "2026-11-22T05:45:10.000Z"
}
```
- **Idempotency Replay**: If re-sent with an active, unexpired `Idempotency-Key` and identical parameters, returns the cached original response with header `X-Idempotent-Replay: true`.
- **Expired Key Reuse**: When an `Idempotency-Key` has expired (`expiresAt < NOW()`), it can safely be reused. The backend deletes the user's expired record within the database transaction and executes a fresh consumption with a new 24-hour expiration window.
- **Errors**:
  - `409 INSUFFICIENT_STOCK`: `"Someone beat you to the last packet!"` (when `quantity < amount`).
  - `409 IDEMPOTENCY_KEY_MISMATCH`: Reusing an active key with different amount or snack.
  - `409 IDEMPOTENCY_IN_PROGRESS`: Simultaneous concurrent request with identical key.

---

### 3.8 `POST /api/snacks/:id/restock`
Atomically increments stock and creates an `Activity` record (`action: 'RESTOCKED'`).

- **Access**: **Admin-only** (`role === 'ADMIN'`).
- **Request Body**:
```json
{
  "amount": 10
}
```
- **Response (`200 OK`)**: Returns updated snack details and derived status.
- **Errors**: `400 INVALID_AMOUNT`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

---

### 3.9 `POST /api/snacks/:id/vote`
Casts a vote for a snack by the authenticated user.

- **Access**: Authenticated (`ADMIN` or `MEMBER`).
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Vote recorded successfully",
  "data": {
    "snackId": "7b09ad84-482f-48d8-9588-e9f086e3f019",
    "totalVotes": 5,
    "userVoted": true
  },
  "timestamp": "2026-11-22T05:46:00.000Z"
}
```
- **Errors**:
  - `409 ALREADY_VOTED`: `"User has already voted for this snack"` (enforced via database unique constraint `Vote_userId_snackId_key`).

---

### 3.10 `DELETE /api/snacks/:id/vote`
Removes the authenticated user's vote.

- **Access**: Authenticated (`ADMIN` or `MEMBER`).
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Vote removed successfully",
  "data": {
    "snackId": "7b09ad84-482f-48d8-9588-e9f086e3f019",
    "totalVotes": 4,
    "userVoted": false
  },
  "timestamp": "2026-11-22T05:46:30.000Z"
}
```
- **Errors**:
  - `404 VOTE_NOT_FOUND`: `"User has not voted for this snack"`.
