# ─── Backend deps ───────────────────────────────────────────────────────────

FROM node:22-alpine AS backend-deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# ─── Backend build ──────────────────────────────────────────────────────────

FROM node:22-alpine AS backend-build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ─── Frontend build ─────────────────────────────────────────────────────────

FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ─── Combined runtime ───────────────────────────────────────────────────────

FROM node:22-alpine AS app
RUN apk add --no-cache nginx

ENV NODE_ENV=production

# Backend
COPY --from=backend-deps  /app/node_modules  /app/node_modules
COPY --from=backend-build /app/dist          /app/dist
COPY backend/package.json                    /app/package.json

# Frontend
COPY --from=frontend-build /app/dist         /usr/share/nginx/html
COPY frontend/nginx.conf                     /etc/nginx/http.d/default.conf

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
