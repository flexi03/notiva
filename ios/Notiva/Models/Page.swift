import Foundation

/// A page of the folder (`pages`).
struct PageRef: Codable, Sendable, Equatable, Identifiable, Hashable {
    let path: String
    let title: String
    let mtime: Double
    var icon: String?
    var id: String { path }

    /// "Studium/Module" for "Studium/Module/Mathe.md"; "" at the top.
    var folder: String { path.contains("/") ? String(path[..<path.lastIndex(of: "/")!]) : "" }
    var modified: Date { Date(timeIntervalSince1970: mtime / 1000) }
}

/// One page (`page`): Markdown to edit, HTML to show (rendered by the Mac like there).
struct PageContent: Codable, Sendable, Equatable {
    let path: String
    let title: String
    var body: String
    let data: [String: JSONValue]
    let mtime: Double
    var html: String?

    /// The properties worth showing: the user's own (capitalized, like "Status") and tags –
    /// not Notiva's hidden ones (icon, lernplan …). Wiki links without brackets.
    var properties: [(name: String, value: String)] {
        data.keys.sorted().compactMap { key in
            guard key.first?.isUppercase == true || key == "tags", let value = data[key].flatMap(Self.text), !value.isEmpty else { return nil }
            return (key, value)
        }
    }

    private static func text(_ value: JSONValue) -> String? {
        switch value {
        case let .string(s): s.replacingOccurrences(of: "[[", with: "").replacingOccurrences(of: "]]", with: "")
        case let .number(n): n.rounded() == n ? String(Int(n)) : n.formatted()
        case let .bool(b): b ? "✓" : "–"
        case let .array(items): items.compactMap(text).joined(separator: ", ")
        case .object, .null: nil
        }
    }
}

struct PagePut: Codable, Sendable {
    let path: String
    let body: String
    /// the Mac's mtime when it was loaded – a newer one there means: conflict
    let base: Double
}

struct PageCopy: Codable, Sendable {
    let path: String
    let body: String
    let device: String
}

struct PageRequest: Codable, Sendable {
    let path: String
}
