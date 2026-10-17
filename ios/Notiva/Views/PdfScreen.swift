import PDFKit
import SwiftUI

/// A PDF of the folder: loaded in pieces (kept for offline), annotations from its notes page as
/// on the Mac. Select text → "Markieren"; tap a highlight to comment, recolor or delete it; a
/// note per page. Everything goes to the same "(Notizen).md" the Mac uses.
struct PdfScreen: View {
    @Environment(AppModel.self) private var model
    let pdf: PdfRef
    @State private var document: PDFDocument?
    @State private var progress: (done: Int, total: Int)?
    @State private var failed: String?
    @State private var notes: PdfNotes?
    @State private var page = 1
    @State private var selection: PdfSelection?
    @State private var jump: Int?
    @State private var editing: PdfAnnotation?
    @State private var writingNote = false
    @State private var listing = false
    @AppStorage("markerColor") private var color = "yellow"

    var body: some View {
        Group {
            if let document {
                PdfKitView(document: document, annotations: notes?.annotations ?? [], page: $page, selection: $selection, jump: $jump) { id in
                    editing = notes?.annotations.first { $0.id == id }
                }
                .ignoresSafeArea(edges: .bottom)
                .safeAreaInset(edge: .top, spacing: 0) { banner }
            } else if let failed {
                ContentUnavailableView("PDF nicht da", systemImage: "doc.questionmark", description: Text(failed))
            } else {
                VStack(spacing: 12) {
                    if let progress, progress.total > 0 {
                        ProgressView(value: Double(progress.done), total: Double(progress.total))
                            .frame(maxWidth: 260)
                        Text("\(megabytes(progress.done)) von \(megabytes(progress.total))")
                            .font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
                    } else {
                        ProgressView()
                    }
                }
            }
        }
        .navigationTitle(pdf.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar { toolbar }
        .sheet(item: $editing) { annotation in
            AnnotationSheet(pdf: pdf.path, annotation: annotation) { change in await send(change) }
        }
        .sheet(isPresented: $writingNote) {
            PageNoteSheet(page: page, text: notes?.note(page) ?? "") { text in
                await send(PdfNotesChange(pdf: pdf.path, notes: [.init(page: page, text: text, base: notes?.note(page) ?? "")]))
            }
        }
        .sheet(isPresented: $listing) {
            NotesList(notes: notes, count: document?.pageCount ?? 0) { jump = $0; listing = false }
        }
        .task { await load() }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .bottomBar) {
            Menu {
                Picker("Farbe", selection: $color) {
                    ForEach(PdfAnnotation.colors, id: \.self) { name in
                        Label(PdfAnnotation.colorName(name), systemImage: "circle.fill").tag(name)
                    }
                }
            } label: {
                Image(systemName: "circle.fill").foregroundStyle(Color(PdfAnnotation.uiColor(color)))
                    .accessibilityLabel("Farbe: \(PdfAnnotation.colorName(color))")
            }
            Button { mark() } label: { Label("Markieren", systemImage: "highlighter") }
                .disabled(selection == nil)
                .accessibilityIdentifier("mark")
            Spacer()
            Text("Seite \(page) / \(document?.pageCount ?? 0)").font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
            Spacer()
            Button { writingNote = true } label: {
                Label("Notiz zu Seite \(page)", systemImage: notes?.note(page).isEmpty == false ? "note.text" : "note.text.badge.plus")
            }
            .disabled(document == nil)
            .accessibilityIdentifier("page-note")
            Button { listing = true } label: { Label("Alle Notizen", systemImage: "list.bullet") }
                .disabled(document == nil)
        }
    }

    // MARK: Waiting and conflicts

    private var waitingItems: [OfflineStore.Pending] {
        model.pending.filter { item in
            item.method == "notes.put" && (try? JSONDecoder().decode(PdfNotesChange.self, from: item.params))?.pdf == pdf.path
        }
    }

