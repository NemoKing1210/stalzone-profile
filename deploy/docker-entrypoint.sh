#!/bin/sh
set -eu

# The schema is always migrated before the server opens the database.
node /app/dist/cli.js migrate

exec node /app/.output/server/index.mjs
