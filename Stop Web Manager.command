#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-47831}"
pid="$(lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"

if [[ -z "${pid}" ]]; then
  echo "No process is listening on 127.0.0.1:${PORT}"
  exit 0
fi

kill "${pid}"
echo "Stopped Web Manager (PID: ${pid})"
