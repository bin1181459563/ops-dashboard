#!/usr/bin/env bash
# 翡翠城经营驾驶舱 - 后台启动脚本

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
LOG_DIR="$PROJECT_DIR/logs"
BACKEND_PID_FILE="/tmp/ops-dashboard-backend.pid"
FRONTEND_PID_FILE="/tmp/ops-dashboard-frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin:$PATH"
export NODE_ENV=development

PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || true)}"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"

if [ -z "$PYTHON_BIN" ]; then
  echo "未找到 python3，请先安装 Python。"
  exit 1
fi

if [ -z "$NPM_BIN" ]; then
  echo "未找到 npm，请先安装 Node.js。"
  exit 1
fi

mkdir -p "$LOG_DIR"

echo "正在清理旧进程..."
"$PROJECT_DIR/stop.sh" --quiet || true

echo "启动后端: http://localhost:8000"
BACKEND_PID="$("$PYTHON_BIN" - "$PYTHON_BIN" "$BACKEND_DIR" "$BACKEND_LOG" <<'PY'
import os
import subprocess
import sys

python_bin, cwd, log_path = sys.argv[1:4]
log = open(log_path, "ab", buffering=0)
process = subprocess.Popen(
    [python_bin, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd=cwd,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(process.pid)
PY
)"
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

backend_ready=0
for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    backend_ready=1
    break
  fi
  sleep 0.5
done

if [ "$backend_ready" -ne 1 ]; then
  echo "后端启动失败，请查看日志: $BACKEND_LOG"
  tail -40 "$BACKEND_LOG" 2>/dev/null || true
  exit 1
fi

echo "启动前端: http://localhost:9100"
FRONTEND_PID="$("$PYTHON_BIN" - "$NPM_BIN" "$FRONTEND_DIR" "$FRONTEND_LOG" <<'PY'
import os
import subprocess
import sys

npm_bin, cwd, log_path = sys.argv[1:4]
env = os.environ.copy()
env["NODE_ENV"] = "development"
log = open(log_path, "ab", buffering=0)
process = subprocess.Popen(
    [npm_bin, "run", "dev"],
    cwd=cwd,
    env=env,
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(process.pid)
PY
)"
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

frontend_ready=0
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:9100/dashboard" >/dev/null 2>&1; then
    frontend_ready=1
    break
  fi
  sleep 0.5
done

if [ "$frontend_ready" -ne 1 ]; then
  echo "前端启动失败，请查看日志: $FRONTEND_LOG"
  tail -60 "$FRONTEND_LOG" 2>/dev/null || true
  exit 1
fi

echo "驾驶舱服务已启动"
echo "后端: http://localhost:8000"
echo "前端: http://localhost:9100/dashboard"
echo "停止: ./stop.sh"
echo "重启: ./restart.sh"
