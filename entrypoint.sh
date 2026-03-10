#!/bin/sh
set -e

# Start backend in background
node /app/dist/index.js &

# Start nginx in foreground (keeps container alive)
exec nginx -g "daemon off;"
