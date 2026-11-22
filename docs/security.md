# Security Architecture & Policies — Snack Overflow

## 1. Overview

Snack Overflow implements a production-minded security model across authentication, authorization, data protection, and operational security. This document details the security safeguards implemented in Phase 3.

---

## 2. Authentication & Credential Management

### 2.1 Password Hashing (bcrypt)
- **Algorithm**: bcrypt with **10 salt rounds** (work factor 10, configurable via utilities).
- **Salt Generation**: Automatically generated per-password salt to prevent rainbow table attacks.
- **Zero Plaintext Storage**: Plaintext passwords are never stored in the database, printed to stdout/stderr, written to log files, or echoed back in API responses.
- **Exposure Defense**: User queries use explicit Prisma `select` projections (e.g. `select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }`) to ensure the password hash is not even pulled into application memory when returning user profiles.

### 2.2 User Registration Security
- **Email Normalization**: Incoming email addresses are stripped of surrounding whitespace and converted to lowercase (`input.email.trim().toLowerCase()`).
- **Input Boundaries**:
  - `name`: 1 – 100 characters, trimmed.
  - `email`: Valid RFC email format, max 255 characters.
  - `password`: Minimum 8 characters, maximum 100 characters.
- **Privilege Escalation Prevention**:
  - The default role assigned to any new registrant is strictly `MEMBER`.
  - Public registration explicitly rejects any caller attempt to supply elevated roles (e.g. `role: 'ADMIN'`) with `403 ROLE_ESCALATION_FORBIDDEN` / `400 VALIDATION_ERROR`.
  - The database insert hardcodes `role: 'MEMBER'`.

### 2.3 User Login & Credential Verification
- **Anti-Enumeration Protection**: Failed login attempts return an identical generic response (`401 Unauthorized`, code `INVALID_CREDENTIALS`, message `"Invalid email or password"`) whether the email does not exist in the database or the password was incorrect.
- **Constant-Time Comparison**: Password verification uses bcrypt's constant-time comparison to protect against timing attacks.

---

## 3. JWT Token Architecture

### 3.1 Token Signing & Configuration
- **Algorithm**: HMAC SHA-256 (`HS256`).
- **Secret Management**: Signed using `JWT_SECRET` loaded from environment variables. A warning is logged at server boot if `JWT_SECRET` is unset or contains placeholder text.
- **Token Expiry**: Configurable via `JWT_EXPIRES_IN` in `backend/.env` (defaults to `7d`).

### 3.2 Token Claims
Tokens encode a minimal, verified identity payload:
```json
{
  "userId": "d748f2c0-8d5f-4a0f-90e1-0c58e727581b",
  "email": "user@example.com",
  "role": "MEMBER",
  "iat": 1763800000,
  "exp": 1764404800
}
```

### 3.3 Token Verification & Middleware Defenses
- **Signature Verification**: Every incoming Bearer token is validated against `JWT_SECRET`. Tokens with forged or invalid signatures are rejected with `401 INVALID_TOKEN`.
- **Expiration Enforcement**: Expired tokens are rejected with `401 TOKEN_EXPIRED`.
- **Malformed Token Rejection**: Tokens with invalid formatting or empty Bearer strings are rejected with `401 INVALID_TOKEN` or `401 UNAUTHORIZED`.
- **Strict Claim Validation**: `verifyToken` enforces that `userId` (string), `email` (string), and `role` (`'ADMIN'` | `'MEMBER'`) are present in the decoded token before trusting the identity.
- **Untrusted Context Isolation**: The server strictly assigns `req.user` from the cryptographically verified JWT payload. Any client attempts to spoof identity or role via query parameters, headers, or request bodies are discarded.

---

## 4. Role-Based Access Control (RBAC)

### 4.1 Role Hierarchy & Permissions

| Capability | Public / Unauth | MEMBER | ADMIN |
|---|:---:|:---:|:---:|
| System Health (`/health`) | ✅ | ✅ | ✅ |
| Register Account (`POST /api/auth/register`) | ✅ | ✅ | ✅ |
| Login (`POST /api/auth/login`) | ✅ | ✅ | ✅ |
| Browse & Search Snacks (`GET /api/snacks`) | ✅ | ✅ | ✅ |
| View Snack Details (`GET /api/snacks/:id`) | ✅ | ✅ | ✅ |
| View Dashboard Summary (`GET /api/snacks/summary`) | ✅ | ✅ | ✅ |
| Consume Snack (`POST /api/snacks/:id/consume`) | ❌ (401) | ✅ | ✅ |
| Vote / Unvote (`POST`/`DELETE /api/snacks/:id/vote`)| ❌ (401) | ✅ | ✅ |
| Create Snack (`POST /api/snacks`) | ❌ (401) | ❌ (403) | ✅ |
| Edit Snack (`PATCH /api/snacks/:id`) | ❌ (401) | ❌ (403) | ✅ |
| Delete Snack (`DELETE /api/snacks/:id`) | ❌ (401) | ❌ (403) | ✅ |
| Restock Inventory (`POST /api/snacks/:id/restock`) | ❌ (401) | ❌ (403) | ✅ |

### 4.2 Non-Bypassable Database Constraints
- Foreign key deletion behavior (`ON DELETE RESTRICT`) prevents deletion of snack items and users that possess historical audit logs (`Activity`), preserving non-repudiable audit trails.
- Check constraints ensure `quantity >= 0`, `lowStockThreshold >= 0`, and `amount > 0` at the database level.
- Unique constraints prevent duplicate votes (`@@unique([userId, snackId])`) and enforce unique emails (`@unique`).

---

## 5. Error Masking & Operational Security

- **Consistent Error Envelope**: All API error responses follow a standardized format without leaking stack traces or internal database query text in production:
  ```json
  {
    "success": false,
    "message": "Human-readable sanitized message",
    "error": {
      "code": "ERROR_CODE",
      "details": null
    },
    "timestamp": "2026-11-22T06:00:00.000Z"
  }
  ```
- **Database Safety**: Raw SQL commands use parameterized queries (`$1`, `$2`, ...) to eliminate SQL injection risks.
