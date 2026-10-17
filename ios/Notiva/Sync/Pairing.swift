import CryptoKit
import Foundation
import Security

/// What the QR code on the Mac holds (Settings → iPhone & iPad): device id, its own key, how to
/// reach the Mac. Kept in the keychain – only on this device, not in backups to other devices –
/// in a group the share extension can read too.
struct Pairing: Codable, Sendable, Equatable {
    let v: Int
    let id: String
    let key: String
    var port: Int
    var hosts: [String]
    let name: String

    var symmetricKey: SymmetricKey? {
        guard let data = Data(base64Encoded: key), data.count == 32 else { return nil }
        return SymmetricKey(data: data)
    }

    /// Reads a scanned (or pasted) code; nil when it is no Notiva pairing code.
    static func parse(_ text: String) -> Pairing? {
        guard let data = text.data(using: .utf8),
              let pairing = try? JSONDecoder().decode(Pairing.self, from: data),
              pairing.v == 1, !pairing.id.isEmpty, pairing.symmetricKey != nil, pairing.port > 0
        else { return nil }
        return pairing
    }
}

enum PairingStore {
    private static let service = "io.github.flexi03.notiva.pairing"
    private static let account = "mac"
    /// "<team>.io.github.flexi03.notiva.shared" (Info.plist, from the entitlements' prefix)
    private static var group: String? { Bundle.main.object(forInfoDictionaryKey: "NotivaKeychainGroup") as? String }

    static func load() -> Pairing? {
        if let group, let pairing = read(group: group) { return pairing }
        // Paired before the share extension: in the app's own group – moved to the shared one.
        guard let pairing = read(group: nil) else { return nil }
        if group != nil { try? save(pairing) }
        return pairing
    }

    private static func read(group: String?) -> Pairing? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        if let group { query[kSecAttrAccessGroup as String] = group }
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return try? JSONDecoder().decode(Pairing.self, from: data)
    }

    static func save(_ pairing: Pairing) throws {
        let data = try JSONEncoder().encode(pairing)
        delete()
        var item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        if let group { item[kSecAttrAccessGroup as String] = group }
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    /// Removes it from every group (the old one included).
    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