    @ViewBuilder private var banner: some View {
        if let item = waitingItems.first(where: { $0.code == "conflict" }),
           let mine = try? JSONDecoder().decode(PdfNotesChange.self, from: item.params) {
            VStack(alignment: .leading, spacing: 8) {
                Label("Eine Seitennotiz wurde inzwischen am Mac geändert – deine Fassung ist noch nicht gespeichert.", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                HStack {
                    Button("Meine anhängen") { Task { await append(mine, replacing: item) } }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("append-note")
                    Button("Meine verwerfen", role: .destructive) { Task { model.discard(item); await loadNotes() } }
                        .buttonStyle(.bordered)
                }
            }
            .font(.footnote)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
        } else if !waitingItems.isEmpty {
            Label("Deine Markierungen warten auf den Mac und werden dann gespeichert.", systemImage: "clock")
                .font(.footnote).foregroundStyle(.secondary)
                .padding(10).frame(maxWidth: .infinity, alignment: .leading).background(.bar)
        }
    }

    /// Both stay: the Mac's text, then mine below it.
    private func append(_ mine: PdfNotesChange, replacing item: OfflineStore.Pending) async {
        model.discard(item)
        await loadNotes()
        guard let current = notes else { return }
        let merged = (mine.notes ?? []).map { n -> PdfNotesChange.Note in
            let theirs = current.note(n.page)
            return .init(page: n.page, text: theirs.isEmpty ? n.text : theirs + "\n\n" + n.text, base: theirs)
        }
        var change = mine
        change.notes = merged
        await send(change)
    }

    // MARK: Loading and changes

    private func load() async {
        async let notesLoaded: Void = loadNotes()
        do {
            let data = try await model.file(pdf.path) { done, total in progress = (done, total) }
            guard let doc = PDFDocument(data: data) else { throw CocoaError(.fileReadCorruptFile) }
            document = doc
        } catch {
            failed = error.localizedDescription
        }
        await notesLoaded
    }

    private func loadNotes() async {
        let result = await model.load("notes", PdfRequest(pdf: pdf.path), key: "notes-\(pdf.path)", as: PdfNotes.self)
        var state = result.value ?? notes ?? PdfNotes(pdf: pdf.path, annotations: [], notes: [:])
        for item in waitingItems where item.error == nil {
            if let change = try? JSONDecoder().decode(PdfNotesChange.self, from: item.params) { state = state.applying(change) }
        }
        notes = state
    }

    private func send(_ change: PdfNotesChange) async {
        notes = (notes ?? PdfNotes(pdf: pdf.path, annotations: [], notes: [:])).applying(change)
        await model.send("notes.put", change, label: String(localized: "Notizen zu \(pdf.title)"))
        if waitingItems.isEmpty { await loadNotes() }
    }

    private func mark() {
        guard let selection else { return }
        let highlight = PdfAnnotation(id: PdfAnnotation.newID(), type: .highlight, page: selection.page, color: color, rects: selection.rects, text: selection.text)
        self.selection = nil
        Task { await send(PdfNotesChange(pdf: pdf.path, add: [highlight])) }
    }

    private func megabytes(_ bytes: Int) -> String {
        Measurement(value: Double(bytes) / 1_000_000, unit: UnitInformationStorage.megabytes)
            .formatted(.measurement(width: .abbreviated, usage: .asProvided, numberFormatStyle: .number.precision(.fractionLength(1))))
    }
}

/// A highlight (its text, a comment, the color) or a note – change or delete.
private struct AnnotationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let pdf: String
    @State var annotation: PdfAnnotation
    let save: (PdfNotesChange) async -> Void
    @State private var original: PdfAnnotation?

    var body: some View {
        NavigationStack {
            Form {
                if annotation.type == .highlight, let text = annotation.text {
                    SwiftUI.Section("Markiert") { Text(text).italic() }
                }
                if annotation.type == .highlight {
                    TextField("Kommentar", text: Binding(get: { annotation.comment ?? "" }, set: { annotation.comment = $0.isEmpty ? nil : $0 }), axis: .vertical)
                        .accessibilityIdentifier("annotation-comment")
                } else if annotation.type == .note || annotation.type == .text {
                    TextField("Text", text: Binding(get: { annotation.text ?? "" }, set: { annotation.text = $0 }), axis: .vertical)
                }
                if annotation.type != .ink {
                    Picker("Farbe", selection: $annotation.color) {
                        ForEach(PdfAnnotation.colors, id: \.self) { Text(PdfAnnotation.colorName($0)).tag($0) }
                    }
                }
                SwiftUI.Section {
                    Button("Löschen", role: .destructive) {
                        let id = annotation.id
                        dismiss()
                        Task { await save(PdfNotesChange(pdf: pdf, remove: [id])) }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern") {
                        let changed = annotation
                        dismiss()
                        Task { await save(PdfNotesChange(pdf: pdf, update: [changed])) }
                    }
                    .disabled(annotation == original)
                    .accessibilityIdentifier("save-annotation")
                }
            }
            .onAppear { if original == nil { original = annotation } }
        }
        .presentationDetents([.medium, .large])
    }

    private var title: LocalizedStringKey {
        switch annotation.type {
        case .highlight: "Markierung"
        case .note: "Notiz"
        case .text: "Text"
        case .ink: "Zeichnung"
        }
    }
}

/// The note of one page ("## Seite N" in the notes page).
private struct PageNoteSheet: View {
    @Environment(\.dismiss) private var dismiss
    let page: Int
    @State var text: String
    let save: (String) async -> Void
    @State private var original = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .focused($focused)
                .padding(.horizontal)
                .accessibilityIdentifier("page-note-text")
                .navigationTitle("Notiz zu Seite \(page)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen", role: .cancel) { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Sichern") {
                            let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
                            dismiss()
                            Task { await save(value) }
                        }
                        .disabled(text == original)
                        .accessibilityIdentifier("save-page-note")
                    }
                }
                .onAppear {
                    original = text
                    focused = true
                }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Page notes and highlights, page by page – tap to go there.
private struct NotesList: View {
    let notes: PdfNotes?
    let count: Int
    let go: (Int) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(pages, id: \.self) { page in
                    SwiftUI.Section("Seite \(page)") {
                        if let note = notes?.note(page), !note.isEmpty {
                            Button { go(page) } label: { Label(note, systemImage: "note.text") }
                        }
                        ForEach((notes?.annotations ?? []).filter { $0.page == page && $0.type == .highlight }) { a in
                            Button { go(page) } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(a.text ?? "").italic().lineLimit(3)
                                    if let comment = a.comment { Text(comment).font(.footnote).foregroundStyle(.secondary) }
                                }
                                .padding(.leading, 8)
                                .overlay(alignment: .leading) {
                                    Rectangle().fill(Color(PdfAnnotation.uiColor(a.color))).frame(width: 3)
                                }
                            }
                        }
                    }
                }
            }
            .overlay {
                if pages.isEmpty {
                    ContentUnavailableView("Noch keine Notizen", systemImage: "note.text",
                                           description: Text("Text markieren oder eine Notiz zur Seite schreiben."))
                }
            }
            .navigationTitle("Notizen")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private var pages: [Int] {
        let noted = (notes?.notes ?? [:]).compactMap { Int($0.key) }
        let marked = (notes?.annotations ?? []).filter { $0.type == .highlight }.map(\.page)
        return Array(Set(noted + marked)).sorted()
    }
}
