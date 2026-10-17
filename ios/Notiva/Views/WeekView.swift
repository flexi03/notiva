import SwiftUI

/// The timetable's week: on the iPhone one list by weekday (today first marked), on the iPad and
/// the unfolded iPhone Duo the days side by side.
struct WeekView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var sessions: [Session] = []
    @State private var loaded = false

    private var today: String { DayFormat.weekday(Date()) }
    private var days: [String] {
        let used = Set(sessions.map(\.weekday))
        // Mon–Fri always, the weekend only when something is on.
        return Session.weekdays.filter { Session.weekdays.prefix(5).contains($0) || used.contains($0) }
    }

    private func of(_ day: String) -> [Session] {
        sessions.filter { $0.weekday == day }.sorted { $0.time < $1.time }
    }

    var body: some View {
        Group {
            if !loaded {
                ProgressView()
            } else if sessions.isEmpty {
                ContentUnavailableView("Kein Stundenplan", systemImage: "calendar",
                                       description: Text("Trag deine Termine am Mac in den Stundenplan ein – oder lass sie dir aus Moodle vorschlagen."))
            } else if sizeClass == .regular {
                ScrollView {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(days, id: \.self) { day in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(name(day))
                                    .font(.headline)
                                    .foregroundStyle(day == today ? Color.accentColor : .primary)
                                ForEach(of(day)) { SessionCard(session: $0) }
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                        }
                    }
                    .padding()
                }
            } else {
                List {
                    ForEach(orderedFromToday, id: \.self) { day in
                        if !of(day).isEmpty {
                            SwiftUI.Section {
                                ForEach(of(day)) { SessionRow(session: $0) }
                            } header: {
                                Text(day == today ? "\(name(day)) · heute" : name(day))
                            }
                        }
                    }
                }
            }
        }
        .accessibilityIdentifier("week")
        .task { await load() }
        .refreshable { await model.refresh(); await load() }
    }

    /// Today first, then the rest of the week.
    private var orderedFromToday: [String] {
        guard let index = days.firstIndex(of: today) else { return days }
        return Array(days[index...] + days[..<index])
    }

    private func name(_ day: String) -> String {
        let names = ["Mo": "Montag", "Di": "Dienstag", "Mi": "Mittwoch", "Do": "Donnerstag", "Fr": "Freitag", "Sa": "Samstag", "So": "Sonntag"]
        return String(localized: String.LocalizationValue(names[day] ?? day))
    }

    private func load() async {
        let result = await model.load("week", Empty(), key: "week", as: [Session].self)
        sessions = result.value ?? []
        loaded = true
    }
}

private struct SessionRow: View {
    let session: Session
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(session.end.map { "\(session.time)–\($0)" } ?? session.time)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 96, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title).font(.body.weight(.medium))
                Text([session.type, session.room].compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct SessionCard: View {
    let session: Session
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(session.end.map { "\(session.time)–\($0)" } ?? session.time)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            Text(session.title).font(.subheadline.weight(.semibold))
            if let room = session.room { Text(room).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.accentColor.opacity(0.1), in: .rect(cornerRadius: 10))
        .overlay(alignment: .leading) {
            Rectangle().fill(Color.accentColor).frame(width: 3).clipShape(.rect(cornerRadius: 1.5))
        }
        .accessibilityElement(children: .combine)
    }
}
