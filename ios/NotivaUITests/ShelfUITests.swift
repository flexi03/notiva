import XCTest

/// The shelf against the stand-in Mac – and without a Mac (the change waits).
final class ShelfUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launch(_ code: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", code]
        app.launch()
        app.buttons["Ablage"].firstMatch.tap()
        return app
    }

    private func putText(_ app: XCUIApplication, _ text: String) {
        app.buttons["shelf-text.alignleft"].tap()
        let editor = app.textViews["shelf-text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.typeText(text)
        app.buttons["shelf-put"].tap()
    }

    func testPutsATextOnTheMac() {
        let app = launch(TodayUITests.code)
        XCTAssertTrue(app.buttons["shelf-photos"].waitForExistence(timeout: 15))
        putText(app, "Raum 5.E.001 statt H3")
        let sent = app.descendants(matching: .any).matching(identifier: "shelf-sent").firstMatch
        XCTAssertTrue(sent.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Raum 5.E.001 statt H3"].exists)
        attach(app, "05-ablage")
    }

    func testWaitsWithoutTheMac() {
        let offline = #"{"v":1,"id":"d","key":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=","port":9,"hosts":["127.0.0.1"],"name":"Studium"}"#
        let app = launch(offline)
        XCTAssertTrue(app.buttons["shelf-photos"].waitForExistence(timeout: 15))
        putText(app, "Später übertragen")
        XCTAssertTrue(app.staticTexts["Wartet auf den Mac"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "shelf-waiting").firstMatch.exists)
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
