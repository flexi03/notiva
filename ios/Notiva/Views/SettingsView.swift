import SwiftUI

/// The Mac this device is paired with, what waits to be sent, unpairing.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var confirmUnpair = false

    var body: some View {
        NavigationStack {
            Form {
                SwiftUI.Section("Mac") {
                    LabeledContent("Ordner", value: model.pairing?.name ?? "–")
                    LabeledContent("Status", value: status)
                        .accessibilityIdentifier("connection-status")
                    if let last = model.lastSync {
                        LabeledContent("Zuletzt abgeglichen") { Text(last, style: .relative) }
                    }
                    Button("Jetzt abgleichen") { Task { await model.refresh() } }
                }
                if !model.pending.isEmpty {
                    SwiftUI.Section("Wartet auf den Mac") {
                        ForEach(model.pending) { item in
                            VStack(alignment: .leading) {
                                Text(item.label)
                                if let error = item.error {
                                    Text(error).font(.footnote).foregroundStyle(.red)
                                }
                            }
                            .swipeActions { Button("Verwerfen", role: .destructive) { model.discard(item) } }
                        }
                    }
                }
                SwiftUI.Section {
                    Button("Entkoppeln", role: .destructive) { confirmUnpair = true }
                } footer: {
                    Text("Entfernt den Schlüssel und alles Gespeicherte von diesem Gerät. Am Mac kannst du das Gerät zusätzlich unter „iPhone & iPad“ entfernen.")
                }
            }
            .navigationTitle("Einstellungen")
            .toolbar { Button("Fertig") { dismiss() } }
            .confirmationDialog("Dieses Gerät entkoppeln?", isPresented: $confirmUnpair, titleVisibility: .visible) {
                Button("Entkoppeln", role: .destructive) {
                    model.unpair()
                    dismiss()
                }
            }
        }
    }

    private var status: String {
        switch model.connection {
        case let .online(vault): String(localized: "Verbunden mit „\(vault)“")
        case .connecting: String(localized: "Verbinde …")
        case .offline: String(localized: "Nicht erreichbar – letzter Stand")
        case .unpaired: String(localized: "Nicht gekoppelt")
        }
    }
}
