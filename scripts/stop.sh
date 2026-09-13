#!/usr/bin/env bash
# Stop the Waggle daemon and the Bee proxy started by scripts/start.sh.
set -uo pipefail
DATA="${WAGGLE_DATA_DIR:-$HOME/.waggle}"
for svc in daemon proxy; do
  if [ -f "$DATA/$svc.pid" ]; then
    pid="$(cat "$DATA/$svc.pid")"
    if kill "$pid" 2>/dev/null; then echo "$svc stopped (pid $pid)"; else echo "$svc not running"; fi
    rm -f "$DATA/$svc.pid"
  fi
done
pkill -f "bee stream --json" 2>/dev/null || true
