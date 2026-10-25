#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
DESKTOP_DIR="$(pwd)"
PROJECT_ROOT="$(cd .. && pwd)"
BUILD_DIR="$DESKTOP_DIR/build"
APP="$BUILD_DIR/Chess.app"

RUN_AFTER=0
for arg in "$@"; do
  case "$arg" in
    --run) RUN_AFTER=1 ;;
  esac
done

if ! command -v swiftc >/dev/null 2>&1; then
  echo "未找到 swiftc，请先安装 Xcode 命令行工具：xcode-select --install"
  exit 1
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

echo "1. 编译桌面壳..."
swiftc -O -swift-version 5 -framework Cocoa -framework WebKit \
  -o "$APP/Contents/MacOS/Chess" "$DESKTOP_DIR/Sources/main.swift"

echo "2. 生成图标..."
swiftc -O -swift-version 5 -o "$BUILD_DIR/gen_icon" "$DESKTOP_DIR/Sources/gen_icon.swift"
rm -rf "$BUILD_DIR/AppIcon.iconset"
"$BUILD_DIR/gen_icon" "$BUILD_DIR/AppIcon.iconset" >/dev/null
iconutil -c icns "$BUILD_DIR/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

echo "3. 拷贝网页资源..."
WEB="$APP/Contents/Resources/web"
ditto "$PROJECT_ROOT/index.html" "$WEB/index.html"
ditto "$PROJECT_ROOT/css" "$WEB/css"
ditto "$PROJECT_ROOT/js" "$WEB/js"
ditto "$PROJECT_ROOT/assets" "$WEB/assets"

echo "4. 写入配置..."
cp "$DESKTOP_DIR/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

echo "5. 本地签名..."
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
codesign --force --sign - "$APP/Contents/MacOS/Chess" >/dev/null 2>&1 || true

echo "已构建：$APP"

if [ "$RUN_AFTER" = "1" ]; then
  open "$APP"
fi
