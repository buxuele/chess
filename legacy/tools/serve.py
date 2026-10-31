import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT_START = 8000
PORT_TRIES = 20
ROOT = Path(__file__).resolve().parent.parent


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def create_server():
    requested = os.environ.get("CHESS_PORT", "").strip()
    if requested:
        port = int(requested)
        try:
            return ThreadingHTTPServer((HOST, port), AppHandler), port
        except OSError:
            raise RuntimeError(f"端口 {port} 已被占用")
    for port in range(PORT_START, PORT_START + PORT_TRIES):
        try:
            server = ThreadingHTTPServer((HOST, port), AppHandler)
            return server, port
        except OSError:
            continue
    raise RuntimeError(f"{PORT_START} 到 {PORT_START + PORT_TRIES - 1} 端口均被占用")


def main() -> None:
    server, port = create_server()
    url = f"http://{HOST}:{port}/"
    print(f"国际象棋已启动：{url}", flush=True)
    print("关闭此窗口或按 Ctrl-C 即可停止服务", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
