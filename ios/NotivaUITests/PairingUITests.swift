import XCTest

/// Without a Mac: the pairing screen, a wrong code, and the app's sections after a (valid but
/// unreachable) pairing – shown as "last state" with the reason.
final class PairingUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testWrongCodeIsExplained() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", ""]
        app.launch()
        XCTAssertTrue(app.staticTexts["Mit deinem Mac koppeln"].waitForExistence(timeout: 5))
        app.buttons["Code einfügen"].tap()
        let field = app.textFields["pairing-code"]
        field.tap()
        field.typeText("kein code")
        app.buttons["pair-button"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'kein Notiva-Code'")).firstMatch.waitForExistence(timeout: 5))
        attach(app, "Koppeln")
    }

    func testPairedAppShowsSectionsAndOfflineState() {
        let app = XCUIApplication()
        let code = #"{"v":1,"id":"d","key":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=","port":9,"hosts":[\#(FakeMac.hosts)],"name":"Studium"}"#
        app.launchArguments = ["-uitest", code]
        app.launch()
        XCTAssertTrue(app.otherElements["offline-banner"].waitForExistence(timeout: 20) || app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'nicht erreichbar'")).firstMatch.waitForExistence(timeout: 5))
        for name in ["Heute", "Stundenplan", "Aufgaben", "Ablage", "Seiten"] {
            XCTAssertTrue(app.buttons[name].firstMatch.exists || app.staticTexts[name].firstMatch.exists, name)
        }
        attach(app, "Heute offline")
    }

    /// Against the real sync server (ios/scripts/fake-mac.ts on port 47999): connected.
    func testConnectsToTheMac() throws {
        let app = XCUIApplication()
        let code = #"{"v":1,"id":"uitest-device","key":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=","port":47999,"hosts":[\#(FakeMac.hosts)],"name":"Studium"}"#
        app.launchArguments = ["-uitest", code]
        app.launch()
        app.buttons["Einstellungen"].firstMatch.tap()
        let status = app.descendants(matching: .any)["connection-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        let deadline = Date().addingTimeInterval(15)
        while !status.label.contains("Verbunden mit"), Date() < deadline { Thread.sleep(forTimeInterval: 0.5) }
        XCTAssertTrue(status.label.contains("Verbunden mit „Studium“"), status.label)
        attach(app, "Verbunden")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
