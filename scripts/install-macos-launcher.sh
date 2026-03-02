#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Applications"
APP_PATH="$APP_DIR/Session Deck.app"
START_SCRIPT="$ROOT_DIR/Session Deck.command"

if [[ ! -f "$START_SCRIPT" ]]; then
  echo "Missing script: $START_SCRIPT"
  exit 1
fi

if ! command -v osacompile >/dev/null 2>&1; then
  echo "osacompile not found. This installer only supports macOS."
  exit 1
fi

mkdir -p "$APP_DIR"

osacompile -o "$APP_PATH" <<APPLESCRIPT
on run
  do shell script quoted form of "/bin/bash" & space & quoted form of "$START_SCRIPT"
end run
APPLESCRIPT

echo "Installed: $APP_PATH"
echo "You can launch 'Session Deck' from Spotlight now."
