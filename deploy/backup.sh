#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# Runs inside the app container so the snapshot lands on the same volume.
docker compose -f deploy/docker-compose.yml exec -T app \
  node dist/cli.js backup /data/backups
