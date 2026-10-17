import SwiftUI

/// The tasks database from the Mac: open ones by due date (overdue, today, this week, later,
/// without date), tick off, create. Changes count at once and are sent when the Mac is reachable.
struct TasksView: View {
    @Environment(AppModel.self) private var model
    @State private var tasks: [TaskItem] = []
    @State private var loaded = false
    @State private var cached = false
    @State private var showDone = false
    @State private var creating = false
    /// Ticked here since the last load: stays in place (struck through) like in Reminders.
    @State private var justDone: Set<String> = []

    var body: some View {
        Group {
            if !loaded {
                ProgressView()
            } else if tasks.isEmpty {
                ContentUnavailableView {
                    Label("Keine Aufgaben", systemImage: "checklist")
                } description: {
                    Text("Leg mit + eine an – oder am Mac in der Aufgaben-Datenbank deines Studiums.")
                } actions: {
                    Button("Neue Aufgabe") { creating = true }.buttonStyle(.borderedProminent)
                }
            } else {
                list
            }
        }
        .accessibilityIdentifier("tasks")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Menu {
                    Toggle("Erledigte zeigen", systemImage: "checkmark.circle", isOn: $showDone.animation())
                } label: {
                    Label("Anzeigen", systemImage: "line.3.horizontal.decrease")
                }
                Button { creating = true } label: { Label("Neue Aufgabe", systemImage: "plus") }
                    .accessibilityIdentifier("new-task")
            }
        }
        .sheet(isPresented: $creating) {
            NewTaskView { await add($0) }
        }
        .task { await load() }
        .refreshable { await model.refresh(); await load() }
    }

    private var list: some View {
        List {
            ForEach(groups, id: \.id) { group in
                SwiftUI.Section {
                    ForEach(group.tasks) { task in
                        TaskRow(task: task) { toggle(task) }
                            .swipeActions(edge: .leading) {
                                Button { toggle(task) } label: {
                                    Label(task.done ? "Wieder offen" : "Erledigt",
                                          systemImage: task.done ? "arrow.uturn.backward" : "checkmark")
                                }
                                .tint(task.done ? .gray : .accentColor)
                            }
                    }
                } header: {
                    Text(group.title)
                }
            }
            if groups.isEmpty {
                Text("Alles erledigt.").foregroundStyle(.secondary)
            }
            if cached {
                Text("Letzter Stand – der Mac ist gerade nicht erreichbar.")
                    .font(.footnote).foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
        }
    }

    // MARK: Grouping

    private struct TaskGroup {
        let id: String
        let title: LocalizedStringKey
        let tasks: [TaskItem]

        init(_ title: String, _ tasks: [TaskItem]) {
            id = title
            self.title = LocalizedStringKey(title)
            self.tasks = tasks
        }
    }

    private var groups: [TaskGroup] {
        let today = DayFormat.string(Date())
        let cal = Calendar.current
        let tomorrow = DayFormat.string(cal.date(byAdding: .day, value: 1, to: Date()) ?? Date())
        let week = DayFormat.string(cal.date(byAdding: .day, value: 7, to: Date()) ?? Date())
        let open = tasks.filter { !$0.done || justDone.contains($0.path) }
        let byDue = { (a: TaskItem, b: TaskItem) in (a.due ?? "", a.title) < (b.due ?? "", b.title) }
        var out: [TaskGroup] = [
            TaskGroup("Überfällig", open.filter { ($0.dueDay ?? "9") < today }),
            TaskGroup("Heute", open.filter { $0.dueDay == today }),
            TaskGroup("Morgen", open.filter { $0.dueDay == tomorrow }),
            TaskGroup("Nächste 7 Tage", open.filter { ($0.dueDay ?? "") > tomorrow && ($0.dueDay ?? "") <= week }),
            TaskGroup("Später", open.filter { ($0.dueDay ?? "") > week }),
            TaskGroup("Ohne Datum", open.filter { $0.dueDay == nil }),
        ]
        if showDone {
            out.append(TaskGroup("Erledigt", tasks.filter { $0.done && !justDone.contains($0.path) }.sorted { byDue($1, $0) }))
        }
        return out.map { TaskGroup($0.id, $0.id == "Erledigt" ? $0.tasks : $0.tasks.sorted(by: byDue)) }.filter { !$0.tasks.isEmpty }
    }

    // MARK: Loading and changes

    private func load() async {
        let result = await model.load("tasks", Empty(), key: "tasks", as: [TaskItem].self)
        tasks = withWaiting(result.value ?? [])
        justDone = []
        cached = result.cached && result.value != nil
        loaded = true
    }

    /// Ticks and new tasks not sent yet, laid over the loaded list.
    private func withWaiting(_ loaded: [TaskItem]) -> [TaskItem] {
        var list = loaded
        for change in model.waiting("task.set", as: TaskDone.self) {
            if let i = list.firstIndex(where: { $0.path == change.path }) { list[i].status = change.done ? "Erledigt" : "Offen" }
        }
        for new in model.waiting("task.add", as: NewTask.self) {
            list.append(TaskItem(path: "neu:\(new.title)|\(new.due ?? "")", title: new.title, due: new.due, status: "Offen",
                                 module: new.module.flatMap { path in modules.first { $0.path == path } }))
        }
        return list
    }

    /// Module titles for new tasks still waiting (from the last module list).
    private var modules: [ModuleRef] {
        model.store.load("modules").flatMap { try? JSONDecoder().decode(SyncReply<[ModuleRef]>.self, from: $0) }?.r ?? []
    }

    private func toggle(_ task: TaskItem) {
        guard !task.isNew, let i = tasks.firstIndex(of: task) else { return }
        let done = !task.done
        withAnimation {
            tasks[i].status = done ? "Erledigt" : "Offen"
            if done { justDone.insert(task.path) } else { justDone.remove(task.path) }
        }
        Task {
            await model.send("task.set", TaskDone(path: task.path, done: done),
                             label: done ? String(localized: "Erledigt: \(task.title)") : String(localized: "Wieder offen: \(task.title)"))
        }
    }

    private func add(_ new: NewTask) async {
        await model.send("task.add", new, label: String(localized: "Neue Aufgabe: \(new.title)"))
        await load()
    }
}

