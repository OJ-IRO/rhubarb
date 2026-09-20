#!/usr/bin/env bash
# Entry point for the launchd services. Usage: run-service.sh proxy|daemon
#
# launchd starts things with a bare environment, so anything secret or personal is read here
# from ~/.rhubarb/env (never from the plist, never from git). Example:
#     TAVILY_API_KEY=tvly-...
#     AWS_PROFILE=rhubarb
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${RHUBARB_DATA_DIR:-$HOME/.rhubarb}"
mkdir -p "$DATA/logs"

if [ -f "$DATA/env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$DATA/env"
  set +a
fi

case "${1:-}" in
  proxy)
    exec bee proxy --port "${BEE_PROXY_PORT:-8787}" --idle-timeout 0
    ;;
  daemon)
    # The daemon exits if the proxy isn't answering yet. Give it a moment after login or reboot;
    # if it still isn't there, exit and let launchd try again.
    for _ in $(seq 1 30); do
      curl -s -m 2 "http://127.0.0.1:${BEE_PROXY_PORT:-8787}/v1/me" >/dev/null 2>&1 && break
      sleep 2
    done
    exec node "$ROOT/packages/daemon/dist/index.js"
    ;;
  *)
    echo "usage: $0 proxy|daemon" >&2
    exit 64
    ;;
esac
