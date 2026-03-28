#!/bin/sh
set -euo pipefail

apk add --no-cache postgresql-client
npm install --prefix /tmp express pg
export NODE_PATH=/tmp/node_modules

exec node /app/test/server.js
