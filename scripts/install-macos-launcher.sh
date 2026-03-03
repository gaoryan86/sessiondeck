#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Applications"
APP_PATH="$APP_DIR/Session Deck.app"
HELPER_PATH="$APP_DIR/Session Deck Launcher.sh"
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

cat >"$HELPER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

candidates=(
  "$START_SCRIPT"
  "\$HOME/GitHub/gaoryan86/CC-Session-Deck/Session Deck.command"
  "\$HOME/Vibe code projects/CC-Session-Deck/Session Deck.command"
)

for script_path in "\${candidates[@]}"; do
  if [[ -x "\$script_path" ]]; then
    exec /bin/bash "\$script_path"
  fi
done

discovered=""
for root in "\$HOME/GitHub" "\$HOME/Vibe code projects"; do
  if [[ -d "\$root" ]]; then
    discovered="\$(find "\$root" -maxdepth 5 -type f -name 'Session Deck.command' 2>/dev/null | head -n 1 || true)"
    if [[ -n "\$discovered" && -x "\$discovered" ]]; then
      exec /bin/bash "\$discovered"
    fi
  fi
done

osascript -e 'display dialog "SessionDeck launcher cannot find Session Deck.command.\\n\\nPlease run scripts/install-macos-launcher.sh again from the project folder." buttons {"OK"} default button "OK" with icon caution' >/dev/null 2>&1 || true
exit 1
EOF

chmod +x "$HELPER_PATH"

osacompile -o "$APP_PATH" <<APPLESCRIPT
on run
  do shell script quoted form of "/bin/bash" & space & quoted form of "$HELPER_PATH"
end run
APPLESCRIPT

echo "Installed: $APP_PATH"
echo "Launcher helper: $HELPER_PATH"
echo "You can launch 'Session Deck' from Spotlight now."
