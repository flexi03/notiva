import SwiftUI
import VisionKit

/// First start: pair with the Mac by scanning the code from Notiva's settings (or pasting it).
struct PairingView: View {
    @Environment(AppModel.self) private var model
    @State private var scanning = false
    @State private var pasted = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "laptopcomputer.and.iphone")
                            .font(.system(size: 44))
                            .foregroundStyle(.tint)
                            .accessibilityHidden(true)
                        Text("Mit deinem Mac koppeln")
                            .font(.largeTitle.bold())
                        Text("Notiva auf dem iPhone arbeitet mit deinem Ordner auf dem Mac – über dein WLAN oder Tailscale, verschlüsselt, ohne Cloud.")
                            .foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        step(1, "Öffne Notiva auf dem Mac: Einstellungen → Speicher & Daten → iPhone & iPad.")
                        step(2, "Klicke auf „iPhone oder iPad koppeln“.")
                        step(3, "Scanne den QR-Code.")
                    }

                    Button {
                        scanning = true
                    } label: {
                        Label("QR-Code scannen", systemImage: "qrcode.viewfinder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(busy || !DataScannerViewController.isSupported)

                    DisclosureGroup("Code einfügen") {
                        TextField("Code vom Mac", text: $pasted, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .font(.footnote.monospaced())
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .accessibilityIdentifier("pairing-code")
                        Button("Koppeln") { pair(pasted) }
                            .disabled(pasted.isEmpty || busy)
                            .accessibilityIdentifier("pair-button")
                    }

                    if busy { ProgressView("Verbinde mit dem Mac …") }
                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("pairing-error")
                    }
                }
                .padding(24)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .sheet(isPresented: $scanning) {
                QRScanner { code in
                    scanning = false
                    pair(code)
                }
                .ignoresSafeArea()
            }
        }
    }

    private func step(_ n: Int, _ text: LocalizedStringKey) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(n)")
                .font(.callout.bold())
                .frame(width: 26, height: 26)
                .background(.tint.opacity(0.15), in: .circle)
            Text(text)
        }
    }

    private func pair(_ code: String) {
        busy = true
        error = nil
        Task {
            do { try await model.pair(with: code.trimmingCharacters(in: .whitespacesAndNewlines)) }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

/// The camera looking for one QR code (VisionKit).
struct QRScanner: UIViewControllerRepresentable {
    let found: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_: DataScannerViewController, context _: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(found: found) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        private var done = false
        init(found: @escaping (String) -> Void) { self.found = found }

        func dataScanner(_: DataScannerViewController, didAdd items: [RecognizedItem], allItems _: [RecognizedItem]) {
            guard !done else { return }
            for item in items {
                if case let .barcode(code) = item, let text = code.payloadStringValue, Pairing.parse(text) != nil {
                    done = true
                    found(text)
                    return
                }
            }
        }
    }
}
