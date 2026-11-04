#!/bin/bash
# 一键启动网页版国际象棋。服务在前台运行，Ctrl+C 退出。
set -euo pipefail
cd "$(dirname "$0")"

HOST=127.0.0.1
PORT="${PORT:-8000}"

page_ok() {
  curl -fsS --max-time 2 "http://${HOST}:${1}/" 2>/dev/null | grep -q '<title>国际象棋</title>'
}

listener_pid() {
  lsof -nP -iTCP:"${1}" -sTCP:LISTEN -t 2>/dev/null | head -1
}

open_page() {
  open "http://${HOST}:${1}/"
  echo "已在浏览器打开： http://${HOST}:${1}/"
}

if page_ok "$PORT"; then
  echo "国际象棋已在运行： http://${HOST}:${PORT}/（PID $(listener_pid "$PORT" || echo 未知)）"
  open_page "$PORT"
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请安装 18 或更高版本。" >&2
  exit 1
fi

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 ${PORT} 被其他程序占用：" >&2
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >&2
  echo "请释放端口或设置 PORT 环境变量后重试。" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行，安装依赖..."
  npm install --no-audit --no-fund
fi

(
  for _ in $(seq 1 60); do
    if page_ok "$PORT"; then
      open_page "$PORT"
      exit 0
    fi
    sleep 0.5
  done
) &
OPENER_PID=$!

cleanup() {
  kill "$OPENER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "启动开发服务器 http://${HOST}:${PORT}/"
exec npx vite --host "$HOST" --port "$PORT" --strictPort