struct TaskDone: Codable, Sendable {
    let path: String
    let done: Bool
}

struct NewTask: Codable, Sendable {
    let title: String
    /// "yyyy-MM-dd" or "yyyy-MM-ddTHH:mm"
    var due: String?
    /// module page path
    var module: String?
}

/// Circle, title, module and kind, the due date on the right (red when overdue).
private struct TaskRow: View {
    let task: TaskItem
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(task.done ? Color.accentColor : .secondary)
                    .contentTransition(.symbolEffect(.replace))
                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 6 }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        if task.priority == "Hoch" && !task.done {
                            Image(systemName: "exclamationmark").font(.footnote.bold()).foregroundStyle(.red)
                                .accessibilityLabel("Wichtig")
                        }
                        Text(task.title)
                            .strikethrough(task.done)
                            .foregroundStyle(task.done ? .secondary : .primary)
                    }
                    if !details.isEmpty {
                        Text(details).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                if let label = dueLabel {
                    Text(label)
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(overdue ? .red : .secondary)
                        .lineLimit(1)
                        .fixedSize()
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .opacity(task.isNew ? 0.6 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(task.title)
        .accessibilityValue(task.isNew ? String(localized: "wird übertragen") : task.done ? String(localized: "erledigt") : String(localized: "offen"))
        .accessibilityHint("Doppeltippen zum Abhaken")
        .accessibilityIdentifier("task-\(task.title)")
    }

    private var details: String {
        [task.module?.title, task.art, task.isNew ? String(localized: "wird übertragen") : nil]
            .compactMap { $0 }.joined(separator: " · ")
    }

    private var overdue: Bool {
        !task.done && (task.dueDay ?? "9") < DayFormat.string(Date())
    }

    private var dueLabel: String? {
        guard let day = task.dueDay, let date = DayFormat.date(day) else { return nil }
        let cal = Calendar.current
        var text: String
        if cal.isDateInToday(date) { text = String(localized: "heute") }
        else if cal.isDateInTomorrow(date) { text = String(localized: "morgen") }
        else if cal.isDateInYesterday(date) { text = String(localized: "gestern") }
        else { text = date.formatted(.dateTime.weekday(.abbreviated).day().month(.twoDigits)) }
        if let time = task.dueTime { text += " \(time)" }
        return text
    }
}

/// Title, optional due date (with time if wanted) and module.
struct NewTaskView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let save: (NewTask) async -> Void

    @State private var title = ""
    @State private var hasDue = true
    @State private var due = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var withTime = false
    @State private var module: String?
    @State private var modules: [ModuleRef] = []
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                TextField("Was ist zu tun?", text: $title)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(add)
                    .accessibilityIdentifier("task-title")
                SwiftUI.Section {
                    Toggle("Fällig", isOn: $hasDue.animation())
                    if hasDue {
                        DatePicker("Datum", selection: $due, displayedComponents: .date)
                        Toggle("Mit Uhrzeit", isOn: $withTime.animation())
                        if withTime {
                            DatePicker("Uhrzeit", selection: $due, displayedComponents: .hourAndMinute)
                        }
                    }
                }
                if !modules.isEmpty {
                    Picker("Modul", selection: $module) {
                        Text("Keins").tag(String?.none)
                        ForEach(modules, id: \.path) { Text($0.title).tag(Optional($0.path)) }
                    }
                }
            }
            .navigationTitle("Neue Aufgabe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hinzufügen", action: add)
                    .disabled(trimmed.isEmpty)
                    .accessibilityIdentifier("add-task")
                }
            }
            .task {
                focused = true
                modules = await model.load("modules", Empty(), key: "modules", as: [ModuleRef].self).value ?? []
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func add() {
        guard !trimmed.isEmpty else { return }
        let new = NewTask(title: trimmed, due: hasDue ? dueString : nil, module: module)
        dismiss()
        Task { await save(new) }
    }

    private var trimmed: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var dueString: String {
        let day = DayFormat.string(due)
        guard withTime else { return day }
        let c = Calendar.current.dateComponents([.hour, .minute], from: due)
        return day + String(format: "T%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}
