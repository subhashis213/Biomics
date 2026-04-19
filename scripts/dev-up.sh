#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
RUN_DIR="$ROOT_DIR/.local-run"
MONGO_SOCKET_DIR="$ROOT_DIR/backend/.mongodb-sock"
MONGO_PID_FILE="$RUN_DIR/mongod.pid"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
MONGO_LOG_FILE="$RUN_DIR/mongod.log"
BACKEND_LOG_FILE="$RUN_DIR/backend.log"
FRONTEND_LOG_FILE="$RUN_DIR/frontend.log"
DEFAULT_MONGO_DBPATH="/opt/homebrew/var/mongodb"
FALLBACK_MONGO_DBPATH="$ROOT_DIR/backend/.mongodb-data"

mkdir -p "$RUN_DIR" "$MONGO_SOCKET_DIR"

if [[ -d "$DEFAULT_MONGO_DBPATH" ]]; then
  MONGO_DBPATH="$DEFAULT_MONGO_DBPATH"
else
  MONGO_DBPATH="$FALLBACK_MONGO_DBPATH"
  mkdir -p "$MONGO_DBPATH"
fi

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_port() {
  local port="$1"
  local label="$2"
  local attempts=30

  while (( attempts > 0 )); do
    if is_port_listening "$port"; then
      return 0
    fi
    sleep 1
    attempts=$((attempts - 1))
  done

  echo "$label failed to start on port $port. Check logs in $RUN_DIR." >&2
  return 1
}

start_background_process() {
  local label="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  nohup "$@" >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"
  echo "$label started with PID $pid"
}

if is_port_listening 27017; then
  echo "MongoDB already listening on port 27017"
else
  if ! command -v mongod >/dev/null 2>&1; then
    echo "mongod is not installed or not on PATH." >&2
    exit 1
  fi

  start_background_process \
    "MongoDB" \
    "$MONGO_PID_FILE" \
    "$MONGO_LOG_FILE" \
    mongod \
    --dbpath "$MONGO_DBPATH" \
    --bind_ip 127.0.0.1 \
    --port 27017 \
    --unixSocketPrefix "$MONGO_SOCKET_DIR"

  wait_for_port 27017 "MongoDB"
fi

if is_port_listening 5002; then
  echo "Backend already listening on port 5002"
else
  start_background_process \
    "Backend" \
    "$BACKEND_PID_FILE" \
    "$BACKEND_LOG_FILE" \
    npm run dev:backend

  wait_for_port 5002 "Backend"
fi

if is_port_listening 5173; then
  echo "Frontend already listening on port 5173"
else
  start_background_process \
    "Frontend" \
    "$FRONTEND_PID_FILE" \
    "$FRONTEND_LOG_FILE" \
    npm --prefix "$ROOT_DIR/frontend" run dev -- --host 127.0.0.1

  wait_for_port 5173 "Frontend"
fi

echo
echo "Local stack is ready:"
echo "  Frontend: http://127.0.0.1:5173"
echo "  Backend:  http://127.0.0.1:5002"
echo "  MongoDB:  mongodb://127.0.0.1:27017/biomicshub"
echo "  Logs:     $RUN_DIR"