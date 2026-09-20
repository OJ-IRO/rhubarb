#!/usr/bin/env bash
# Keep Rhubarb running across logouts and reboots (macOS).
#
# Installs two per-user launchd agents: the Bee proxy and the Rhubarb daemon. Both restart if
# they die. Use this INSTEAD of scripts/start.sh, not alongside it.
#
#   ./scripts/install-launchd.sh            install and start
#   ./scripts/install-launchd.sh --dry-run  write the plists to ./launchd-preview and stop
#   ./scripts/uninstall-launchd.sh          stop and remove
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${RHUBARB_DATA_DIR:-$HOME/.rhubarb}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

# launchd does not read your shell profile, so `bee` and `node` (often under ~/.nvm) would not be
# found. Resolve them now and hand launchd a PATH that contains them.
BEE_BIN="$(command -v bee || true)"
NODE_BIN="$(command -v node || true)"
[ -n "$BEE_BIN" ] || { echo "bee is not on your PATH. Install it: npm i -g @beeai/cli" >&2; exit 1; }
[ -n "$NODE_BIN" ] || { echo "node is not on your PATH." >&2; exit 1; }
[ -f "$ROOT/packages/daemon/dist/index.js" ] || { echo "Build first: npm install && npm run build" >&2; exit 1; }
SERVICE_PATH="$(dirname "$BEE_BIN"):$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if [ "$DRY" = 1 ]; then OUT="$ROOT/launchd-preview"; else OUT="$HOME/Library/LaunchAgents"; fi
mkdir -p "$OUT"
[ "$DRY" = 1 ] || mkdir -p "$DATA/logs"

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

write_plist() { # name
  local name="$1" label="computer.rhubarb.$1"
  cat >"$OUT/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml "$ROOT/scripts/run-service.sh")</string>
    <string>$name</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml "$SERVICE_PATH")</string>
    <key>RHUBARB_DATA_DIR</key><string>$(xml "$DATA")</string>
  </dict>
  <key>WorkingDirectory</key><string>$(xml "$ROOT")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$(xml "$DATA/logs/$name.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$DATA/logs/$name.log")</string>
</dict>
</plist>
PLIST
  plutil -lint "$OUT/$label.plist" >/dev/null
  echo "wrote $OUT/$label.plist"
}

write_plist proxy
write_plist daemon

if [ "$DRY" = 1 ]; then
  echo "Dry run: nothing was installed or started."
  exit 0
fi

# Hand over from start.sh if it was in use, so two copies don't fight over the ports.
"$ROOT/scripts/stop.sh" >/dev/null 2>&1 || true

for name in proxy daemon; do
  label="computer.rhubarb.$name"
  launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$OUT/$label.plist"
done

echo "Rhubarb will now start at login and restart if it stops."
echo "dashboard: http://127.0.0.1:${RHUBARB_PORT:-4242}"
echo "logs:      $DATA/logs/"
echo "secrets:   put TAVILY_API_KEY and the like in $DATA/env (chmod 600), not in the plist"
