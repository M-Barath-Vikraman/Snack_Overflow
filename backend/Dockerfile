# =============================================================
# Snack Overflow — Backend Dockerfile (Multi-Stage Build)
# =============================================================

# -------------------------------------------------------------
# Stage 1: Build & Dependencies
# -------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma CLI engine compatibility on Alpine
RUN apk add --no-cache openssl

# Copy package manifests for deterministic dependency caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy Prisma schema and generate Prisma Client bindings
COPY prisma ./prisma/
RUN npx prisma generate

# Copy TypeScript configuration and application source code
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript into JavaScript (/app/dist)
RUN npm run build

# Prune devDependencies to keep only production packages
RUN npm prune --omit=dev

# -------------------------------------------------------------
# Stage 2: Minimal Production Runner
# -------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime OpenSSL required by Prisma query engine
RUN apk add --no-cache openssl

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Copy production artifacts from builder stage with non-root ownership
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Switch to standard non-root user provided by node:alpine
USER node

# Expose backend service port
EXPOSE 3000

# Container healthcheck using the direct /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

# Production startup command
CMD ["node", "dist/app.js"]
