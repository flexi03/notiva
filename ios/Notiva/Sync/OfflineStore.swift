import Foundation

/// The last state from the Mac (one file per answer) and the changes waiting to be sent – both in
/// the app's own storage, so the app works without the Mac and nothing made offline is lost.
struct OfflineStore: Sendable {
    let folder: URL

    init(folder: URL? = nil) {
        let base = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Notiva", isDirectory: true)
        self.folder = base
        try? FileManager.default.createDirectory(at: base.appendingPathComponent("cache"), withIntermediateDirectories: true)
    }

    private func url(_ key: String) -> URL {
        let safe = key.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression)
        return folder.appendingPathComponent("cache").appendingPathComponent("\(safe).json")
    }

    func save(_ data: Data, for key: String) {
        try? data.write(to: url(key), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func load(_ key: String) -> Data? {
        try? Data(contentsOf: url(key))
    }

    /// When an answer was stored (to show "Stand von …").
    func date(of key: String) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: url(key).path))?[.modificationDate] as? Date
    }

    // MARK: Waiting changes

    struct Pending: Codable, Sendable, Identifiable, Equatable {
        let id: UUID
        let method: String
        /// the params as JSON
        let params: Data
        let created: Date
        /// shown in the list ("Aufgabe abhaken: Blatt 3")
        let label: String
        /// the last error (e.g. a conflict) – kept until the user decides
        var error: String?
        /// the Mac's code for it ("conflict" …)
        var code: String?
        /// A file sent with it (a photo for the shelf), kept apart from the queue: sent as
        /// `data` (base64) in the params.
        var blob: UUID?
    }

    // MARK: Files waiting in the queue

    private func blobURL(_ id: UUID) -> URL { folder.appendingPathComponent("blobs").appendingPathComponent(id.uuidString) }

    func saveBlob(_ data: Data, id: UUID) throws {
        try FileManager.default.createDirectory(at: blobURL(id).deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: blobURL(id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func blob(_ id: UUID) -> Data? { try? Data(contentsOf: blobURL(id)) }

    func removeBlob(_ id: UUID) { try? FileManager.default.removeItem(at: blobURL(id)) }

    private var queueURL: URL { folder.appendingPathComponent("pending.json") }

    func pending() -> [Pending] {
        guard let data = try? Data(contentsOf: queueURL) else { return [] }
        return (try? JSONDecoder().decode([Pending].self, from: data)) ?? []
    }

    func setPending(_ list: [Pending]) {
        guard let data = try? JSONEncoder().encode(list) else { return }
        try? data.write(to: queueURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Everything gone (unpairing): cache and queue.
    func clear() {
        try? FileManager.default.removeItem(at: folder)
        try? FileManager.default.createDirectory(at: folder.appendingPathComponent("cache"), withIntermediateDirectories: true)
    }
}
