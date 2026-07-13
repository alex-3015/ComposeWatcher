FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY contracts contracts
COPY backend backend
COPY frontend frontend
RUN npm run build

FROM node:24-alpine AS app

RUN apk upgrade --no-cache && apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=8080 \
    DOCKER_DIR=/docker \
    DATA_DIR=/data

WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev \
    --workspace @composewatcher/contracts \
    --workspace @composewatcher/backend

COPY --from=build /app/contracts/dist contracts/dist
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist

RUN mkdir -p /data/icons && chown -R node:node /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/dist/index.js"]
