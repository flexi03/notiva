import SwiftUI

/// The folder's pages: last changed, then folder by folder (like Files); search over all.
struct PagesView: View {
    @Environment(AppModel.self) private var model
    @State private var pages: [PageRef] = []
    @State private var loaded = false
    @State private var cached = false
    @State private var query = ""

    var body: some View {
        Group {
            if !loaded {
                ProgressView()
            } else if pages.isEmpty {
                ContentUnavailableView("Keine Seiten", systemImage: "doc.text",
                                       description: Text("Sobald der Mac erreichbar ist, erscheinen hier die Seiten deines Ordners."))
            } else if !query.isEmpty {
                List(found) { PageLink(page: $0, showFolder: true) }
                    .overlay { if found.isEmpty { ContentUnavailableView.search(text: query) } }
            } else {
                FolderList(pages: pages, folder: "", recent: Array(pages.sorted { $0.mtime > $1.mtime }.prefix(5)), cached: cached)
            }
        }
        .accessibilityIdentifier("pages")
        .searchable(text: $query, prompt: "Seiten durchsuchen")
        .navigationDestination(for: PageRef.self) { PageView(path: $0.path, title: $0.title) }
        .navigationDestination(for: FolderRoute.self) { route in
            FolderList(pages: pages, folder: route.path, recent: [], cached: cached)
                .navigationTitle(route.name)
        }
        .task { await load() }
        // Back from a page: new ones (a copy, an edit) are in the list at once.
        .onAppear { if loaded { Task { await load() } } }
        .refreshable { await model.refresh(); await load() }
    }

    /// Title first, then path; best matches (title starts with it) on top.
    private var found: [PageRef] {
        let q = query.lowercased()
        return pages
            .filter { $0.title.lowercased().contains(q) || $0.path.lowercased().contains(q) }
            .sorted {
                let a = $0.title.lowercased().hasPrefix(q), b = $1.title.lowercased().hasPrefix(q)
                return a != b ? a : $0.title.localizedStandardCompare($1.title) == .orderedAscending
            }
    }

    private func load() async {
        let result = await model.load("pages", Empty(), key: "pages", as: [PageRef].self)
        pages = result.value ?? []
        cached = result.cached && result.value != nil
        loaded = true
    }
}

struct FolderRoute: Hashable {
    let path: String
    var name: String { path.split(separator: "/").last.map(String.init) ?? path }
}

/// One folder level: its subfolders, then its pages.
private struct FolderList: View {
    let pages: [PageRef]
    let folder: String
    let recent: [PageRef]
    let cached: Bool

    var body: some View {
        List {
            if !recent.isEmpty {
                SwiftUI.Section("Zuletzt geändert") {
                    ForEach(recent) { PageLink(page: $0, showFolder: true) }
                }
            }
            if !subfolders.isEmpty {
                SwiftUI.Section("Ordner") {
                    ForEach(subfolders, id: \.self) { path in
                        NavigationLink(value: FolderRoute(path: path)) {
                            Label(FolderRoute(path: path).name, systemImage: "folder")
                        }
                    }
                }
            }
            if !here.isEmpty {
                SwiftUI.Section(folder.isEmpty ? "Seiten" : "Seiten in diesem Ordner") {
                    ForEach(here) { PageLink(page: $0, showFolder: false) }
                }
            }
            if cached {
                Text("Letzter Stand – der Mac ist gerade nicht erreichbar.")
                    .font(.footnote).foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
        }
    }

    private var here: [PageRef] {
        pages.filter { $0.folder == folder }.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    /// Folders directly below this one that hold pages (somewhere further down).
    private var subfolders: [String] {
        let prefix = folder.isEmpty ? "" : folder + "/"
        let names = Set(pages.compactMap { page -> String? in
            guard page.folder.hasPrefix(prefix), page.folder != folder else { return nil }
            let rest = page.folder.dropFirst(prefix.count)
            return prefix + (rest.split(separator: "/").first.map(String.init) ?? "")
        })
        return names.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }
}

private struct PageLink: View {
    let page: PageRef
    let showFolder: Bool

    var body: some View {
        NavigationLink(value: page) {
            HStack(spacing: 12) {
                if let icon = page.icon, !icon.isEmpty, icon.count <= 2 {
                    Text(icon).frame(width: 24)
                } else {
                    Image(systemName: "doc.text").foregroundStyle(Color.accentColor).frame(width: 24)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(page.title).lineLimit(1)
                    if showFolder, !page.folder.isEmpty {
                        Text(page.folder).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
        }
        .accessibilityIdentifier("page-\(page.title)")
    }
}
