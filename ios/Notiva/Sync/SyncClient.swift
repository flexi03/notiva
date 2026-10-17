import CryptoKit
import Foundation
import Network

/// Talks to the Notiva app on the Mac (protocol v1, docs/COMPANION.md): every request sealed with
/// the device's key, tried on the addresses from the QR code (the last one that worked first) and,
/// if none answers, on what Bonjour finds on the Wi-Fi.
actor SyncClient {
    enum SyncError: LocalizedError, Equatable {
        case notReachable
        case refused
        case server(message: String, code: String?)
        case invalid

        var errorDescription: String? {
            switch self {
            case .notReachable: String(localized: "Mac nicht erreichbar – ist Notiva dort geöffnet und im selben WLAN (oder Tailscale an)?")
            case .refused: String(localized: "Der Mac kennt dieses Gerät nicht mehr – bitte neu koppeln.")
            case let .server(message, _): message
            case .invalid: String(localized: "Unerwartete Antwort vom Mac.")
            }
        }

        var code: String? {
            if case let .server(_, code) = self { return code }
            return nil
        }
    }

    private var pairing: Pairing
    private let session: URLSession
    /// The address that answered last – tried first next time.
    private var preferred: String?

    init(pairing: Pairing) {
        self.pairing = pairing
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 6
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    private struct Envelope: Encodable {
        let d: String
        let t: Int64
        let n: String
        let c: String
    }

    private struct Request<P: Encodable>: Encodable {
        let m: String
        let p: P
    }

    /// One request; `R` is what the method answers.
    func call<P: Encodable & Sendable, R: Decodable & Sendable>(_ method: String, _ params: P, as _: R.Type = R.self) async throws -> R {
        let data = try await raw(method, params)
        let reply = try JSONDecoder().decode(SyncReply<R>.self, from: data)
        guard reply.ok else { throw SyncError.server(message: reply.e ?? "Fehler", code: reply.code) }
        guard let result = reply.r else { throw SyncError.invalid }
        return result
    }

    /// The decrypted answer as it came (for the offline cache).
    func raw<P: Encodable & Sendable>(_ method: String, _ params: P) async throws -> Data {
        guard let key = pairing.symmetricKey else { throw SyncError.refused }
        let time = Int64(Date().timeIntervalSince1970 * 1000)
        let plain = try JSONEncoder().encode(Request(m: method, p: params))
        let sealed = try SyncCrypto.seal(plain, key: key, additionalData: SyncCrypto.additionalData(.request, device: pairing.id, time: time))
        let body = try JSONEncoder().encode(Envelope(d: pairing.id, t: time, n: sealed.n, c: sealed.c))
        var refused = false
        for host in await candidates() {
            guard let url = URL(string: "http://\(host)/v1") else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            guard let (data, response) = try? await session.data(for: request),
                  let http = response as? HTTPURLResponse
            else { continue }
            // A 404 from the paired Mac's address: it answered, but no longer knows this key. (From
            // a Mac found by Bonjour it may simply be another Mac on the same Wi-Fi.)
            if http.statusCode == 404 {
                if pairing.hosts.contains(where: { host.hasPrefix("\($0):") }) { refused = true }
                continue
            }
            guard http.statusCode == 200,
                  let answer = try? JSONDecoder().decode(SyncCrypto.Sealed.self, from: data),
                  let opened = SyncCrypto.open(answer, key: key, additionalData: SyncCrypto.additionalData(.response, device: pairing.id, time: time))
            else { continue }
            preferred = host
            return opened
        }
        throw refused ? SyncError.refused : SyncError.notReachable
    }

    /// host:port in the order to try: the last good one, the QR code's, then Bonjour.
    private func candidates() async -> [String] {
        var list = pairing.hosts.map { "\($0):\(pairing.port)" }
        if let preferred { list.removeAll { $0 == preferred }; list.insert(preferred, at: 0) }
        if preferred == nil {
            for found in await BonjourFinder.find() where !list.contains(found) { list.append(found) }
        }
        return list
    }
}

/// Finds Notiva on the Wi-Fi (`_notiva._tcp`, published by the Mac with dns-sd) – in case its
/// address changed since pairing.
enum BonjourFinder {
    static func find(timeout: TimeInterval = 2) async -> [String] {
        await withCheckedContinuation { continuation in
            let browser = NWBrowser(for: .bonjour(type: "_notiva._tcp", domain: nil), using: .tcp)
            let box = ResultBox()
            browser.browseResultsChangedHandler = { results, _ in
                for result in results {
                    let connection = NWConnection(to: result.endpoint, using: .tcp)
                    box.keep(connection)
                    connection.stateUpdateHandler = { state in
                        if case .ready = state, case let .hostPort(host, port) = connection.currentPath?.remoteEndpoint {
                            box.add("\(host)".split(separator: "%").first.map(String.init).map { "\($0):\(port)" })
                            connection.cancel()
                        }
                    }
                    connection.start(queue: .global())
                }
            }
            browser.start(queue: .global())
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                browser.cancel()
                box.cancelAll()
                continuation.resume(returning: box.values)
            }
        }
    }

    private final class ResultBox: @unchecked Sendable {
        private let lock = NSLock()
        private var list: [String] = []
        /// Connections resolving a service – kept alive until the search ends.
        private var connections: [NWConnection] = []
        func keep(_ connection: NWConnection) {
            lock.lock(); defer { lock.unlock() }
            connections.append(connection)
        }
        func cancelAll() {
            lock.lock(); defer { lock.unlock() }
            connections.forEach { $0.cancel() }
            connections = []
        }
        func add(_ value: String?) {
            guard let value else { return }
            lock.lock(); defer { lock.unlock() }
            if !list.contains(value) { list.append(value) }
        }
        var values: [String] {
            lock.lock(); defer { lock.unlock() }
            return list
        }
    }
}

/// What the Mac answers (decrypted): the result or the error with its code (e.g. "conflict").
struct SyncReply<R: Decodable>: Decodable {
    let ok: Bool
    let r: R?
    let e: String?
    let code: String?
}
