#!/bin/sh
set -e

node /app/dist/index.js &
NODE_PID=$!

nginx -g "daemon off;" &
NGINX_PID=$!

cleanup() {
  kill "$NODE_PID" 2>/dev/null
  kill "$NGINX_PID" 2>/dev/null
}
trap 'cleanup; exit 0' TERM INT

# Monitor both processes — exit if either dies
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 1
done

cleanup
exit 1
