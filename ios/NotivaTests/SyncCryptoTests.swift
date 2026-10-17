import CryptoKit
import Foundation
import Testing
@testable import Notiva

/// The iPhone seals exactly like the Mac (electron/companion.ts): a vector made with Node.
struct SyncCryptoTests {
    struct Vector: Decodable { let key, nonce, aad, c, plain: String }

    private func vector() throws -> Vector {
        let url = try #require(Bundle(for: Marker.self).url(forResource: "vector", withExtension: "json"))
        return try JSONDecoder().decode(Vector.self, from: Data(contentsOf: url))
    }

    @Test func opensWhatNodeSealed() throws {
        let v = try vector()
        let key = SymmetricKey(data: try #require(Data(base64Encoded: v.key)))
        let opened = SyncCrypto.open(.init(n: v.nonce, c: v.c), key: key, additionalData: Data(v.aad.utf8))
        #expect(opened.map { String(decoding: $0, as: UTF8.self) } == v.plain)
    }

    @Test func sealsLikeNode() throws {
        let v = try vector()
        let key = SymmetricKey(data: try #require(Data(base64Encoded: v.key)))
        let nonce = try AES.GCM.Nonce(data: try #require(Data(base64Encoded: v.nonce)))
        let sealed = try SyncCrypto.seal(Data(v.plain.utf8), key: key, additionalData: Data(v.aad.utf8), nonce: nonce)
        #expect(sealed.c == v.c)
    }

    @Test func refusesOtherKeyOrData() throws {
        let v = try vector()
        let key = SymmetricKey(data: try #require(Data(base64Encoded: v.key)))
        #expect(SyncCrypto.open(.init(n: v.nonce, c: v.c), key: SymmetricKey(size: .bits256), additionalData: Data(v.aad.utf8)) == nil)
        #expect(SyncCrypto.open(.init(n: v.nonce, c: v.c), key: key, additionalData: Data("notiva/v1|res|x|1".utf8)) == nil)
    }

    @Test func additionalDataMatchesTheMac() {
        #expect(String(decoding: SyncCrypto.additionalData(.request, device: "device-1", time: 1_760_000_000_000), as: UTF8.self)
            == "notiva/v1|req|device-1|1760000000000")
    }

    @Test func parsesOnlyNotivaPairingCodes() throws {
        let code = #"{"v":1,"id":"d","key":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=","port":47812,"hosts":["192.168.1.2"],"name":"Studium"}"#
        let pairing = try #require(Pairing.parse(code))
        #expect(pairing.name == "Studium" && pairing.hosts == ["192.168.1.2"])
        #expect(Pairing.parse("https://example.org") == nil)
        #expect(Pairing.parse(#"{"v":1,"id":"d","key":"kurz","port":1,"hosts":[],"name":"x"}"#) == nil)
    }
}

private final class Marker {}
