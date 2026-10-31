#!/bin/bash
# 一键启动网页版国际象棋。桌面版已拆到 ../chess-desktop 项目。
set -euo pipefail
cd "$(dirname "$0")"

HOST=127.0.0.1
PORT="${CHESS_PORT:-8000}"

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

# 已在运行则直接打开页面
if page_ok "$PORT"; then
  echo "国际象棋已在运行： http://${HOST}:${PORT}/（PID $(listener_pid "$PORT" || echo 未知)）"
  open_page "$PORT"
  exit 0
fi

# 端口被其他程序占用时向后找空位
if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  for candidate in $(seq "$((PORT + 1))" "$((PORT + 20))"); do
    if ! lsof -nP -iTCP:"${candidate}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "${PORT} 被其他程序占用，改用 ${candidate}。"
      PORT="$candidate"
      break
    fi
  done
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "未找到 python3，请先安装 Python 3.10 或更高版本。" >&2
  exit 1
fi

echo "启动本地服务 http://${HOST}:${PORT}/"
CHESS_PORT="$PORT" python3 tools/serve.py &
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
    echo "服务启动失败，进程已退出。" >&2
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
