# ─── Backend deps ───────────────────────────────────────────────────────────

FROM node:24-alpine AS backend-deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# ─── Backend build ──────────────────────────────────────────────────────────

FROM node:24-alpine AS backend-build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ─── Frontend build ─────────────────────────────────────────────────────────

FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ─── Combined runtime ───────────────────────────────────────────────────────

FROM node:24-alpine AS app
RUN apk upgrade --no-cache && apk add --no-cache nginx tini

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

# Non-root user setup
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Configure nginx for non-root: pid in /tmp, logs to stdout/stderr
RUN sed -i 's|/run/nginx/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf && \
    ln -sf /dev/stdout /var/log/nginx/access.log && \
    ln -sf /dev/stderr /var/log/nginx/error.log

# Ensure writable directories for non-root user
RUN mkdir -p /data /var/tmp/nginx && \
    chown -R appuser:appgroup /data && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/run && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /var/tmp/nginx && \
    chown -R appuser:appgroup /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/containers || exit 1

USER appuser

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
