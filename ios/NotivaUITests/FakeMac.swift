import Foundation

/// Where the UI tests reach ios/scripts/fake-mac.ts: 127.0.0.1 and – for simulators that do not
/// see the Mac's loopback – its network address (`TEST_RUNNER_FAKE_MAC_HOST` from screenshots.sh).
enum FakeMac {
    static var hosts: String {
        var list = ["127.0.0.1"]
        if let host = ProcessInfo.processInfo.environment["FAKE_MAC_HOST"], !host.isEmpty { list.insert(host, at: 0) }
        return list.map { "\"\($0)\"" }.joined(separator: ",")
    }
}
