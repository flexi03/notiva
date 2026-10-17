import Foundation
import Testing
@testable import Notiva

/// Runs inside the app (with its entitlements): the pairing lands in the group the share
/// extension reads.
struct PairingStoreTests {
    @Test func savesInTheSharedGroupAndLoadsAgain() throws {
        let group = try #require(Bundle.main.object(forInfoDictionaryKey: "NotivaKeychainGroup") as? String)
        #expect(group.hasSuffix(".io.github.flexi03.notiva.shared") && !group.hasPrefix("$"))
        let pairing = try #require(Pairing.parse(#"{"v":1,"id":"t","key":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=","port":1,"hosts":[],"name":"Test"}"#))
        let before = PairingStore.load()
        defer { PairingStore.delete(); if let before { try? PairingStore.save(before) } }
        try PairingStore.save(pairing)
        #expect(PairingStore.load() == pairing)
        PairingStore.delete()
        #expect(PairingStore.load() == nil)
    }
}
