import Foundation
import Testing
import UIKit
@testable import Notiva

struct ShelfItemTests {
    @Test func photosBecomeSmallJPEGsWithATimeName() throws {
        let big = UIGraphicsImageRenderer(size: CGSize(width: 6000, height: 4000), format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; return f }())
            .image { ctx in UIColor.systemTeal.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 6000, height: 4000)) }
        let date = try #require(ISO8601DateFormatter().date(from: "2026-10-17T16:30:00Z"))
        let ready = try ShelfItem.photo(big).prepared(now: date)
        let data = try #require(ready.data)
        let image = try #require(UIImage(data: data))
        #expect(max(image.size.width, image.size.height) == 3000)
        #expect(ready.params.name?.hasPrefix("Foto 2026-10-17 ") == true && ready.params.name?.hasSuffix(".jpg") == true)
        #expect(ready.kind == .photo)
    }

    @Test func filesOver8MBAreRefused() {
        #expect(throws: ShelfItem.Problem.self) {
            try ShelfItem.file(name: "Video.mov", data: Data(count: 8_000_001)).prepared()
        }
        #expect((try? ShelfItem.file(name: "Blatt.pdf", data: Data(count: 10)).prepared())?.params.name == "Blatt.pdf")
    }

    @Test func textsAreTitledByTheirFirstLine() throws {
        let ready = try ShelfItem.text("  Raum 5.E.001 statt H3\nab nächster Woche  ").prepared()
        #expect(ready.title == "Raum 5.E.001 statt H3")
        #expect(ready.params.text == "Raum 5.E.001 statt H3\nab nächster Woche")
        #expect(ready.data == nil)
    }

    @Test func scansBecomeOnePDFPagePerSheet() {
        let page = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 141)).image { _ in }
        let pdf = ShelfItem.pdf([page, page])
        #expect(String(decoding: pdf.prefix(5), as: UTF8.self) == "%PDF-")
        #expect(CGPDFDocument(CGDataProvider(data: pdf as CFData)!)?.numberOfPages == 2)
    }
}

@MainActor
struct QueueAttachmentTests {
    @Test func aFileWaitsApartFromTheQueueAndGoesWhenSent() async throws {
        let store = OfflineStore(folder: FileManager.default.temporaryDirectory.appendingPathComponent("notiva-test-\(UUID().uuidString)"))
        // Not paired: nothing can be sent, the change waits.
        let model = AppModel(store: store, pairing: nil)
        let id = await model.send("shelf.add", ShelfItem.Params(name: "Tafel.jpg"), label: "Ablegen: Tafel.jpg", attachment: Data("jpeg".utf8))
        let waiting = try #require(store.pending().first)
        #expect(waiting.id == id && waiting.blob == id)
        #expect(store.blob(id) == Data("jpeg".utf8))
        // The queue itself stays small: the bytes are not in it.
        #expect(!String(decoding: waiting.params, as: UTF8.self).contains("data"))
        model.discard(waiting)
        #expect(store.blob(id) == nil && store.pending().isEmpty)
    }
}

@MainActor
struct ShareInboxTests {
    @Test func sharedItemsAreListedAndTheUnsentOnesQueued() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("notiva-test-\(UUID().uuidString)")
        let inbox = base.appendingPathComponent("Inbox")
        let store = OfflineStore(folder: base.appendingPathComponent("app"))
        let sent = ShareInbox.Entry(id: UUID(), title: "Link", kind: .text, created: Date(timeIntervalSinceNow: -60))
        var waiting = ShareInbox.Entry(id: UUID(), title: "Tafel.jpg", kind: .photo, created: Date())
        waiting.params = try JSONEncoder().encode(ShelfItem.Params(name: "Tafel.jpg"))
        waiting.label = "Ablegen: Tafel.jpg"
        try ShareInbox.put(sent, file: nil, in: inbox)
        try ShareInbox.put(waiting, file: Data("jpeg".utf8), in: inbox)

        let model = AppModel(store: store, pairing: nil)
        model.takeShared(from: inbox)
        #expect(ShelfHistory.load(store).entries.map(\.title) == ["Tafel.jpg", "Link"])
        let queued = try #require(model.pending.first)
        #expect(model.pending.count == 1 && queued.id == waiting.id && queued.label == "Ablegen: Tafel.jpg")
        #expect(store.blob(waiting.id) == Data("jpeg".utf8))
        // Taken: the inbox is empty, nothing is listed twice.
        model.takeShared(from: inbox)
        #expect(ShelfHistory.load(store).entries.count == 2 && model.pending.count == 1)
    }
}
