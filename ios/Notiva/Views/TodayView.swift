import SwiftUI

/// "Heute" like on the Mac: lectures (the running one marked), exams, labs, tasks (overdue in red),
/// deadlines with their submission state, "Lernen heute" to tick off and "Demnächst".
struct TodayView: View {
    @Environment(AppModel.self) private var model
    @State private var date = Date()
    @State private var day: Day?
    @State private var cached = false
    @State private var loading = true

    private var key: String { DayFormat.string(date) }
    private var isToday: Bool { Calendar.current.isDateInToday(date) }

    var body: some View {
        List {
            if let day {
                SwiftUI.Section {
                    if day.items.isEmpty {
                        Text(isToday ? "Heute steht nichts an." : "An diesem Tag steht nichts an.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(sorted(day.items)) { AgendaRow(item: $0, isToday: isToday) }
                } header: {
                    Text(date, format: .dateTime.weekday(.wide).day().month(.wide))
                }
                ForEach(day.study) { group in
                    SwiftUI.Section {
                        ForEach(group.topics) { topic in
                            TopicRow(topic: topic) { toggle(topic, in: group) }
                        }
                    } header: {
                        Label("Lernen heute · \(group.module.title)", systemImage: "calendar.badge.checkmark")
                    }
                }
                if !day.upcoming.isEmpty {
                    SwiftUI.Section("Demnächst") {
                        ForEach(day.upcoming.sorted { ($0.date ?? "", $0.time ?? "") < ($1.date ?? "", $1.time ?? "") }) {
                            AgendaRow(item: $0, isToday: false, showDate: true)
                        }
                    }
                }
                if cached {
                    Text("Letzter Stand – der Mac ist gerade nicht erreichbar.")
                        .font(.footnote).foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                }
            } else if loading {
                ProgressView().frame(maxWidth: .infinity)
            } else {
                ContentUnavailableView("Noch keine Daten", systemImage: "wifi.slash",
                                       description: Text("Sobald der Mac erreichbar ist, erscheint hier dein Tag."))
            }
        }
        .accessibilityIdentifier("today-list")
        .toolbar {
            ToolbarItemGroup(placement: .topBarLeading) {
                Button { shift(-1) } label: { Label("Vorheriger Tag", systemImage: "chevron.left") }
                Button { shift(1) } label: { Label("Nächster Tag", systemImage: "chevron.right") }
                if !isToday { Button("Heute") { date = Date() } }
            }
        }
        .task(id: key) { await load() }
        .refreshable { await model.refresh(); await load() }
    }

    private func sorted(_ items: [AgendaItem]) -> [AgendaItem] {
        // Overdue and all-day first, then by time – as on the Mac.
        items.sorted {
            if ($0.time == nil) != ($1.time == nil) { return $0.time == nil }
            if ($0.overdue ?? false) != ($1.overdue ?? false) { return $0.overdue ?? false }
            return ($0.time ?? "") < ($1.time ?? "")
        }
    }

    private func shift(_ days: Int) {
        date = Calendar.current.date(byAdding: .day, value: days, to: date) ?? date
    }

    private func load() async {
        loading = true
        let result = await model.load("day", ["date": key], key: "day-\(key)", as: Day.self)
        day = result.value.map(withWaiting)
        cached = result.cached && result.value != nil
        loading = false
    }

    /// Ticks not sent yet, laid over the loaded day.
    private func withWaiting(_ day: Day) -> Day {
        var day = day
        for change in model.waiting("study.done", as: StudyDone.self) {
            for g in day.study.indices where day.study[g].module.path == change.module {
                for t in day.study[g].topics.indices where day.study[g].topics[t].key == change.key {
                    day.study[g].topics[t].done = change.done
                }
            }
        }
        return day
    }

    /// Ticks at once; sent now or as soon as the Mac is reachable.
    private func toggle(_ topic: StudyGroup.Topic, in group: StudyGroup) {
        guard var current = day,
              let g = current.study.firstIndex(where: { $0.id == group.id }),
              let t = current.study[g].topics.firstIndex(where: { $0.id == topic.id })
        else { return }
        current.study[g].topics[t].done.toggle()
        day = current
        let done = current.study[g].topics[t].done
        Task {
            await model.send(
                "study.done",
                StudyDone(module: group.module.path, key: topic.key, done: done),
                label: done ? String(localized: "Gelernt: \(topic.title)") : String(localized: "Nicht gelernt: \(topic.title)")
            )
        }
    }
}

struct StudyDone: Codable, Sendable {
    let module: String
    let key: String
    let done: Bool
}

/// One entry of the day: time (or "fällig"), what, where.
struct AgendaRow: View {
    let item: AgendaItem
    let isToday: Bool
    var showDate = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            // Start on top, end small below – never wrapping in the middle of a time.
            VStack(alignment: .leading, spacing: 1) {
                if showDate, let date = item.date.flatMap(DayFormat.date) {
                    Text(date, format: .dateTime.weekday(.abbreviated).day().month(.twoDigits))
                        .font(.subheadline.weight(.medium))
                }
                if let time = item.time {
                    Text(time).font(showDate ? .caption.monospacedDigit() : .subheadline.monospacedDigit().weight(.medium))
                    if let end = item.end, !showDate { Text(end).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                } else {
                    Text(item.overdue == true ? "überfällig" : "fällig")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(item.overdue == true ? .red : .secondary)
                }
            }
            .lineLimit(1)
            .frame(minWidth: showDate ? 80 : 58, alignment: .leading)
            .fixedSize(horizontal: true, vertical: false)

            Image(systemName: item.symbol)
                .foregroundStyle(item.kind == .exam || item.overdue == true ? Color.red : Color.accentColor)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.body.weight(.medium))
                    .strikethrough(item.done == true)
                if !item.sub.isEmpty {
                    Text(item.sub).font(.footnote).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if running {
                Text("jetzt")
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Color.accentColor.opacity(0.15), in: .capsule)
                    .foregroundStyle(Color.accentColor)
            }
        }
        .opacity(item.done == true || past ? 0.55 : 1)
        .listRowBackground(running ? Color.accentColor.opacity(0.08) : nil)
        .accessibilityElement(children: .combine)
    }

    private func minutes(_ hhmm: String?) -> Int? {
        guard let parts = hhmm?.split(separator: ":"), parts.count == 2,
              let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        return h * 60 + m
    }

    private var nowMinutes: Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: Date())
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    private var running: Bool {
        guard isToday, let start = minutes(item.time), let end = minutes(item.end) else { return false }
        return start <= nowMinutes && nowMinutes < end
    }

    private var past: Bool {
        guard isToday, let start = minutes(item.time) else { return false }
        return (minutes(item.end) ?? start + 60) < nowMinutes
    }
}

/// A study plan topic with its tick.
struct TopicRow: View {
    let topic: StudyGroup.Topic
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 12) {
                Image(systemName: topic.done ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(topic.done ? Color.accentColor : .secondary)
                    .contentTransition(.symbolEffect(.replace))
                Text(topic.title)
                    .strikethrough(topic.done)
                    .foregroundStyle(topic.done ? .secondary : .primary)
                Spacer(minLength: 0)
            }
            // The whole row is the tap target, not only text and circle.
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(topic.title)
        .accessibilityValue(topic.done ? String(localized: "gelernt") : String(localized: "offen"))
        .accessibilityHint("Doppeltippen zum Abhaken")
    }
}
