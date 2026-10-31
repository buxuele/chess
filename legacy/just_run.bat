@echo off
setlocal
cd /d "%~dp0"

set "PYTHON=.venv\Scripts\python.exe"

where python >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Python，请先安装 Python 3.10 或更高版本并加入 PATH。
  pause
  exit /b 1
)

if not exist "%PYTHON%" (
  echo 首次运行，正在创建虚拟环境...
  python -m venv .venv
  if errorlevel 1 (
    echo 虚拟环境创建失败。
    pause
    exit /b 1
  )
)

for %%A in (requirements.txt) do set "REQ_SIZE=%%~zA"

if defined REQ_SIZE if not "%REQ_SIZE%"=="0" (
  echo 正在检查依赖...
  "%PYTHON%" -m pip install -r requirements.txt --disable-pip-version-check -q
)

echo 正在启动本地服务...
"%PYTHON%" tools\serve.py

if errorlevel 1 pause
