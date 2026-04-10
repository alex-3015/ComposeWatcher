#!/bin/sh
set -e

node /app/dist/index.js &
NODE_PID=$!

cleanup() {
  kill "$NODE_PID" 2>/dev/null
  wait "$NODE_PID" 2>/dev/null
}
trap cleanup TERM INT

nginx -g "daemon off;" &
NGINX_PID=$!

wait $NGINX_PID
