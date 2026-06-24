#!/usr/bin/env bash
# 翡翠城经营驾驶舱 - 停止脚本

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID_FILE="/tmp/ops-dashboard-backend.pid"
FRONTEND_PID_FILE="/tmp/ops-dashboard-frontend.pid"
QUIET=0

if [ "${1:-}" = "--quiet" ]; then
  QUIET=1
fi

say() {
  if [ "$QUIET" -ne 1 ]; then
    echo "$@"
  fi
}

stop_pid() {
  local pid="$1"
  local name="$2"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    say "停止${name}: PID=$pid"
    kill "$pid" 2>/dev/null || true
    for _ in {1..10}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
  fi
}

stop_from_pidfile() {
  local pid_file="$1"
  local name="$2"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    stop_pid "$pid" "$name"
    rm -f "$pid_file"
  fi
}

process_cwd() {
  local pid="$1"
  lsof -p "$pid" 2>/dev/null | awk '$4 == "cwd" {print $9; exit}'
}

stop_project_port() {
  local port="$1"
  local name="$2"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return
  fi

  local pid cwd
  for pid in $pids; do
    cwd="$(process_cwd "$pid")"
    case "$cwd" in
      "$PROJECT_DIR"|"$PROJECT_DIR"/*)
        stop_pid "$pid" "$name(端口$port)"
        ;;
      *)
        say "跳过端口 $port 上的非本项目进程: PID=$pid CWD=${cwd:-未知}"
        ;;
    esac
  done
}

stop_from_pidfile "$BACKEND_PID_FILE" "后端"
stop_from_pidfile "$FRONTEND_PID_FILE" "前端"

stop_project_port 8000 "后端"
stop_project_port 9100 "前端"
stop_project_port 3000 "前端旧端口"

sleep 1

say "停止完成"
