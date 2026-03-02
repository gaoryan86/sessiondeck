#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-47831}"
LOG_FILE="/tmp/sessiondeck.log"

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "${candidate}" ]]; then
      NODE_BIN="${candidate}"
      break
    fi
  done
fi

if [[ -z "${NODE_BIN}" && -s "${HOME}/.nvm/nvm.sh" ]]; then
  # Finder-launched scripts often miss shell PATH; source nvm as fallback.
  # shellcheck disable=SC1090
  . "${HOME}/.nvm/nvm.sh" >/dev/null 2>&1 || true
  NODE_BIN="$(command -v node || true)"
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "SessionDeck failed to start: Node.js not found."
  echo "Install Node.js and ensure one of these exists:"
  echo "- /opt/homebrew/bin/node"
  echo "- /usr/local/bin/node"
  echo "Then retry Session Deck.command."
  exit 1
fi

existing_pid="$(lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
if [[ -n "${existing_pid}" ]]; then
  kill "${existing_pid}" || true
  sleep 0.4
fi

if command -v setsid >/dev/null 2>&1; then
  setsid "${NODE_BIN}" server.mjs >"${LOG_FILE}" 2>&1 < /dev/null &
else
  nohup "${NODE_BIN}" server.mjs >"${LOG_FILE}" 2>&1 < /dev/null &
fi
new_pid="$!"

ready=0
for _ in {1..30}; do
  if curl -s "http://127.0.0.1:${PORT}/api/sessions" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.15
done

if [[ "${ready}" -ne 1 ]]; then
  echo "SessionDeck failed to start on 127.0.0.1:${PORT}"
  echo "Log:"
  tail -n 40 "${LOG_FILE}" || true
  exit 1
fi

open "http://127.0.0.1:${PORT}" >/dev/null 2>&1 || true

echo "SessionDeck started."
echo "PID: ${new_pid}"
echo "URL: http://127.0.0.1:${PORT}"
echo "Log: ${LOG_FILE}"
