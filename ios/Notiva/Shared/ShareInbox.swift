import Foundation

/// Between the share extension and the app (App Group): what was shared from another app. Sent
/// at once by the extension when the Mac is reachable – else left here, and the app takes it
/// into its queue the next time it is opened. Either way it is listed under "Zuletzt abgelegt".
enum ShareInbox {
    static let group = "group.io.github.flexi03.notiva"

    struct Entry: Codable, Sendable {
        let id: UUID
        let title: String
        let kind: ShelfItem.Kind
        let created: Date
        /// still to be sent: method, params and label for the queue (nil: the Mac has it)
        var params: Data?
        var label: String?
    }

    static var folder: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("Inbox", isDirectory: true)
    }

    /// The file first, then the entry – the app only takes complete ones.
    static func put(_ entry: Entry, file: Data?, in folder: URL? = folder) throws {
        guard let folder else { throw CocoaError(.fileNoSuchFile) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let file { try file.write(to: folder.appendingPathComponent("\(entry.id).bin"), options: .atomic) }
        try JSONEncoder().encode(entry).write(to: folder.appendingPathComponent("\(entry.id).json"), options: .atomic)
    }

    /// Everything shared since the last time, oldest first – and gone from the inbox.
    static func take(from folder: URL? = folder) -> [(entry: Entry, file: Data?)] {
        guard let folder, let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return [] }
        var out: [(entry: Entry, file: Data?)] = []
        for name in names where name.hasSuffix(".json") {
            let url = folder.appendingPathComponent(name)
            guard let entry = try? JSONDecoder().decode(Entry.self, from: Data(contentsOf: url)) else { continue }
            let bin = folder.appendingPathComponent("\(entry.id).bin")
            out.append((entry, try? Data(contentsOf: bin)))
            try? FileManager.default.removeItem(at: url)
            try? FileManager.default.removeItem(at: bin)
        }
        return out.sorted { $0.entry.created < $1.entry.created }
    }
}
