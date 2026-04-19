#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
RUN_DIR="$ROOT_DIR/.local-run"

show_port_status() {
  local label="$1"
  local port="$2"

  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "$label: listening on port $port"
  else
    echo "$label: not listening on port $port"
  fi
}

show_pid_file_status() {
  local label="$1"
  local pid_file="$2"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "$label PID: $pid"
      return
    fi
    echo "$label PID file is stale"
    return
  fi

  echo "$label PID: unmanaged"
}

show_port_status "MongoDB" 27017
show_pid_file_status "MongoDB" "$RUN_DIR/mongod.pid"
show_port_status "Backend" 5002
show_pid_file_status "Backend" "$RUN_DIR/backend.pid"
show_port_status "Frontend" 5173
show_pid_file_status "Frontend" "$RUN_DIR/frontend.pid"