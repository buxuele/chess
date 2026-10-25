import threading
import time
import urllib.request
import webbrowser
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


def open_when_ready(port: int) -> None:
    url = f"http://{HOST}:{port}/"
    for _ in range(80):
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    webbrowser.open(url)
                    return
        except Exception:
            time.sleep(0.1)
    print(f"服务已启动，请手动打开 {url}")


def create_server():
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
    print(f"国际象棋已启动：{url}")
    print("关闭此窗口即可停止服务")
    threading.Timer(0.3, open_when_ready, args=(port,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
