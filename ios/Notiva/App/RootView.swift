import SwiftUI

/// Not paired yet: pairing. Otherwise the app – tabs on the iPhone, a sidebar on the iPad and the
/// unfolded iPhone Duo (the same views, arranged by the system).
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if model.pairing == nil {
            PairingView()
        } else {
            MainView()
                .task { await model.refresh() }
        }
    }
}

enum AppSection: String, CaseIterable, Identifiable {
    case today, timetable, tasks, shelf, pages
    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .today: "Heute"
        case .timetable: "Stundenplan"
        case .tasks: "Aufgaben"
        case .shelf: "Ablage"
        case .pages: "Seiten"
        }
    }

    var symbol: String {
        switch self {
        case .today: "sun.max"
        case .timetable: "calendar.day.timeline.left"
        case .tasks: "checklist"
        case .shelf: "tray.and.arrow.down"
        case .pages: "doc.text"
        }
    }
}

struct MainView: View {
    @Environment(AppModel.self) private var model
    @State private var selection: AppSection = .today
    @State private var showSettings = false

    var body: some View {
        TabView(selection: $selection) {
            ForEach(AppSection.allCases) { section in
                Tab(section.title, systemImage: section.symbol, value: section) {
                    NavigationStack {
                        content(section)
                            .navigationTitle(section.title)
                            .navigationBarTitleDisplayMode(.large)
                            .toolbar {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button { showSettings = true } label: {
                                        Label("Einstellungen", systemImage: "gearshape")
                                    }
                                }
                            }
                    }
                    // Connection state above the tab bar – the same in every section.
                    .safeAreaInset(edge: .bottom) { ConnectionBanner().padding(.bottom, 4) }
                }
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .sheet(isPresented: $showSettings) { SettingsView() }
    }
}

extension MainView {
    @ViewBuilder func content(_ section: AppSection) -> some View {
        switch section {
        case .today: TodayView()
        case .timetable: WeekView()
        case .tasks: TasksView()
        case .shelf: ShelfView()
        case .pages: PagesView()
        }
    }
}

/// Online with the Mac, connecting, or showing the last state (with the reason).
struct ConnectionBanner: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.connection {
        case .online:
            let open = model.pending.filter { $0.error == nil }.count
            let stuck = model.pending.count - open
            if stuck == 1 {
                banner("exclamationmark.triangle", "1 Änderung braucht deine Entscheidung", .orange)
            } else if stuck > 1 {
                banner("exclamationmark.triangle", "\(stuck) Änderungen brauchen deine Entscheidung", .orange)
            } else if open == 1 {
                banner("arrow.triangle.2.circlepath", "1 Änderung wird übertragen …", .secondary)
            } else if open > 1 {
                banner("arrow.triangle.2.circlepath", "\(open) Änderungen werden übertragen …", .secondary)
            }
        case .connecting:
            banner("antenna.radiowaves.left.and.right", "Verbinde mit dem Mac …", .secondary)
        case let .offline(reason):
            banner("wifi.slash", LocalizedStringKey(reason), .orange)
                .accessibilityIdentifier("offline-banner")
        case .unpaired:
            EmptyView()
        }
    }

    private func banner(_ symbol: String, _ text: LocalizedStringKey, _ color: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(.footnote)
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(color.opacity(0.12), in: .rect(cornerRadius: 12))
            .padding(.horizontal)
    }
}
