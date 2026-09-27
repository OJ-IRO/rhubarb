#!/usr/bin/env bash
# Rhubarb on a private server (Railway or any Docker host). One container runs the Bee proxy and the daemon.
#
# Needs, as environment variables:
#   RHUBARB_ACCESS_TOKEN   the secret that opens the dashboard (make it long and random)
#   ANTHROPIC_API_KEY      or AWS credentials for Bedrock
#   TAVILY_API_KEY         optional: sourced images and citations
#   TZ                     the wearer's timezone, e.g. Asia/Tokyo, so "3am" and learning windows mean their 3am
#   RHUBARB_WHERE          optional: how the privacy page names the machine, e.g. "your private server on Railway"
#   BEE_TOKEN              optional: a Bee CLI token, to skip the one-time login below
#
# Needs a persistent disk mounted at $RHUBARB_HOME (default /data): the database and the Bee login live there.
set -euo pipefail

export HOME="${RHUBARB_HOME:-/data}"
export RHUBARB_DATA_DIR="$HOME/.rhubarb"
export PORT="${PORT:-4242}"
mkdir -p "$RHUBARB_DATA_DIR/logs"

if [ -z "${RHUBARB_ACCESS_TOKEN:-}" ] || [ "${#RHUBARB_ACCESS_TOKEN}" -lt 8 ]; then
  echo "RHUBARB_ACCESS_TOKEN must be set, at least 8 characters." >&2
  exit 64
fi

# One-time Bee login. With BEE_TOKEN it is silent; otherwise the approval link is printed to the logs
# and the wearer opens it on their phone. The credential is kept on the disk, so this runs once.
if ! bee status 2>/dev/null | grep -q "Verified as"; then
  if [ -n "${BEE_TOKEN:-}" ]; then
    printf '%s' "$BEE_TOKEN" | bee login --token-stdin
  else
    until bee status 2>/dev/null | grep -q "Verified as"; do
      echo "=== Bee is not connected. Open the link below on the phone that has the Bee app and approve it. ==="
      bee login || true
      sleep 5
    done
  fi
fi
bee status | head -3

bee proxy --port 8787 --idle-timeout 0 >"$RHUBARB_DATA_DIR/logs/proxy.log" 2>&1 &
PROXY=$!
trap 'kill $PROXY 2>/dev/null' EXIT
for _ in $(seq 1 30); do curl -s -m 2 http://127.0.0.1:8787/v1/me >/dev/null 2>&1 && break; sleep 1; done

exec node packages/daemon/dist/index.js
