#!/usr/bin/env bash
# Start the Bee proxy and the Rhubarb daemon detached from the current shell.
# Logs and pids live in ~/.rhubarb. Safe to re-run: already-running services are left alone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${RHUBARB_DATA_DIR:-$HOME/.rhubarb}"
mkdir -p "$DATA/logs"

running() { [ -f "$DATA/$1.pid" ] && kill -0 "$(cat "$DATA/$1.pid")" 2>/dev/null; }

if running proxy; then
  echo "proxy already running (pid $(cat "$DATA/proxy.pid"))"
else
  nohup bee proxy --port "${BEE_PROXY_PORT:-8787}" --idle-timeout 0 >"$DATA/logs/proxy.log" 2>&1 &
  echo $! >"$DATA/proxy.pid"
  echo "proxy started (pid $!)"
fi

for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -m 2 "http://127.0.0.1:${BEE_PROXY_PORT:-8787}/v1/me" >/dev/null 2>&1 && break
  sleep 1
done

if running daemon; then
  echo "daemon already running (pid $(cat "$DATA/daemon.pid"))"
else
  nohup node "$ROOT/packages/daemon/dist/index.js" >"$DATA/logs/daemon.log" 2>&1 &
  echo $! >"$DATA/daemon.pid"
  echo "daemon started (pid $!)"
fi

echo "dashboard: http://127.0.0.1:${RHUBARB_PORT:-4242}"
echo "logs:      $DATA/logs/"
