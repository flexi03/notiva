import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import VisionKit

/// Quickly onto the Mac's shelf: a photo (the blackboard), a scanned sheet as PDF, pictures,
/// a file or a text. What the Mac has not taken yet is listed with what was put there lately.
struct ShelfView: View {
    @Environment(AppModel.self) private var model
    @State private var history = ShelfHistory()
    @State private var showCamera = false
    @State private var showScanner = false
    private let camera = UIImagePickerController.isSourceTypeAvailable(.camera)
    private let scanning = VNDocumentCameraViewController.isSupported
    @State private var photos: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var writing = false
    @State private var problem: String?

    var body: some View {
        List {
            SwiftUI.Section {
                VStack(spacing: 12) {
                    // Taking it now: big. Picking something that exists: a row of three.
                    if camera, scanning {
                        HStack(spacing: 12) {
                            tile("Foto", "camera", large: true) { showCamera = true }
                            tile("Scannen", "doc.viewfinder", large: true) { showScanner = true }
                        }
                    }
                    HStack(spacing: 12) {
                        if camera, !scanning { tile("Foto", "camera") { showCamera = true } }
                        PhotosPicker(selection: $photos, maxSelectionCount: 10, matching: .images) {
                            ShelfTile(title: "Fotos", symbol: "photo.on.rectangle", large: false)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("shelf-photos")
                        tile("Datei", "folder") { importing = true }
                        tile("Text", "text.alignleft") { writing = true }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            } footer: {
                Text("Landet am Mac in der Ablage. Ohne Verbindung wartet es hier, bis der Mac erreichbar ist.")
            }

            if !waiting.isEmpty {
                SwiftUI.Section("Wartet auf den Mac") {
                    ForEach(waiting) { item in
                        WaitingRow(item: item) {
                            model.discard(item)
                            history.remove(item.id, store: model.store)
                        }
                    }
                }
            }

            if !sent.isEmpty {
                SwiftUI.Section("Zuletzt abgelegt") {
                    ForEach(sent) { entry in
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.title).lineLimit(2)
                                Text(entry.date, format: .relative(presentation: .named))
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: entry.kind.symbol).foregroundStyle(Color.accentColor)
                        }
                        .accessibilityIdentifier("shelf-sent")
                    }
                }
            }
        }
        .accessibilityIdentifier("shelf")
        .refreshable { await model.refresh() }
        .task(id: model.historyVersion) { history = ShelfHistory.load(model.store) }
        .sheet(isPresented: $writing) {
            ShelfTextView { text in await put(.text(text)) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in Task { await put(.photo(image)) } }.ignoresSafeArea()
        }
        .fullScreenCover(isPresented: $showScanner) {
            DocumentScanner { pdf in Task { await put(.file(name: ShelfItem.scanName(), data: pdf)) } }.ignoresSafeArea()
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            guard case let .success(urls) = result else { return }
            Task { for url in urls { await put(file: url) } }
        }
        .onChange(of: photos) { _, items in
            guard !items.isEmpty else { return }
            photos = []
            Task {
                for item in items {
                    guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { continue }
                    await put(.photo(image))
                }
            }
        }
        .alert("Nicht abgelegt", isPresented: .init(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(problem ?? "")
        }
    }

    private func tile(_ title: LocalizedStringKey, _ symbol: String, large: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) { ShelfTile(title: title, symbol: symbol, large: large) }
            .buttonStyle(.plain)
            .accessibilityIdentifier("shelf-\(symbol)")
    }

    private var waiting: [OfflineStore.Pending] {
        model.pending.filter { $0.method == "shelf.add" }
    }

    /// Put there and taken by the Mac (not waiting any more).
    private var sent: [ShelfHistory.Entry] {
        let open = Set(waiting.map(\.id))
        return history.entries.filter { !open.contains($0.id) }
    }

    private func put(file url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            problem = String(localized: "„\(url.lastPathComponent)“ ließ sich nicht lesen.")
            return
        }
        await put(.file(name: url.lastPathComponent, data: data))
    }

    private func put(_ item: ShelfItem) async {
        do {
            let ready = try item.prepared()
            let id = await model.send("shelf.add", ready.params, label: ready.label, attachment: ready.data)
            history.add(.init(id: id, title: ready.title, kind: ready.kind, date: Date()), store: model.store)
        } catch {
            problem = error.localizedDescription
        }
    }
}

private struct ShelfTile: View {
    let title: LocalizedStringKey
    let symbol: String
    let large: Bool

    var body: some View {
        VStack(spacing: large ? 10 : 6) {
            Image(systemName: symbol).font(large ? .title : .title3)
            Text(title).font(.subheadline.weight(.medium))
        }
        .foregroundStyle(Color.accentColor)
        .frame(maxWidth: .infinity, minHeight: large ? 110 : 76)
        .background(Color.accentColor.opacity(0.1), in: .rect(cornerRadius: 16))
        .contentShape(.rect(cornerRadius: 16))
    }
}

/// A change for the shelf the Mac has not taken yet – with its error, if it refused it.
private struct WaitingRow: View {
    @Environment(AppModel.self) private var model
    let item: OfflineStore.Pending
    let discard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(item.label, systemImage: item.error == nil ? "clock" : "exclamationmark.triangle")
                .foregroundStyle(item.error == nil ? Color.primary : Color.orange)
            if let error = item.error {
                Text(error).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .swipeActions {
            Button("Verwerfen", role: .destructive, action: discard)
            if item.error != nil {
                Button("Nochmal") { Task { await model.retry(item) } }.tint(.accentColor)
            }
        }
        .accessibilityIdentifier("shelf-waiting")
    }
}

/// A text (a note, a link) for the shelf.
struct ShelfTextView: View {
    @Environment(\.dismiss) private var dismiss
    let save: (String) async -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .focused($focused)
                .padding(.horizontal)
                .accessibilityIdentifier("shelf-text")
                .navigationTitle("Text ablegen")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen", role: .cancel) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Ablegen") {
                            let value = text
                            dismiss()
                            Task { await save(value) }
                        }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("shelf-put")
                    }
                    ToolbarItem(placement: .bottomBar) {
                        PasteButton(payloadType: String.self) { strings in
                            text += strings.joined(separator: "\n")
                        }
                    }
                }
                .task { focused = true }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: System pickers

/// The camera (SwiftUI has none of its own).
struct CameraPicker: UIViewControllerRepresentable {
    let done: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: UIImagePickerController, context _: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.done(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_: UIImagePickerController) { parent.dismiss() }
    }
}

/// Scans sheets with edge detection; the pages become one PDF.
struct DocumentScanner: UIViewControllerRepresentable {
    let done: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_: VNDocumentCameraViewController, context _: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: DocumentScanner
        init(_ parent: DocumentScanner) { self.parent = parent }

        func documentCameraViewController(_: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let pages = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            if !pages.isEmpty { parent.done(ShelfItem.pdf(pages)) }
            parent.dismiss()
        }

        func documentCameraViewControllerDidCancel(_: VNDocumentCameraViewController) { parent.dismiss() }

        func documentCameraViewController(_: VNDocumentCameraViewController, didFailWithError _: Error) { parent.dismiss() }
    }
}
