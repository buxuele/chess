#!/bin/bash
# 一键启动网页版国际象棋：检测 Node、安装依赖、探测端口、就绪后打开页面。
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

for candidate in $(seq "$PORT" "$((PORT + 20))"); do
  if ! lsof -nP -iTCP:"${candidate}" -sTCP:LISTEN >/dev/null 2>&1; then
    if [ "$candidate" != "$PORT" ]; then
      echo "${PORT} 被占用，改用 ${candidate}。"
    fi
    PORT="$candidate"
    break
  fi
done

if [ ! -d node_modules ]; then
  echo "首次运行，安装依赖..."
  npm install --no-audit --no-fund
fi

echo "启动开发服务器 http://${HOST}:${PORT}/"
npx vite --host "$HOST" --port "$PORT" --strictPort &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if page_ok "$PORT"; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "开发服务器启动失败，进程已退出。" >&2
    exit 1
  fi
  sleep 0.5
done

if ! page_ok "$PORT"; then
  echo "服务未在 30 秒内就绪，请检查上方输出。" >&2
  exit 1
fi

open_page "$PORT"
echo "按 Ctrl-C 停止服务。"
wait "$SERVER_PID"
