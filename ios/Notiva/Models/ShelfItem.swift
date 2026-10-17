import UIKit

/// Something for the shelf, made ready for `shelf.add`: photos as JPEG (at most 3000 px, so they
/// stay small), files as they are (at most 8 MB – the Mac's limit), texts as text.
enum ShelfItem {
    case photo(UIImage)
    case file(name: String, data: Data)
    case text(String)

    static let maxBytes = 8_000_000

    enum Kind: String, Codable, Sendable {
        case photo, file, text
        var symbol: String {
            switch self {
            case .photo: "photo"
            case .file: "doc"
            case .text: "text.alignleft"
            }
        }
    }

    struct Params: Codable, Sendable {
        var name: String?
        var text: String?
    }

    struct Ready {
        let params: Params
        /// sent as `data` (base64)
        let data: Data?
        let title: String
        let label: String
        let kind: Kind
    }

    enum Problem: LocalizedError {
        case tooLarge(String)
        case unreadable
        var errorDescription: String? {
            switch self {
            case let .tooLarge(name): String(localized: "„\(name)“ ist größer als 8 MB – das nimmt der Mac nicht an.")
            case .unreadable: String(localized: "Das Bild ließ sich nicht umwandeln.")
            }
        }
    }

    func prepared(now: Date = Date()) throws -> Ready {
        switch self {
        case let .photo(image):
            guard let data = Self.jpeg(image) else { throw Problem.unreadable }
            let name = "Foto \(Self.stamp(now)).jpg"
            return Ready(params: Params(name: name), data: data, title: name, label: String(localized: "Ablegen: \(name)"), kind: .photo)
        case let .file(name, data):
            guard data.count <= Self.maxBytes else { throw Problem.tooLarge(name) }
            return Ready(params: Params(name: name), data: data, title: name, label: String(localized: "Ablegen: \(name)"), kind: .file)
        case let .text(text):
            let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let first = body.split(whereSeparator: \.isNewline).first.map(String.init) ?? body
            let title = first.count > 60 ? String(first.prefix(60)) + "…" : first
            return Ready(params: Params(text: body), data: nil, title: title, label: String(localized: "Ablegen: \(title)"), kind: .text)
        }
    }

    /// "2026-10-17 18.30" – sorts by time and is a valid file name everywhere.
    static func stamp(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH.mm"
        return f.string(from: date)
    }

    static func scanName(_ date: Date = Date()) -> String { "Scan \(stamp(date)).pdf" }

    /// Smaller than the camera's original (3000 px on the long side), JPEG – down in quality
    /// until it fits.
    static func jpeg(_ image: UIImage, maxSide: CGFloat = 3000) -> Data? {
        let side = max(image.size.width, image.size.height)
        let scale = min(1, maxSide / max(side, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        for quality in [0.8, 0.6, 0.4] {
            if let data = resized.jpegData(compressionQuality: quality), data.count <= maxBytes { return data }
        }
        return nil
    }

    /// Scanned pages as one PDF, A4 width.
    static func pdf(_ pages: [UIImage]) -> Data {
        let width: CGFloat = 595
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: width, height: width * 1.414))
        return renderer.pdfData { context in
            for page in pages {
                let height = width * page.size.height / max(page.size.width, 1)
                let bounds = CGRect(x: 0, y: 0, width: width, height: height)
                context.beginPage(withBounds: bounds, pageInfo: [:])
                page.draw(in: bounds)
            }
        }
    }
}

/// What was put on the shelf from this device lately (title and time only) – shown under the
/// buttons, at most 30.
struct ShelfHistory {
    struct Entry: Codable, Sendable, Identifiable {
        let id: UUID
        let title: String
        let kind: ShelfItem.Kind
        let date: Date
    }

    private(set) var entries: [Entry] = []
    private static let key = "shelf-history"

    static func load(_ store: OfflineStore) -> ShelfHistory {
        ShelfHistory(entries: store.load(key).flatMap { try? JSONDecoder().decode([Entry].self, from: $0) } ?? [])
    }

    mutating func remove(_ id: UUID, store: OfflineStore) {
        entries.removeAll { $0.id == id }
        save(store)
    }

    private func save(_ store: OfflineStore) {
        if let data = try? JSONEncoder().encode(entries) { store.save(data, for: Self.key) }
    }

    mutating func add(_ entry: Entry, store: OfflineStore) {
        entries.insert(entry, at: 0)
        entries = Array(entries.prefix(30))
        save(store)
    }
}
