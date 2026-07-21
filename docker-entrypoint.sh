#!/bin/sh
set -eu

if [ ! -s /app/server/data/zhixueban.json ]; then
  npm run seed -w server
fi

exec "$@"
