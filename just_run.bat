@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请安装 18 或更高版本。
  exit /b 1
)
if not exist node_modules (
  echo 首次运行，安装依赖...
  call npm install --no-audit --no-fund
)
echo 启动开发服务器 http://127.0.0.1:8000/
start "" http://127.0.0.1:8000/
call npx vite --host 127.0.0.1 --port 8000
