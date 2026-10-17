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
        default: SectionPlaceholder(section: section)
        }
    }
}

/// Until the next steps fill them in (#46–#49): what the view will show.
private struct SectionPlaceholder: View {
    let section: AppSection

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label(section.title, systemImage: section.symbol)
            } description: {
                Text(description)
            }
            .padding(.top, 40)
        }
    }

    private var description: LocalizedStringKey {
        switch section {
        case .today, .timetable: ""
        case .tasks: "Aufgaben abhaken und anlegen – kommt im nächsten Schritt."
        case .shelf: "Foto, Text oder Datei schnell auf den Mac legen – kommt bald."
        case .pages: "Seiten lesen und bearbeiten, PDFs markieren – kommt bald."
        }
    }
}

/// Online with the Mac, connecting, or showing the last state (with the reason).
struct ConnectionBanner: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.connection {
        case .online:
            if !model.pending.isEmpty { banner("arrow.triangle.2.circlepath", "\(model.pending.count) Änderungen warten", .orange) }
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
