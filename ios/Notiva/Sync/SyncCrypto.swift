import CryptoKit
import Foundation

/// The same sealing as the Mac (electron/companion.ts): AES-256-GCM, the additional data binds a
/// message to the device, the direction and the request time. The key never leaves the device.
enum SyncCrypto {
    static let protocolName = "notiva/v1"

    enum Direction: String, Sendable {
        case request = "req"
        case response = "res"
    }

    static func additionalData(_ direction: Direction, device: String, time: Int64) -> Data {
        Data("\(protocolName)|\(direction.rawValue)|\(device)|\(time)".utf8)
    }

    /// Nonce and ciphertext + tag, both base64 – as the Mac expects them.
    struct Sealed: Codable, Sendable, Equatable {
        let n: String
        let c: String
    }

    static func seal(_ plaintext: Data, key: SymmetricKey, additionalData: Data, nonce: AES.GCM.Nonce = AES.GCM.Nonce()) throws -> Sealed {
        let box = try AES.GCM.seal(plaintext, using: key, nonce: nonce, authenticating: additionalData)
        return Sealed(
            n: Data(box.nonce).base64EncodedString(),
            c: (box.ciphertext + box.tag).base64EncodedString()
        )
    }

    /// nil when key, additional data or content do not match.
    static func open(_ sealed: Sealed, key: SymmetricKey, additionalData: Data) -> Data? {
        guard
            let nonceData = Data(base64Encoded: sealed.n), nonceData.count == 12,
            let body = Data(base64Encoded: sealed.c), body.count >= 16,
            let nonce = try? AES.GCM.Nonce(data: nonceData),
            let box = try? AES.GCM.SealedBox(nonce: nonce, ciphertext: body.prefix(body.count - 16), tag: body.suffix(16))
        else { return nil }
        return try? AES.GCM.open(box, using: key, authenticating: additionalData)
    }
}
