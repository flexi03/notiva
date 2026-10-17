import Foundation
import Observation

/// The app's state: paired or not, reachable or not, the last state of every view and the changes
/// waiting to be sent. Views read from here; nothing talks to the network on its own.
@MainActor
@Observable
final class AppModel {
    enum Connection: Equatable {
        case unpaired
        case connecting
        case online(vault: String)
        /// showing the last state; `reason` says why
        case offline(reason: String)
    }

    private(set) var pairing: Pairing?
    private(set) var connection: Connection = .unpaired
    private(set) var pending: [OfflineStore.Pending] = []
    private(set) var lastSync: Date?
    let store: OfflineStore
    private var client: SyncClient?

    struct Hello: Codable, Sendable {
        let protocolVersion: Int
        let vault: String
        let version: String

        enum CodingKeys: String, CodingKey {
            case protocolVersion = "protocol"
            case vault, version
        }
    }

    init(store: OfflineStore = OfflineStore(), pairing: Pairing? = PairingStore.load()) {
        self.store = store
        pending = store.pending()
        if let pairing { use(pairing) }
    }

    private func use(_ pairing: Pairing) {
        self.pairing = pairing
        client = SyncClient(pairing: pairing)
        connection = .connecting
    }

    /// A scanned code: stored in the keychain, then the first contact (which makes the pairing
    /// permanent on the Mac).
    func pair(with code: String) async throws {
        guard let pairing = Pairing.parse(code) else {
            throw SyncClient.SyncError.server(message: String(localized: "Das ist kein Notiva-Code zum Koppeln."), code: "code")
        }
        try PairingStore.save(pairing)
        store.clear()
        use(pairing)
        await refresh()
        if case let .offline(reason) = connection {
            throw SyncClient.SyncError.server(message: reason, code: "offline")
        }
    }

    func unpair() {
        PairingStore.delete()
        store.clear()
        pairing = nil
        client = nil
        pending = []
        connection = .unpaired
    }

    /// Says hello, sends what waits, and tells the views to load again.
    func refresh() async {
        guard let client else { return }
        if case .online = connection {} else { connection = .connecting }
        do {
            let hello: Hello = try await client.call("hello", Empty())
            connection = .online(vault: hello.vault)
            await flush()
            lastSync = Date()
        } catch {
            connection = .offline(reason: error.localizedDescription)
        }
    }

    // MARK: Reading – fresh when online, else the last state

    /// Loads `method` (cached under `key`); returns the answer and whether it is the stored one.
    func load<P: Encodable & Sendable, R: Decodable & Sendable>(_ method: String, _ params: P, key: String, as type: R.Type) async -> (value: R?, cached: Bool) {
        if let client {
            do {
                let data = try await client.raw(method, params)
                let reply = try JSONDecoder().decode(SyncReply<R>.self, from: data)
                if reply.ok, let value = reply.r {
                    store.save(data, for: key)
                    if case .online = connection {} else { await refresh() }
                    return (value, false)
                }
            } catch {
                connection = .offline(reason: error.localizedDescription)
            }
        }
        guard let data = store.load(key) else { return (nil, true) }
        return ((try? JSONDecoder().decode(SyncReply<R>.self, from: data))?.r, true)
    }

    // MARK: Writing – sent now, or queued while the Mac is away

    func send<P: Encodable & Sendable>(_ method: String, _ params: P, label: String) async {
        let item = OfflineStore.Pending(id: UUID(), method: method, params: (try? JSONEncoder().encode(params)) ?? Data("{}".utf8), created: Date(), label: label)
        pending.append(item)
        store.setPending(pending)
        await flush()
    }

    /// Sends the waiting changes in order; stops at the first one the Mac cannot take.
    func flush() async {
        guard let client else { return }
        while let item = pending.first(where: { $0.error == nil }) {
            do {
                let data = try await client.raw(item.method, RawJSON(data: item.params))
                let reply = try JSONDecoder().decode(SyncReply<JSONValue>.self, from: data)
                if reply.ok {
                    pending.removeAll { $0.id == item.id }
                } else if let index = pending.firstIndex(where: { $0.id == item.id }) {
                    // E.g. a conflict: kept and shown – never overwritten silently.
                    pending[index].error = reply.e ?? "Fehler"
                }
                store.setPending(pending)
            } catch {
                connection = .offline(reason: error.localizedDescription)
                return
            }
        }
    }

    /// The params of the changes still waiting for `method` – views lay them over the last state,
    /// so what was done offline stays visible after a reload.
    func waiting<P: Decodable>(_ method: String, as type: P.Type) -> [P] {
        pending.filter { $0.method == method && $0.error == nil }
            .compactMap { try? JSONDecoder().decode(P.self, from: $0.params) }
    }

    func discard(_ item: OfflineStore.Pending) {
        pending.removeAll { $0.id == item.id }
        store.setPending(pending)
    }
}

struct Empty: Codable, Sendable {}

/// Params stored as JSON, sent as they are.
struct RawJSON: Encodable, Sendable {
    let data: Data
    func encode(to encoder: Encoder) throws {
        let value = try JSONDecoder().decode(JSONValue.self, from: data)
        try value.encode(to: encoder)
    }
}

/// Any JSON value (for params kept in the queue).
enum JSONValue: Codable, Sendable, Equatable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case let .string(v): try c.encode(v)
        case let .number(v): try c.encode(v)
        case let .bool(v): try c.encode(v)
        case let .object(v): try c.encode(v)
        case let .array(v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
}
