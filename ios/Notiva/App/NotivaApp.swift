import SwiftUI

@main
struct NotivaApp: App {
    @State private var model = AppModel.forLaunch()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                // Back in the app: fresh data and whatever waits gets sent.
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await model.refresh() } }
                }
        }
    }
}

extension AppModel {
    /// UI tests start with a pairing code (`-pairing <code>`) and their own, empty storage.
    static func forLaunch() -> AppModel {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-uitest") else { return AppModel() }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("notiva-uitest-\(UUID().uuidString)")
        let store = OfflineStore(folder: folder)
        let code = args.indices.contains(index + 1) ? args[index + 1] : ""
        return AppModel(store: store, pairing: Pairing.parse(code))
    }
}
