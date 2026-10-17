import Foundation

/// What the Mac answers for a day (`day`, same logic as "Heute" on the Mac).
struct Day: Codable, Sendable, Equatable {
    var date: String
    var items: [AgendaItem]
    var upcoming: [AgendaItem]
    var study: [StudyGroup]
}

struct AgendaItem: Codable, Sendable, Equatable, Identifiable {
    enum Kind: String, Codable, Sendable {
        case session, exam, lab, prep, task, moodle
    }

    let key: String
    let kind: Kind
    var time: String?
    var end: String?
    let title: String
    var sub: String
    var overdue: Bool?
    var done: Bool?
    var path: String?
    var url: String?
    var room: String?
    var module: String?
    /// upcoming entries: their day
    var date: String?

    var id: String { "\(key)|\(date ?? "")" }

    var symbol: String {
        switch kind {
        case .session: "graduationcap"
        case .exam: "pencil.and.list.clipboard"
        case .lab: "flask"
        case .prep: "book"
        case .task: "checkmark.square"
        case .moodle: "alarm"
        }
    }
}

/// One study plan's portion for the day.
struct StudyGroup: Codable, Sendable, Equatable, Identifiable {
    struct Module: Codable, Sendable, Equatable {
        let path: String
        let title: String
    }

    struct Topic: Codable, Sendable, Equatable, Identifiable {
        let key: String
        let path: String
        let kind: String
        var done: Bool
        var id: String { key }
        /// "DBS2 - Vorlesung 05.pdf" → "DBS2 - Vorlesung 05"
        var title: String { (key as NSString).deletingPathExtension }
    }

    let module: Module
    var topics: [Topic]
    var id: String { module.path }
}

/// A weekly session of the timetable (`week`).
struct Session: Codable, Sendable, Equatable, Identifiable {
    let weekday: String
    let time: String
    var end: String?
    let title: String
    var type: String?
    var room: String?
    var module: String?
    var id: String { "\(weekday)|\(time)|\(title)" }

    static let weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
}

enum DayFormat {
    static let iso: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func string(_ date: Date) -> String { iso.string(from: date) }
    static func date(_ string: String) -> Date? { iso.date(from: string) }

    /// "Mo" … "So" for a date (the Mac's weekday names).
    static func weekday(_ date: Date) -> String {
        let index = (Calendar(identifier: .gregorian).component(.weekday, from: date) + 5) % 7
        return Session.weekdays[index]
    }
}

/// A row of the tasks database (`tasks`).
struct TaskItem: Codable, Sendable, Equatable, Identifiable {
    struct Module: Codable, Sendable, Equatable {
        let path: String
        let title: String
    }

    let path: String
    let title: String
    /// "2026-10-20" or "2026-10-20T10:00"
    var due: String?
    var status: String
    var art: String?
    var priority: String?
    var module: Module?
    var moodle: Bool?
    var id: String { path }

    var done: Bool { status == "Erledigt" }
    var dueDay: String? { due.map { String($0.prefix(10)) } }
    var dueTime: String? { (due?.count ?? 0) > 10 ? due.map { String($0.suffix(5)) } : nil }
    /// Made on this device, not on the Mac yet.
    var isNew: Bool { path.hasPrefix("neu:") }
}

/// A module page (`modules`) – to give a new task its module.
typealias ModuleRef = TaskItem.Module
