#!/usr/bin/env bash
# Stop Rhubarb's launchd agents and remove them. Your data in ~/.rhubarb is left alone.
set -euo pipefail

for name in daemon proxy; do
  label="computer.rhubarb.$name"
  launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 && echo "stopped $label" || true
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
echo "Removed. Start Rhubarb by hand with ./scripts/start.sh when you want it."
