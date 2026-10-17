import Foundation
import UIKit

/// A PDF of the folder (`pdfs`).
struct PdfRef: Codable, Sendable, Equatable, Identifiable, Hashable {
    let path: String
    let size: Int
    let mtime: Double
    var id: String { path }
    var folder: String { path.contains("/") ? String(path[..<path.lastIndex(of: "/")!]) : "" }
    var title: String { ((path as NSString).lastPathComponent as NSString).deletingPathExtension }
}

/// One annotation as the Mac stores it (src/lib/annotations.ts): PDF points, origin top left.
struct PdfAnnotation: Codable, Sendable, Equatable, Identifiable {
    enum Kind: String, Codable, Sendable {
        case highlight, note, ink, text
    }

    let id: String
    let type: Kind
    let page: Int
    var color: String
    /// highlight: one [x, y, w, h] per line
    var rects: [[Double]]?
    /// highlight: the marked text; note/text: what was written
    var text: String?
    /// highlight: the comment on it
    var comment: String?
    var x: Double?
    var y: Double?
    /// text: box width and font size
    var w: Double?
    var size: Double?
    /// ink
    var width: Double?
    var points: [[Double]]?

    static let colors = ["yellow", "green", "blue", "pink", "red"]

    static func newID() -> String {
        "i" + String(Int(Date().timeIntervalSince1970 * 1000), radix: 36) + String(Int.random(in: 0..<1_679_616), radix: 36)
    }

    /// The Mac's marker colors.
    static func uiColor(_ name: String) -> UIColor {
        switch name {
        case "green": UIColor(red: 0.53, green: 0.85, blue: 0.55, alpha: 1)
        case "blue": UIColor(red: 0.55, green: 0.75, blue: 0.98, alpha: 1)
        case "pink": UIColor(red: 0.98, green: 0.6, blue: 0.8, alpha: 1)
        case "red": UIColor(red: 0.97, green: 0.45, blue: 0.45, alpha: 1)
        default: UIColor(red: 1, green: 0.88, blue: 0.35, alpha: 1)
        }
    }

    static func colorName(_ name: String) -> String {
        switch name {
        case "green": String(localized: "Grün")
        case "blue": String(localized: "Blau")
        case "pink": String(localized: "Rosa")
        case "red": String(localized: "Rot")
        default: String(localized: "Gelb")
        }
    }
}

/// A PDF's annotations and page notes (`notes`): {"3": "…"} by page.
struct PdfNotes: Codable, Sendable, Equatable {
    let pdf: String
    var annotations: [PdfAnnotation]
    var notes: [String: String]
    var mtime: Double?

    func note(_ page: Int) -> String { notes[String(page)] ?? "" }

    /// A change laid over this state (as the Mac will apply it).
    func applying(_ change: PdfNotesChange) -> PdfNotes {
        var next = self
        var byID = Dictionary(annotations.map { ($0.id, $0) }, uniquingKeysWith: { $1 })
        var order = annotations.map(\.id)
        for id in change.remove ?? [] { byID[id] = nil }
        for a in (change.add ?? []) + (change.update ?? []) {
            if byID[a.id] == nil, !order.contains(a.id) { order.append(a.id) }
            byID[a.id] = a
        }
        next.annotations = order.compactMap { byID[$0] }
        for n in change.notes ?? [] { next.notes[String(n.page)] = n.text.isEmpty ? nil : n.text }
        return next
    }
}

/// What the phone changed (`notes.put`): merged on the Mac by annotation id; page notes against
/// the text they started from (`base`).
struct PdfNotesChange: Codable, Sendable {
    struct Note: Codable, Sendable {
        let page: Int
        let text: String
        let base: String
    }

    let pdf: String
    var add: [PdfAnnotation]?
    var update: [PdfAnnotation]?
    var remove: [String]?
    var notes: [Note]?
}

struct PdfRequest: Codable, Sendable {
    let pdf: String
}
