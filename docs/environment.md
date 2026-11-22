# Environment Configuration Guide — Snack Overflow

## 1. Overview

Snack Overflow utilizes environment configuration files to separate code from environment-specific variables.
All secrets are strictly kept out of version control via `.gitignore`.

---

## 2. Environment Files

| Path | Purpose | Tracked in Git? |
|---|---|---|
| `backend/.env` | Local development variables and database credentials | ❌ NO (Ignored) |
| `backend/.env.example` | Template and reference with documentation | ✅ YES |
| `frontend/.env.example` | Vite environment fallback documentation | ✅ YES |
| `frontend/public/config.js` | Runtime frontend environment config | ✅ YES (contains no secrets) |

---

## 3. Backend Environment Variables

File: `backend/.env`

```env
# PostgreSQL connection string from Railway
# Local development: Railway Public Database URL
# Railway deployment: Railway Private Database URL
DATABASE_URL="PASTE_RAILWAY_PUBLIC_DATABASE_URL_HERE"

# Secret key for JWT signing and verification (HMAC SHA-256)
JWT_SECRET="REPLACE_WITH_A_RANDOM_SECRET"

# Node environment: 'development', 'production', or 'test'
NODE_ENV="development"

# Port on which the Express server listens
PORT=3000

# Frontend origin allowed by CORS
FRONTEND_URL="http://localhost:5173"
```

### Variable Details:
- **`DATABASE_URL`**:
  - Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require`
  - For local development: Use the **Railway Public Database URL** from your Railway PostgreSQL service dashboard (Connect $\rightarrow$ Public Networking).
  - For Railway cloud deployment: Use the **Railway Private Database URL** (`postgres.railway.internal`).
- **`JWT_SECRET`**: A cryptographically random string (e.g. 64 hex characters) used to sign authentication tokens.
- **`NODE_ENV`**: Sets logging verbosity and error display level (`development` / `production`).
- **`PORT`**: HTTP and WebSocket listen port (defaults to 3000).
- **`FRONTEND_URL`**: Origin URL passed to CORS middleware to allow requests from the React development server or production web app.

---

## 4. Frontend Environment Configuration

### Runtime Configuration (`frontend/public/config.js`)
The primary configuration mechanism for the frontend is runtime configuration.
When running the app in the browser, `public/config.js` is loaded:

```js
window.__APP_CONFIG__ = {
  API_BASE_URL: "http://localhost:3000/api",
  WS_URL: "ws://localhost:3000"
};
```

### Why Runtime Configuration?
1. **No Rebuilds**: Deploying to staging or production does not require rebuilding static JavaScript bundles.
2. **Dynamic Overrides**: In Docker/Kubernetes/Railway, an initialization script can generate `public/config.js` from runtime container environment variables.
3. **Security**: Only public API endpoints are included. Never inject database strings, passwords, or private keys into frontend configuration.

---

## 5. Railway Configuration Checkpoint

### Manual Action Required by User:
1. Open your Railway dashboard: [https://railway.app](https://railway.app)
2. Select your PostgreSQL database service.
3. Navigate to **Variables** or **Connect** $\rightarrow$ **Public Networking**.
4. Copy the **Public Database URL**.
5. Open `backend/.env` on your local machine:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/railway"
   ```
6. Paste the URL, replacing `PASTE_RAILWAY_PUBLIC_DATABASE_URL_HERE`.
7. Also replace `JWT_SECRET` with a strong secret key.
8. Save `backend/.env`.

> ⚠️ Do not run database migrations until this URL is inserted and verified.
