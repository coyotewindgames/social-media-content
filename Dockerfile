# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY src/ src/
COPY index.html tsconfig.json tailwind.config.js vite.config.ts ./
COPY components.json theme.json spark.meta.json ./

RUN npm run build

# ─── Stage 2: Build backend ──────────────────────────────────────────────────
FROM node:22-alpine AS backend-build
WORKDIR /app/orchestrator-node

COPY orchestrator-node/package.json orchestrator-node/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY orchestrator-node/src/ src/
COPY orchestrator-node/tsconfig.json ./

RUN npm run build

# ─── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy frontend build output
COPY --from=frontend-build /app/dist ./frontend-dist

# Copy backend compiled JS + production dependencies
COPY --from=backend-build /app/orchestrator-node/dist ./orchestrator-node/dist
COPY --from=backend-build /app/orchestrator-node/node_modules ./orchestrator-node/node_modules
COPY orchestrator-node/package.json ./orchestrator-node/
COPY orchestrator-node/config.json ./orchestrator-node/

RUN mkdir -p /app/orchestrator-node/logs && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV FRONTEND_DIST_PATH=/app/frontend-dist
EXPOSE 3001

WORKDIR /app/orchestrator-node
CMD ["node", "dist/server.js"]
