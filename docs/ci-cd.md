# GitHub Actions CI/CD & GitHub Container Registry (GHCR) Guide — Snack Overflow (Phase 8)

## 1. Overview

Snack Overflow utilizes an automated, security-focused CI/CD pipeline implemented with **GitHub Actions** and the **GitHub Container Registry (GHCR)**.

The pipeline guarantees that every change pushed to the production branch passes type checking, unit tests, integration tests, and production compilation before building and publishing minimal Docker images.

---

## 2. Trigger Configuration

The pipeline triggers **strictly on pushes to the `main` branch**:

```yaml
on:
  push:
    branches:
      - main
```

- **No Pull Request Triggers**: PRs do not trigger this pipeline, avoiding unnecessary build minutes and unauthorized registry write attempts.
- **No Scheduled Triggers**: Cron jobs and scheduled triggers are disabled.
- **Concurrency Management**:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```
  If rapid successive commits are pushed to `main`, in-flight workflow runs for previous commits are canceled automatically, avoiding race conditions and redundant image publishing.

---

## 3. Pipeline Stages & Architecture

```text
                     Push to 'main'
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
    ┌─────────────────┐         ┌─────────────────┐
    │  Job 1:         │         │  Job 2:         │
    │  ci-backend     │         │  ci-frontend    │
    │  - npm ci       │         │  - npm ci       │
    │  - prisma gen   │         │  - tsc check    │
    │  - tsc check    │         │  - vite build   │
    │  - backend tests│         │  - config tests │
    │  - build (tsc)  │         │  - fe & ws tests│
    └────────┬────────┘         └────────┬────────┘
             │                           │
             └─────────────┬─────────────┘
                     Both Pass (needs)
                           │
                           ▼
             ┌───────────────────────────┐
             │  Job 3:                   │
             │  build-and-publish (GHCR) │
             │  - Docker Buildx          │
             │  - GITHUB_TOKEN Login     │
             │  - Build & Push Backend   │
             │  - Build & Push Frontend  │
             └───────────────────────────┘
