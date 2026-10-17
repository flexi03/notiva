import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Notiva" in the share sheet of other apps: photos, files, texts and links into the shelf on
/// the Mac. Sent at once when the Mac is reachable, else left for the app (ShareInbox).
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        model.close = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
        model.cancel = { [weak self] in
            self?.extensionContext?.cancelRequest(withError: CocoaError(.userCancelled))
        }
        let host = UIHostingController(rootView: ShareView(model: model))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        Task { await model.load(providers) }
    }
}

@MainActor
@Observable
final class ShareModel {
    enum State: Equatable {
        case loading, ready, sending
        case sent
        /// left for the app
        case waiting(String)
        case failed(String)
    }

    var state: State = .loading
    var items: [ShelfItem.Ready] = []
    var problems: [String] = []
    var close: () -> Void = {}
    var cancel: () -> Void = {}
    let pairing = PairingStore.load()

    func load(_ providers: [NSItemProvider]) async {
        for provider in providers {
            do {
                if let item = try await Self.item(from: provider) { items.append(try item.prepared()) }
            } catch {
                problems.append(error.localizedDescription)
            }
        }
        state = .ready
    }

    /// Pictures as photos (made small), links and texts as text, everything else as a file.
    private static func item(from provider: NSItemProvider) async throws -> ShelfItem? {
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
           let data = try? await provider.load(Data.self), let image = UIImage(data: data) {
            return .photo(image)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
           let url = try? await provider.load(URL.self) {
            return .text(url.absoluteString)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
           let text = try? await provider.load(String.self) {
            return .text(text)
        }
        if let data = try? await provider.load(Data.self) {
            let ext = provider.registeredContentTypes.first?.preferredFilenameExtension
            var name = provider.suggestedName ?? String(localized: "Datei")
            if let ext, !name.lowercased().hasSuffix(".\(ext.lowercased())") { name += ".\(ext)" }
            return .file(name: name, data: data)
        }
        return nil
    }

    struct Params: Encodable, Sendable {
        var name: String?
        var text: String?
        var data: String?
    }

    struct Answer: Decodable, Sendable { let path: String }

    func send() async {
        guard let pairing else { return }
        state = .sending
        let client = SyncClient(pairing: pairing)
        var left = 0
        var reason = ""
        for item in items {
            let entry = ShareInbox.Entry(id: UUID(), title: item.title, kind: item.kind, created: Date())
            do {
                let params = Params(name: item.params.name, text: item.params.text, data: item.data?.base64EncodedString())
                let _: Answer = try await client.call("shelf.add", params)
                try? ShareInbox.put(entry, file: nil)
            } catch {
                // Not reachable now: the app sends it later.
                var waiting = entry
                waiting.params = try? JSONEncoder().encode(item.params)
                waiting.label = item.label
                do {
                    try ShareInbox.put(waiting, file: item.data)
                    left += 1
                    reason = error.localizedDescription
                } catch {
                    state = .failed(error.localizedDescription)
                    return
                }
            }
        }
        state = left == 0 ? .sent : .waiting(reason)
        try? await Task.sleep(for: .seconds(left == 0 ? 0.8 : 2.5))
        close()
    }
}

struct ShareView: View {
    @Bindable var model: ShareModel

    var body: some View {
        NavigationStack {
            List {
                if model.pairing == nil {
                    ContentUnavailableView("Nicht gekoppelt", systemImage: "iphone.slash",
                                           description: Text("Öffne Notiva und kopple das Gerät mit deinem Mac."))
                } else {
                    SwiftUI.Section {
                        ForEach(Array(model.items.enumerated()), id: \.offset) { _, item in
                            Label(item.title, systemImage: item.kind.symbol).lineLimit(2)
                        }
                        ForEach(model.problems, id: \.self) { problem in
                            Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
                        }
                        if model.state == .loading { ProgressView() }
                    } footer: {
                        Text("Landet am Mac in „\(model.pairing?.name ?? "Notiva")“ in der Ablage.")
                    }
                    status
                }
            }
            .navigationTitle("In die Ablage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen", role: .cancel) { model.cancel() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ablegen") { Task { await model.send() } }
                        .disabled(model.pairing == nil || model.items.isEmpty || model.state != .ready)
                }
            }
        }
    }

    @ViewBuilder private var status: some View {
        switch model.state {
        case .sending:
            Label("Wird abgelegt …", systemImage: "arrow.up.circle")
        case .sent:
            Label("Am Mac abgelegt", systemImage: "checkmark.circle.fill").foregroundStyle(Color.accentColor)
        case let .waiting(reason):
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Wartet – wird übertragen, sobald du Notiva öffnest und der Mac erreichbar ist.")
                    Text(reason).font(.footnote).foregroundStyle(.secondary)
                }
            } icon: { Image(systemName: "clock") }
        case let .failed(reason):
            Label(reason, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
        case .loading, .ready:
            EmptyView()
        }
    }
}

extension NSItemProvider {
    /// `loadTransferable` as async (on the main actor, where the providers live).
    @MainActor
    func load<T: Transferable & Sendable>(_ type: T.Type) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            _ = loadTransferable(type: type) { continuation.resume(with: $0) }
        }
    }
}
