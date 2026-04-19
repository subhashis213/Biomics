#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
RUN_DIR="$ROOT_DIR/.local-run"

stop_from_pid_file() {
  local label="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$label not started by dev:up"
    return 0
  fi

  local pid
  pid=$(cat "$pid_file")
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid"
    echo "Stopped $label (PID $pid)"
  else
    echo "$label PID file was stale"
  fi

  rm -f "$pid_file"
}

stop_from_pid_file "Frontend" "$RUN_DIR/frontend.pid"
stop_from_pid_file "Backend" "$RUN_DIR/backend.pid"
stop_from_pid_file "MongoDB" "$RUN_DIR/mongod.pid"