```

---

## 4. CI Validation Details

### 4.1 Backend Validation (`ci-backend`)
- **Environment**: `ubuntu-latest`, Node.js 22.
- **Dependency Caching**: Caches `~/.npm` based on `backend/package-lock.json`.
- **Validation Steps**:
  1. `npm ci`: Deterministic, clean installation of exact dependencies.
  2. `npx prisma generate`: Generates typed Prisma Client query bindings.
  3. `npx tsc --noEmit`: Strict static analysis with zero TypeScript errors.
  4. `npm run build`: Compiles production CommonJS distribution in `dist/`.
  5. `npm test`: Executes all test suites:
     - Authentication & Password Hashing (`authTestSuite.ts`)
     - Core APIs & Concurrency (`apiTestSuite.ts`)
     - Real-Time WebSockets (`websocketTestSuite.ts`)
     - Admin Activity History (`activityTestSuite.ts`)

### 4.2 Frontend Validation (`ci-frontend`)
- **Environment**: `ubuntu-latest`, Node.js 22.
- **Dependency Caching**: Caches `~/.npm` based on `frontend/package-lock.json`.
- **Validation Steps**:
  1. Installs backend dependencies and generates Prisma Client so in-process integration test servers have access to backend models.
  2. `npm ci` in `frontend/`.
  3. `npm run build`: Compiles TypeScript and packages production Vite assets (`dist/`).
  4. `npx tsx testRuntimeConfig.ts`: Validates strict runtime `window.__APP_CONFIG__` enforcement, missing configuration failure, and rejection of empty URLs.
  5. `npm test`: Runs full end-to-end integration, WebSocket optimistic UI, and Admin Activity History tests.

### 4.3 Dedicated Test Database Architecture & Safety Enforcements

To achieve complete isolation between automated tests and live data, Snack Overflow uses a **dedicated Railway PostgreSQL database exclusively for testing**:

- **Production Database**: Dedicated Railway PostgreSQL instance holding live records and baseline seeded demo inventory. Configured exclusively in the Railway production environment.
- **Automated Test Database**: Separate Railway PostgreSQL instance connected via `backend/.env` for local testing and via GitHub Actions repository secret `DATABASE_URL` for CI runs.

#### Strict Safety Rules Enforced Across All Test Suites:
- **Zero Reliance on Pre-seeded Data**: Tests are 100% self-contained and execute successfully against an initially empty database. Any required user or snack records are created dynamically with unique timestamps during test execution.
- **Zero Schema Alterations**: The CI workflow strictly forbids and never executes `prisma migrate reset`, `prisma db push`, or automated migrations during test runs.
- **Zero Destructive SQL Operations**: No `DROP`, `TRUNCATE`, or unconstrained `DELETE` statements exist in any test file.
- **Strict Entity Isolation**:
  - Every created test user, snack, and activity is prefixed with a millisecond timestamp and unique identifier (e.g. `auth_test_${timestamp}@snackoverflow.test`, `test_admin_${timestamp}`, `FE Test Pretzel ${timestamp}`).
  - Tests only mutate or query records created by their own execution context.
  - Aggregation tests (e.g., Snack of the Week, category filters) verify schema correctness and metric integrity without assuming preexisting production vote counts are zero.
- **Deterministic `finally` Cleanup**:
  - All test records created during test execution (`createdUserIds`, `createdSnackIds`, `createdActivityIds`, `createdIdempotencyKeys`) are explicitly tracked in memory and deleted in `finally` blocks targeting exact IDs.
  - Cleanup executes even if assertions throw or tests fail.
- **Preserved Production Baseline**:
  - The production database is physically distinct and never touched by CI runs or automated test suites.
- **No Automatic Seeding**: `npm run seed` or seeding scripts are never automatically triggered in CI.

### 4.4 Test Database Operational Guarantees & Mitigations

| Risk | Potential Impact | Operational Mitigation |
|---|---|---|
| **Early Job Termination** | If a GitHub Actions job is abruptly canceled or encounters a fatal SIGKILL before the `finally` block finishes, temporary test records could remain in the test database. | All test records use distinctive names (`auth_test_*`, `test_admin_*`, `FE Test Pretzel *`). Because this database is dedicated exclusively to automated testing, production is unaffected. |
| **Concurrent CI Runs** | If multiple pushes occur simultaneously, tests could potentially run in parallel. | The workflow enforces `concurrency: group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true` to serialize runs on `main` and cancel stale in-flight jobs. Dynamic timestamps also prevent row-level collisions. |
| **Missing Secrets** | If `DATABASE_URL` or `JWT_SECRET` is omitted from repository secrets, tests could fail or produce misleading errors. | The workflow includes an early validation step (`Validate Required Database & Auth Secrets`) that halts the job immediately with clear annotations without exposing secret contents. |
| **Database Latency / WAN Blips** | CI runners in GitHub cloud datacenters connect to Railway via public networking over WAN. | Database client connections use connection retry logic (`connectWithRetry`) and generous assertion timeouts (up to 240s) to prevent transient network false-negatives. |

---

## 5. Docker Build & GHCR Publishing (`build-and-publish`)

### 5.1 Registry Authentication & Permissions
- Uses GitHub's built-in `GITHUB_TOKEN`.
- **Least-Privilege Permissions**:
  ```yaml
  permissions:
    contents: read
    packages: write
  ```
- **Zero Third-Party Credentials**: No personal access tokens (PATs) or registry passwords are required or stored.

### 5.2 Published Images & Repositories

| Component | GHCR Image Repository | Tags Published |
|---|---|---|
| **Backend** | `ghcr.io/<owner>/snack-overflow-backend` | `:<commit-sha>`, `:latest` |
| **Frontend** | `ghcr.io/<owner>/snack-overflow-frontend` | `:<commit-sha>`, `:latest` |

*Note*: Repository owners with uppercase characters (e.g. `M-Barath-Vikraman`) are automatically lowercased (`m-barath-vikraman`) to comply with the OCI/Docker container image specification.

### 5.3 Layer Caching & Buildx Optimization
Builds utilize GitHub Actions cache (`type=gha`):
- **Distinct Cache Scopes**: Uses `scope=backend` and `scope=frontend` to isolate cache keys and prevent race conditions or namespace collisions between parallel image builds.
- **Required Workflow Permissions**: Job is granted `actions: write` permission to authorize reads and writes against the GitHub Actions Cache API, avoiding HTTP 400 cache warnings.
- Unchanged layers (base Alpine images, package installation steps) are restored directly from cache, accelerating publishing times.

---

## 6. How to Configure Repository Secrets

To enable automated test execution against your Railway PostgreSQL database in GitHub Actions:

1. Navigate to your GitHub repository:
   `https://github.com/M-Barath-Vikraman/Snack_Overflow`
2. Go to **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**.
3. Under **Repository secrets**, click **New repository secret**:
   - `DATABASE_URL`: Your Railway PostgreSQL public connection URL.
   - `JWT_SECRET`: Your production or staging JWT signing secret.

---

## 7. How to Pull & Run Published Images

Once published to GHCR, images can be pulled by any authorized Docker client:

```bash
# Authenticate with GHCR (using GitHub username and a PAT with read:packages permission)
echo $GITHUB_PAT | docker login ghcr.io -u <github-username> --password-stdin

# Pull the latest backend image
docker pull ghcr.io/m-barath-vikraman/snack-overflow-backend:latest

# Pull the latest frontend image
docker pull ghcr.io/m-barath-vikraman/snack-overflow-frontend:latest

# Or pull a specific commit build
docker pull ghcr.io/m-barath-vikraman/snack-overflow-backend:<commit-sha>
docker pull ghcr.io/m-barath-vikraman/snack-overflow-frontend:<commit-sha>
```

---

## 8. Inspecting Workflow Runs

1. In your GitHub repository, open the **Actions** tab.
2. Select the **CI/CD Pipeline** workflow.
3. Click any commit run to review:
   - Backend CI step logs
   - Frontend CI step logs
   - Docker build and GHCR push details
4. Published container packages will appear in your GitHub profile/organization under the **Packages** tab.
