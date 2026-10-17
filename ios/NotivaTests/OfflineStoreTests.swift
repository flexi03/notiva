import Foundation
import Testing
@testable import Notiva

struct OfflineStoreTests {
    private func store() -> OfflineStore {
        OfflineStore(folder: FileManager.default.temporaryDirectory.appendingPathComponent("notiva-test-\(UUID().uuidString)"))
    }

    @Test func keepsTheLastStateAndTheQueue() {
        let s = store()
        s.save(Data("{\"ok\":true}".utf8), for: "day/2026-10-17")
        #expect(s.load("day/2026-10-17") == Data("{\"ok\":true}".utf8))
        let item = OfflineStore.Pending(id: UUID(), method: "task.set", params: Data("{}".utf8), created: Date(), label: "Abhaken")
        s.setPending([item])
        #expect(s.pending() == [item])
        s.clear()
        #expect(s.load("day/2026-10-17") == nil && s.pending().isEmpty)
    }
}
