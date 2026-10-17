import SwiftUI

/// One page as on the Mac (rendered there), its properties on top. "Bearbeiten" edits the
/// Markdown; saved at once or as soon as the Mac is reachable. Changed on the Mac in the
/// meantime: a hint instead of overwriting – keep mine as a copy, or drop it.
struct PageView: View {
    @Environment(AppModel.self) private var model
    let path: String
    let title: String
    @State private var page: PageContent?
    @State private var cached = false
    @State private var loading = true
    @State private var editing = false
    @State private var linked: PageRef?

    var body: some View {
        Group {
            if let page {
                PageWebView(html: document(page), folder: page.folder, open: open)
                    .ignoresSafeArea(edges: .bottom)
                    .safeAreaInset(edge: .top, spacing: 0) { banner }
            } else if loading {
                ProgressView()
            } else {
                ContentUnavailableView("Seite nicht da", systemImage: "doc.questionmark",
                                       description: Text("Sobald der Mac erreichbar ist, erscheint sie hier."))
            }
        }
        .navigationTitle(page?.title ?? title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Bearbeiten") { editing = true }
                    .disabled(page == nil)
                    .accessibilityIdentifier("edit-page")
            }
        }
        .fullScreenCover(isPresented: $editing) {
            if let page {
                PageEditor(title: page.title, text: waiting?.body ?? page.body) { body in await save(body, on: page) }
            }
        }
        .navigationDestination(item: $linked) { PageView(path: $0.path, title: $0.title) }
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: Waiting and conflicts

    /// My change for this page that the Mac has not taken yet.
    private var waitingItem: OfflineStore.Pending? {
        model.pending.last { item in
            item.method == "page.put" && (try? JSONDecoder().decode(PagePut.self, from: item.params))?.path == path
        }
    }

    private var waiting: PagePut? {
        waitingItem.flatMap { try? JSONDecoder().decode(PagePut.self, from: $0.params) }
    }

    @ViewBuilder private var banner: some View {
        if let item = waitingItem {
            VStack(alignment: .leading, spacing: 8) {
                if item.code == "conflict" {
                    Label("Am Mac wurde die Seite inzwischen geändert – deine Fassung ist noch nicht gespeichert.", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                    HStack {
                        Button("Als Kopie speichern") { Task { await keepAsCopy(item) } }
                            .buttonStyle(.borderedProminent)
                            .accessibilityIdentifier("keep-copy")
                        Button("Meine verwerfen", role: .destructive) { Task { model.discard(item); await load() } }
                            .buttonStyle(.bordered)
                    }
                } else if let error = item.error {
                    Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
                    HStack {
                        Button("Nochmal") { Task { await model.retry(item); await load() } }.buttonStyle(.bordered)
                        Button("Verwerfen", role: .destructive) { Task { model.discard(item); await load() } }.buttonStyle(.bordered)
                    }
                } else {
                    Label("Deine Änderung wartet auf den Mac und wird dann gespeichert.", systemImage: "clock")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.footnote)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
        } else if cached {
            Text("Letzter Stand – der Mac ist gerade nicht erreichbar.")
                .font(.footnote).foregroundStyle(.secondary)
                .padding(8).frame(maxWidth: .infinity).background(.bar)
        }
    }

    // MARK: Loading and saving

    private func load() async {
        let result = await model.load("page", PageRequest(path: path), key: "page-\(path)", as: PageContent.self)
        if let value = result.value { page = value }
        cached = result.cached && result.value != nil
        loading = false
    }

    /// Against the state I loaded (`base`): the Mac refuses it if the page changed there since.
    private func save(_ body: String, on page: PageContent) async {
        // Edited again before the Mac took the last one: only the newest goes (same base).
        let base = waiting?.base ?? page.mtime
        if let old = waitingItem, old.error == nil { model.discard(old) }
        await model.send("page.put", PagePut(path: path, body: body, base: base),
                         label: String(localized: "Seite speichern: \(page.title)"))
        if waitingItem == nil { await load() }
    }

    private func keepAsCopy(_ item: OfflineStore.Pending) async {
        guard let mine = try? JSONDecoder().decode(PagePut.self, from: item.params) else { return }
        model.discard(item)
        await model.send("page.copy", PageCopy(path: path, body: mine.body, device: UIDevice.current.localizedModel),
                         label: String(localized: "Kopie speichern: \(page?.title ?? title)"))
        await load()
    }

    private func open(_ target: PageLinkTarget) {
        switch target {
        case let .page(path):
            let name = (path as NSString).lastPathComponent
            linked = PageRef(path: path, title: (name as NSString).deletingPathExtension, mtime: 0)
        case let .web(url):
            UIApplication.shared.open(url)
        }
    }

    /// Properties on top, then the page.
    private func document(_ page: PageContent) -> String {
        let rows = page.properties.map { "<tr><th>\(escape($0.name))</th><td>\(escape($0.value))</td></tr>" }.joined()
        let table = rows.isEmpty ? "" : "<table class=\"props\">\(rows)</table>"
        return table + (page.html ?? "<pre>\(escape(page.body))</pre>")
    }

    private func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }
}

extension PageContent {
    var folder: String { path.contains("/") ? String(path[..<path.lastIndex(of: "/")!]) : "" }
}

/// The Markdown of a page, edited as text.
struct PageEditor: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    @State var text: String
    let save: (String) async -> Void
    @State private var original = ""
    @State private var confirmDiscard = false
    @FocusState private var focused: Bool

    init(title: String, text: String, save: @escaping (String) async -> Void) {
        self.title = title
        _text = State(initialValue: text)
        _original = State(initialValue: text)
        self.save = save
    }

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .font(.body.monospaced())
                .focused($focused)
                .padding(.horizontal, 8)
                .accessibilityIdentifier("page-editor")
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen", role: .cancel) {
                            if text == original { dismiss() } else { confirmDiscard = true }
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Sichern") {
                            let body = text
                            dismiss()
                            Task { await save(body) }
                        }
                        .disabled(text == original)
                        .accessibilityIdentifier("save-page")
                    }
                }
                .task { focused = true }
                .confirmationDialog("Änderungen verwerfen?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                    Button("Verwerfen", role: .destructive) { dismiss() }
                }
        }
    }
}
