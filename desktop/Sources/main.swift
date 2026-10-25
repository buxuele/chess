import Cocoa
import WebKit

let appName = "国际象棋"
let schemeName = "chess"
let schemeHost = "local"
let startPage = "index.html"
let background = NSColor(srgbRed: 11.0 / 255.0, green: 13.0 / 255.0, blue: 12.0 / 255.0, alpha: 1.0)

func mimeType(for extensionName: String) -> String {
    switch extensionName.lowercased() {
    case "html", "htm": return "text/html; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    case "ico": return "image/x-icon"
    case "woff": return "font/woff"
    case "woff2": return "font/woff2"
    case "ttf": return "font/ttf"
    case "mp3": return "audio/mpeg"
    case "wav": return "audio/wav"
    case "txt", "md": return "text/plain; charset=utf-8"
    default: return "application/octet-stream"
    }
}

final class WebSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" {
            path = "/" + startPage
        }
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let fileURL = root.appendingPathComponent(relative).standardizedFileURL

        guard fileURL.path == root.path || fileURL.path.hasPrefix(root.path + "/") else {
            respond(task, url: url, status: 403, body: Data("forbidden".utf8), type: "text/plain; charset=utf-8")
            return
        }

        guard let data = try? Data(contentsOf: fileURL) else {
            respond(task, url: url, status: 404, body: Data("not found".utf8), type: "text/plain; charset=utf-8")
            return
        }

        respond(task, url: url, status: 200, body: data, type: mimeType(for: fileURL.pathExtension))
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, body: Data, type: String) {
        let header = [
            "Content-Type": type,
            "Content-Length": String(body.count),
            "Cache-Control": "no-store"
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: header) else {
            task.didFailWithError(URLError(.unknown))
            return
        }
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private let env = ProcessInfo.processInfo.environment

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let root = resolveWebRoot()
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent(startPage).path) else {
            fail("找不到网页资源目录：" + root.path)
            return
        }

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(WebSchemeHandler(root: root), forURLScheme: schemeName)
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()

        let frame = NSRect(x: 0, y: 0, width: 1100, height: 940)
        webView = WKWebView(frame: frame, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }

        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = appName
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = background
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 860, height: 700)
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("ChessMainWindow")

        let headlessCheck = env["CHESS_SNAPSHOT"] != nil || env["CHESS_SELFTEST"] == "1"
        if headlessCheck {
            window.level = .floating
        }
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        window.makeFirstResponder(webView)

        webView.load(URLRequest(url: URL(string: schemeName + "://" + schemeHost + "/" + startPage)!))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    private func resolveWebRoot() -> URL {
        if let override = env["CHESS_WEB_ROOT"], !override.isEmpty {
            return URL(fileURLWithPath: override).standardizedFileURL
        }
        if let resources = Bundle.main.resourceURL {
            return resources.appendingPathComponent("web").standardizedFileURL
        }
        return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    }

    private func fail(_ message: String) {
        FileHandle.standardError.write(Data((message + "\n").utf8))
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let snapshotPath = env["CHESS_SNAPSHOT"], !snapshotPath.isEmpty {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                self.takeSnapshot(to: snapshotPath)
            }
        }
        if env["CHESS_SELFTEST"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                self.runSelfTest()
            }
        }
    }

    private func takeSnapshot(to path: String) {
        if let setup = env["CHESS_SNAPSHOT_SETUP"], !setup.isEmpty {
            webView.evaluateJavaScript(setup) { _, _ in
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) {
                    self.capture(path)
                }
            }
            return
        }
        capture(path)
    }

    private func capture(_ path: String) {
        let native = "{\"appActive\":\(NSApp.isActive),\"windowVisible\":\(window.isVisible),\"occlusion\":\(window.occlusionState.rawValue),\"policy\":\(NSApp.activationPolicy().rawValue),\"windowLevel\":\(window.level.rawValue)}"
        try? native.write(toFile: path + ".native.json", atomically: true, encoding: .utf8)

        webView.evaluateJavaScript("(function(){if(document.getAnimations){document.getAnimations().forEach(function(a){try{a.finish();}catch(e){}});}return 'ok';})()") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                self.snapshotNow(path)
            }
        }
    }

    private func snapshotNow(_ path: String) {
        webView.evaluateJavaScript("(function(){var s=document.querySelector('.shell');var t=document.querySelector('.topbar');var b=document.querySelector('.board');var c=document.querySelector('.board-column');var out={shellOpacity:s?getComputedStyle(s).opacity:'none',topOpacity:t?getComputedStyle(t).opacity:'none',columnOpacity:c?getComputedStyle(c).opacity:'none',boardRect:b?b.getBoundingClientRect().toJSON():null,activated:document.hasFocus(),visibility:document.visibilityState,animations:document.getAnimations?document.getAnimations().length:-1};return JSON.stringify(out);})()") { value, _ in
            if let text = value as? String {
                print("截图前状态 " + text)
                try? text.write(toFile: path + ".json", atomically: true, encoding: .utf8)
            }
            let config = WKSnapshotConfiguration()
            config.afterScreenUpdates = true
            self.webView.takeSnapshot(with: config) { image, error in
                if let error = error {
                    FileHandle.standardError.write(Data(("快照失败：" + error.localizedDescription + "\n").utf8))
                    NSApp.terminate(nil)
                    return
                }
                guard let image = image,
                      let tiff = image.tiffRepresentation,
                      let bitmap = NSBitmapImageRep(data: tiff),
                      let png = bitmap.representation(using: .png, properties: [:]) else {
                    FileHandle.standardError.write(Data("快照失败：无法编码 PNG\n".utf8))
                    NSApp.terminate(nil)
                    return
                }
                try? png.write(to: URL(fileURLWithPath: path))
                print("快照已保存：" + path)
                NSApp.terminate(nil)
            }
        }
    }

    private func runSelfTest() {
        let script = """
        (function () {
          var result = { url: location.href, title: document.title };
          result.squares = document.querySelectorAll('#board .sq').length;
          result.pieces = document.querySelectorAll('#board .piece').length;
          result.boardExists = !!document.getElementById('board');
          result.topbarExists = !!document.querySelector('.topbar');
          result.settingsExists = !!document.getElementById('settingsModal');
          result.historyExists = !!document.getElementById('historyDrawer');
          result.newGameExists = !!document.getElementById('fabNew');
          result.engine = typeof ChessEngine === 'object' && typeof ChessEngine.createState === 'function';
          result.ai = typeof ChessAI === 'object' && typeof ChessAI.search === 'function';
          result.openings = typeof ChessOpenings === 'object' && typeof ChessOpenings.lookup === 'function';
          result.openingLines = result.openings ? ChessOpenings.size() : 0;
          try {
            var bookState = ChessEngine.createState();
            var bookResult = ChessAI.search(bookState, { depth: 2, timeLimit: 300 });
            result.bookMove = !!(bookResult && bookResult.book);
          } catch (e) { result.bookError = String(e && e.message || e); }
          try {
            var state = ChessEngine.createState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            result.legalMoves = ChessEngine.generateLegalMoves(state).length;
          } catch (e) { result.engineError = String(e && e.message || e); }
          try {
            var e2 = document.getElementById('cell-e2');
            result.e2Pawn = !!(e2 && e2.querySelector('.piece.w'));
            if (e2) {
              var r = e2.getBoundingClientRect();
              e2.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1
              }));
              result.selectWorks = !!document.querySelector('#cell-e4.target');
            }
          } catch (e) { result.selectError = String(e && e.message || e); }
          try {
            var s = document.getElementById('btnSettings');
            if (s) { s.click(); result.settingsOpens = !document.getElementById('settingsModal').hidden; document.getElementById('settingsDone').click(); }
          } catch (e) { result.settingsError = String(e && e.message || e); }
          result.themeColor = getComputedStyle(document.documentElement).getPropertyValue('--olive').trim();
          try {
            localStorage.setItem('__selftest', 'ok');
            result.storage = localStorage.getItem('__selftest') === 'ok';
            localStorage.removeItem('__selftest');
          } catch (e) { result.storage = false; result.storageError = String(e && e.message || e); }
          try {
            var w = new Worker('js/worker.js');
            w.onmessage = function (event) {
              window.__selftestWorker = { ok: !!(event.data && event.data.type === 'result'), payload: event.data };
            };
            w.onerror = function (event) {
              window.__selftestWorker = { ok: false, error: String(event.message || 'worker error') };
            };
            w.postMessage({ type: 'search', id: 1, purpose: 'selftest', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', options: { depth: 2, timeLimit: 300 } });
            result.workerStarted = true;
          } catch (e) {
            result.workerStarted = false;
            result.workerError = String(e && e.message || e);
          }
          return JSON.stringify(result);
        })();
        """
        webView.evaluateJavaScript(script) { value, error in
            var payload: [String: Any] = [:]
            if let text = value as? String, let data = text.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                payload = parsed
            }
            if let error = error {
                payload["scriptError"] = error.localizedDescription
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) {
                self.webView.evaluateJavaScript("JSON.stringify(window.__selftestWorker || null)") { workerValue, _ in
                    if let text = workerValue as? String, let data = text.data(using: .utf8),
                       let parsed = try? JSONSerialization.jsonObject(with: data) {
                        payload["worker"] = parsed
                    } else {
                        payload["worker"] = NSNull()
                    }
                    if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
                       let text = String(data: data, encoding: .utf8) {
                        print("SELFTEST " + text)
                    }
                    NSApp.terminate(nil)
                }
            }
        }
    }

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu()
        appItem.submenu = appMenu
        appMenu.addItem(withTitle: "关于" + appName, action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏" + appName, action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "显示全部", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出" + appName, action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let editMenu = NSMenu(title: "编辑")
        editItem.submenu = editMenu
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let viewItem = NSMenuItem()
        main.addItem(viewItem)
        let viewMenu = NSMenu(title: "显示")
        viewItem.submenu = viewMenu
        let reload = NSMenuItem(title: "重新载入", action: #selector(reloadPage), keyEquivalent: "r")
        reload.target = self
        viewMenu.addItem(reload)
        let actual = NSMenuItem(title: "实际大小", action: #selector(resetZoom), keyEquivalent: "0")
        actual.target = self
        viewMenu.addItem(actual)
        let zoomIn = NSMenuItem(title: "放大", action: #selector(zoomIn), keyEquivalent: "=")
        zoomIn.target = self
        viewMenu.addItem(zoomIn)
        let zoomOut = NSMenuItem(title: "缩小", action: #selector(zoomOut), keyEquivalent: "-")
        zoomOut.target = self
        viewMenu.addItem(zoomOut)
        viewMenu.addItem(.separator())
        let full = NSMenuItem(title: "全屏", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(full)

        let windowItem = NSMenuItem()
        main.addItem(windowItem)
        let windowMenu = NSMenu(title: "窗口")
        windowItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "前置全部窗口", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")

        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }

    @objc private func reloadPage() {
        webView.reload()
    }

    @objc private func resetZoom() {
        webView.pageZoom = 1.0
    }

    @objc private func zoomIn() {
        webView.pageZoom = min(2.0, webView.pageZoom + 0.1)
    }

    @objc private func zoomOut() {
        webView.pageZoom = max(0.6, webView.pageZoom - 0.1)
    }
}

MainActor.assumeIsolated {
    let application = NSApplication.shared
    let environment = ProcessInfo.processInfo.environment
    let testing = environment["CHESS_SNAPSHOT"] != nil || environment["CHESS_SELFTEST"] == "1"
    if !testing {
        let me = ProcessInfo.processInfo.processIdentifier
        let bundleID = Bundle.main.bundleIdentifier
        let bundleURL = Bundle.main.bundleURL.standardizedFileURL
        for app in NSWorkspace.shared.runningApplications where app.processIdentifier != me {
            let sameBundleID = bundleID != nil && app.bundleIdentifier == bundleID
            let sameURL = app.bundleURL?.standardizedFileURL == bundleURL
            if sameBundleID || sameURL {
                app.activate(options: [.activateAllWindows])
                exit(0)
            }
        }
    }
    let delegate = AppDelegate()
    application.delegate = delegate
    application.setActivationPolicy(.regular)
    application.run()
}
