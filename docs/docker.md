# Docker & Containerization Guide — Snack Overflow (Phase 7)

## 1. Overview

Snack Overflow is fully containerized using multi-stage Docker builds and orchestrated locally with Docker Compose. The architecture is engineered to separate frontend static delivery from backend application logic, maintaining clean security boundaries, non-root execution, and runtime configuration portability.

---

## 2. Container Architecture

```text
                                [ User Browser ]
                                       │
                     ┌─────────────────┴─────────────────┐
                     │                                   │
              HTTP / WS (8080)                     API / WS (3000)
                     │                                   │
                     ▼                                   ▼
          ┌───────────────────────┐           ┌───────────────────────┐
          │  snack-overflow-      │           │  snack-overflow-      │
          │  frontend             │           │  backend              │
          │  (Nginx Alpine)       │           │  (Node.js 22 Alpine)  │
          │  Non-root: nginx      │           │  Non-root: node       │
          └──────────┬────────────┘           └──────────┬────────────┘
                     │                                   │
                     │  Docker Network: snack-network    │
                     └───────────────────────────────────┘
                                       │
                                       │ Remote TLS (WAN)
                                       ▼
                       ┌───────────────────────────────┐
                       │  PostgreSQL Database          │
                       │  (Railway Managed Service)    │
                       └───────────────────────────────┘
```

---

## 3. Multi-Stage Dockerfiles

### 3.1 Backend (`backend/Dockerfile`)
The backend image uses a 2-stage build:

1. **Stage 1: `builder` (`node:22-alpine`)**
   - Installs build tools and OpenSSL (`apk add --no-cache openssl`) required by the Prisma CLI.
   - Installs all dependencies via `npm ci` using `package-lock.json`.
   - Generates Prisma Client artifacts (`npx prisma generate`).
   - Compiles TypeScript to CommonJS via `npm run build` (`tsc`).
   - Prunes developer dependencies via `npm prune --omit=dev`.
2. **Stage 2: `runner` (`node:22-alpine`)**
   - Installs runtime OpenSSL for Prisma query execution on Alpine.
   - Copies only production `node_modules`, `/app/dist`, `package.json`, and `prisma` schema.
   - Sets `NODE_ENV=production`.
   - Switches to the built-in non-root `node` user (`USER node`).
   - Starts the application using `node dist/app.js`.
   - Final image size: **273 MB** (including Node.js runtime, OpenSSL, and Prisma engine).

### 3.2 Frontend (`frontend/Dockerfile`)
The frontend image uses a 2-stage build:

1. **Stage 1: `builder` (`node:22-alpine`)**
   - Installs frontend dependencies using `npm ci`.
   - Compiles TypeScript and bundles production static assets via `npm run build` (`vite build`).
   - Output directory: `/app/dist`.
2. **Stage 2: `runner` (`nginx:alpine`)**
   - Removes default Nginx configuration and static assets.
   - Copies compiled assets to `/usr/share/nginx/html`.
   - Installs custom `nginx.conf` listening on unprivileged port `8080` (IPv4 & IPv6).
   - Injects `docker-entrypoint.sh` into `/docker-entrypoint.d/40-generate-config.sh` for runtime configuration.
   - Configures PID and cache permissions for unprivileged execution and switches to `USER nginx`.
   - Final image size: **63.4 MB**.

---

## 4. Frontend Runtime Configuration

### Zero-Rebuild Runtime Configuration
To adhere to 12-factor application principles:
- The React application reads its API and WebSocket URLs strictly from `window.__APP_CONFIG__` loaded via `/config.js`.
- During container startup, Nginx executes `/docker-entrypoint.d/40-generate-config.sh`:
  - If `API_BASE_URL` or `WS_URL` environment variables are provided to the container, it regenerates `/usr/share/nginx/html/config.js` with those values.
  - If unset, the pre-packaged default `/config.js` is preserved.
- Nginx explicitly serves `/config.js` and `/index.html` with:
  `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
  This ensures configuration updates take effect immediately on browser reload without cache invalidation issues.

---

## 5. Health Checks & Networking

### 5.1 Health Check Endpoints
- **Backend**:
  - Endpoint: `GET http://127.0.0.1:3000/health`
  - Validates Express server responsiveness and verifies active Railway PostgreSQL database connectivity.
  - Returns `200 OK` with JSON status payload.
- **Frontend**:
  - Endpoint: `GET http://127.0.0.1:8080/health`
  - Managed directly in Nginx: returns `200 OK` ("healthy\n").
  - Configured to use IPv4 loopback (`127.0.0.1`) to avoid IPv6 `Connection refused` resolution delays.
- **Startup Dependencies**:
  - In `docker-compose.yml`, the `frontend` container declares:
    ```yaml
    depends_on:
      backend:
        condition: service_healthy
    ```
  - Frontend starts only after the backend has established a healthy database connection.

---

## 6. Docker Compose Developer Experience

### 6.1 Prerequisites
Create the root `.env` file from the provided template:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` contains your active Railway PostgreSQL connection string and `JWT_SECRET` is set.

### 6.2 Common Commands

```bash
# Build and start all services in the background
docker compose up -d --build

# View real-time aggregated logs
docker compose logs -f

# View status and health of containers
docker compose ps

# Rebuild only the frontend service
docker compose up -d --build --no-deps frontend

# Rebuild only the backend service
docker compose up -d --build --no-deps backend

# Stop all containers
docker compose down
```

---

## 7. Security Decisions

1. **Non-Root Runtime Users**: Both containers run as unprivileged users (`node` in backend, `nginx` in frontend).
2. **Zero Embedded Secrets**:
   - Dockerfiles contain no secrets, credentials, or default database passwords.
   - `.env` files are strictly excluded from Docker build contexts via `.dockerignore`.
3. **No Migration on Startup**: Containers do not execute schema migrations or seed scripts on boot.
4. **Clean Signal Handling**: Backend handles `SIGTERM` and `SIGINT` to cleanly close HTTP/WebSocket connections and disconnect the Prisma database connection pool before container exit.
