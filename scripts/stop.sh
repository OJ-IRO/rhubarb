#!/usr/bin/env bash
# Stop the Rhubarb daemon and the Bee proxy started by scripts/start.sh.
set -uo pipefail
DATA="${RHUBARB_DATA_DIR:-$HOME/.rhubarb}"
for svc in daemon proxy; do
  if [ -f "$DATA/$svc.pid" ]; then
    pid="$(cat "$DATA/$svc.pid")"
    if kill "$pid" 2>/dev/null; then echo "$svc stopped (pid $pid)"; else echo "$svc not running"; fi
    rm -f "$DATA/$svc.pid"
  fi
done
# The bee CLI is a node wrapper around a native binary; killing the wrapper can leave the child behind.
pkill -f "bee stream --json" 2>/dev/null || true
pkill -f "bee proxy --port" 2>/dev/null || true
