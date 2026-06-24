#!/usr/bin/env bash
# 翡翠城经营驾驶舱 - 重启脚本

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$PROJECT_DIR/stop.sh"
"$PROJECT_DIR/start.sh"
