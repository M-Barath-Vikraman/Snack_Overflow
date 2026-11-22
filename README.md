# Snack Overflow 🍿

A modern, full-stack snack management system designed for team offices and collaborative workplaces.

## Approved Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL (hosted on Railway) |
| **ORM** | Prisma |
| **Authentication** | JWT (jsonwebtoken) + bcrypt |
| **Real-time** | WebSockets (`ws`) |
| **Containerization (Future)** | Docker |
| **Container Registry (Future)** | GitHub Container Registry (GHCR) |
| **CI/CD (Future)** | GitHub Actions |
| **Deployment (Future)** | Railway |

---

## Project Structure

```text
Snack_Overflow/
├── frontend/
│   ├── public/
│   │   ├── config.js              # Runtime configuration (overridable without rebuild)
│   │   └── vite.svg
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── config/
│   │   │   └── env.ts             # Runtime environment loader
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   │   └── apiClient.ts       # Centralized Fetch API client foundation
│   │   ├── types/
│   │   │   └── index.ts           # Shared TypeScript interfaces
│   │   ├── utils/
│   │   ├── App.tsx                # Base application component with health monitor
│   │   └── main.tsx               # Entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── .env.example
│
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema (PostgreSQL)
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts        # Prisma client singleton
│   │   │   └── env.ts             # Centralized environment config & validation
│   │   ├── controllers/
│   │   │   └── healthController.ts# Health check controller
│   │   ├── middleware/
│   │   │   ├── authMiddleware.ts  # JWT authentication middleware
│   │   │   ├── errorMiddleware.ts # Centralized error handler
│   │   │   ├── loggerMiddleware.ts# HTTP request logging middleware
│   │   │   ├── roleMiddleware.ts  # Role-based access control (ADMIN/MEMBER)
│   │   │   └── validateMiddleware.ts # Zod request validation middleware
│   │   ├── routes/
│   │   │   ├── healthRoutes.ts    # Health routes
│   │   │   └── index.ts           # Central API router
│   │   ├── services/
│   │   │   └── healthService.ts   # System & database health service
│   │   ├── types/
│   │   │   ├── express.d.ts       # Express Request augmentation (user context)
│   │   │   └── index.ts           # Domain types & status derivation
│   │   ├── utils/
│   │   │   ├── apiResponse.ts     # Standardized JSON response utilities
│   │   │   ├── jwt.ts             # JWT signing and verification
│   │   │   ├── logger.ts          # Structured logger utility
│   │   │   └── password.ts        # Bcrypt hashing & comparison
│   │   ├── websocket/
│   │   │   ├── events.ts          # Event types for stock & vote updates
│   │   │   └── server.ts          # WebSocket server initialization & manager
│   │   └── app.ts                 # Express application & server entry point
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                       # Local environment file (with placeholders)
│   └── .env.example               # Example environment template
│
├── docs/
│   ├── architecture.md            # System architecture & design decisions
│   ├── database.md                # Schema, relations, constraints & migrations
│   └── environment.md             # Environment variables & Railway setup guide
│
├── .gitignore                     # Git ignore rules (secrets protected)
└── README.md
```

---

## Installation & Setup

### Prerequisites
- Node.js (v18+ or v22 LTS recommended)
- npm (v9+ or v11+)
- A Railway PostgreSQL database instance

### 1. Backend Setup

```bash
cd backend
npm install
```

Configure `backend/.env`:
Open `backend/.env` and replace the placeholder with your Railway public connection string:
```env
DATABASE_URL="postgresql://postgres:PASSWORD@ROUNDHOUSE.proxy.rlwy.net:PORT/railway"
JWT_SECRET="generate-a-strong-secret-key"
NODE_ENV="development"
PORT=3000
FRONTEND_URL="http://localhost:5173"
```

Validate Prisma schema (offline check without DB connection):
```bash
npm run prisma:validate
```

Start backend development server:
```bash
npm run dev
```
The server will run on `http://localhost:3000`. Direct health check is available at `http://localhost:3000/health`.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
The Vite development server will start on `http://localhost:5173`.

---

## Current Status (Phase 1 Completed)

### Implemented:
- [x] Full directory structure for frontend, backend, and documentation.
- [x] Frontend React + Vite + TypeScript application with runtime configuration support (`public/config.js`).
- [x] Centralized frontend API client (`apiClient.ts`).
- [x] Backend Express + TypeScript server with modular routes, controllers, services, and middlewares.
- [x] Centralized environment variable management and validation.
- [x] Centralized error handling and standardized API responses.
- [x] Structured request logging and system/database health check endpoints.
- [x] JWT utilities (sign/verify) and bcrypt password hashing/comparison.
- [x] Authentication & Role-based authorization middleware (`ADMIN` / `MEMBER`).
- [x] WebSocket server foundation and event payload definitions for stock and vote updates.
- [x] Complete Prisma schema defining `User`, `Snack`, `Vote`, `Activity`, and `IdempotencyKey` models.
- [x] Database protection strategy for negative stock and dynamic status derivation logic.
- [x] Documentation suite covering architecture, database, and environments.

### Pending (Phase 2 & beyond):
- [ ] Manual database URL insertion and migration execution.
- [ ] Snack CRUD endpoints.
- [ ] Consume and Restock business logic with negative stock prevention & Idempotency-Key handling.
- [ ] Voting endpoints.
- [ ] Real-time WebSocket broadcasting for stock and vote updates.
- [ ] Complete frontend dashboard UI and user authentication flows.
- [ ] Docker containerization, GHCR registry publishing, and Railway deployment.
