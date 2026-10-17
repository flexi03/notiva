import SwiftUI
import WebKit

enum PageLinkTarget {
    case page(String)
    case web(URL)
}

/// The page's HTML (from the Mac, sanitized there) without JavaScript: images of the folder come
/// through the encrypted connection (`notiva-file:`), wiki links open the page in the app, web
/// links Safari.
struct PageWebView: UIViewRepresentable {
    @Environment(AppModel.self) private var model
    let html: String
    /// the page's folder – relative images start there
    let folder: String
    let open: (PageLinkTarget) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        config.websiteDataStore = .nonPersistent()
        let files = VaultFileHandler()
        let model = model
        files.load = { path in try await model.file(path) }
        config.setURLSchemeHandler(files, forURLScheme: VaultFileHandler.scheme)
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .systemBackground
        view.navigationDelegate = context.coordinator
        view.allowsLinkPreview = false
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.open = open
        let page = Self.page(html)
        guard page != context.coordinator.loaded else { return }
        context.coordinator.loaded = page
        view.loadHTMLString(page, baseURL: VaultFileHandler.url(folder: folder))
    }

    /// Wiki links ("#/p/<path>") to a scheme the navigation delegate catches.
    static func page(_ body: String) -> String {
        let links = body.replacingOccurrences(of: "href=\"#/p/", with: "href=\"\(Coordinator.pageScheme):")
        return """
        <!doctype html><html lang="de"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>\(css)</style></head><body><main class="md">\(links)</main></body></html>
        """
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        static let pageScheme = "notiva-page"
        var open: (PageLinkTarget) -> Void = { _ in }
        var loaded = ""

        func webView(_: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            if url.scheme == Self.pageScheme {
                let raw = String(url.absoluteString.dropFirst(Self.pageScheme.count + 1))
                if let path = raw.removingPercentEncoding { open(.page(path)) }
                return .cancel
            }
            if action.navigationType == .linkActivated {
                if ["http", "https", "mailto"].contains(url.scheme ?? "") { open(.web(url)) }
                return .cancel
            }
            return .allow
        }
    }

    /// Close to the Mac's .md styles (content.css), in the system's light or dark look.
    static let css = """
    :root { color-scheme: light dark; --ink: #1f2328; --ink-2: #57606a; --line: #d8dee4; --soft: #f3f5f4; --accent: #2f5d50; }
    @media (prefers-color-scheme: dark) { :root { --ink: #e6edf3; --ink-2: #9ba7b3; --line: #30363d; --soft: #1c2128; --accent: #7fd1b5; } }
    html { -webkit-text-size-adjust: 100%; }
    body { margin: 0; padding: 12px 20px 40px; font: -apple-system-body; color: var(--ink); background: transparent; line-height: 1.55; }
    .md { max-width: 760px; margin: 0 auto; overflow-wrap: anywhere; }
    h1, h2, h3, h4 { line-height: 1.25; margin: 1.3em 0 .5em; }
    h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.1em; }
    a { color: var(--accent); text-decoration: none; }
    a.wikilink-missing { color: var(--ink-2); text-decoration: underline dotted; }
    a.tag { background: var(--soft); border-radius: 6px; padding: 0 5px; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    pre, code { font: .9em ui-monospace, Menlo, monospace; background: var(--soft); border-radius: 6px; }
    code { padding: 1px 4px; } pre { padding: 10px 12px; overflow-x: auto; } pre code { padding: 0; background: none; }
    blockquote { margin: 1em 0; padding: 2px 14px; border-left: 3px solid var(--line); color: var(--ink-2); }
    [data-callout] { border-left: 3px solid var(--accent); background: var(--soft); border-radius: 8px; padding: 8px 12px; color: var(--ink); }
    table { border-collapse: collapse; display: block; overflow-x: auto; margin: 1em 0; }
    th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
    table.props { display: table; width: 100%; font-size: .9em; margin-top: 0; }
    table.props th { width: 35%; color: var(--ink-2); font-weight: 500; }
    ul.contains-task-list, ul:has(> li > input[type=checkbox]) { list-style: none; padding-left: 1.2em; }
    input[type=checkbox] { margin-right: 6px; accent-color: var(--accent); }
    hr { border: 0; border-top: 1px solid var(--line); margin: 1.5em 0; }
    """
}

/// `notiva-file://vault/<path>`: a file of the folder, loaded from the Mac (or the offline copy).
@MainActor
final class VaultFileHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "notiva-file"
    var load: (String) async throws -> Data = { _ in throw URLError(.fileDoesNotExist) }
    private var stopped: Set<ObjectIdentifier> = []

    static func url(folder: String) -> URL? {
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = "vault"
        parts.path = "/" + (folder.isEmpty ? "" : folder + "/")
        return parts.url
    }

    func webView(_: WKWebView, start task: any WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        guard let url = task.request.url, url.host == "vault" else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        let path = String(url.path.dropFirst())
        Task {
            do {
                let data = try await load(path)
                guard !stopped.contains(id) else { return }
                task.didReceive(URLResponse(url: url, mimeType: Self.mime(path), expectedContentLength: data.count, textEncodingName: nil))
                task.didReceive(data)
                task.didFinish()
            } catch {
                guard !stopped.contains(id) else { return }
                task.didFailWithError(error)
            }
        }
    }

    func webView(_: WKWebView, stop task: any WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    private static func mime(_ path: String) -> String {
        switch (path as NSString).pathExtension.lowercased() {
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "gif": "image/gif"
        case "webp": "image/webp"
        case "svg": "image/svg+xml"
        case "heic": "image/heic"
        default: "application/octet-stream"
        }
    }
}
