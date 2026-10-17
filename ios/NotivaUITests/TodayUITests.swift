import XCTest

/// Against the real sync server with a made-up semester (ios/scripts/fake-mac.ts, port 47999).
/// The screenshots are also the App Store's (ios/scripts/screenshots.sh).
final class TodayUITests: XCTestCase {
    static let code = #"{"v":1,"id":"uitest-device","key":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=","port":47999,"hosts":[\#(FakeMac.hosts)],"name":"Studium"}"#

    override func setUp() { continueAfterFailure = false }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", Self.code]
        app.launch()
        return app
    }

    func testTodayShowsTheDayAndTicksStudyTopics() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["Datenbanksysteme 2"].firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["IT-Sicherheit"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Lernen heute'")).firstMatch.exists)
        let topic = app.buttons["DBS2 - Vorlesung 06 - Anfrageoptimierung"]
        XCTAssertTrue(topic.waitForExistence(timeout: 5))
        attach(app, "01-heute")
        // Ticks at once (whatever it was before – the stand-in Mac keeps it between runs).
        let before = topic.value as? String
        topic.tap()
        let after = app.buttons["DBS2 - Vorlesung 06 - Anfrageoptimierung"].value as? String
        XCTAssertNotEqual(before, after)
        XCTAssertTrue(["offen", "gelernt"].contains(after ?? ""))
        // Demnächst: the exam in 12 days.
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Klausur Mathematik 3"].waitForExistence(timeout: 5))
    }

    func testWeekShowsTheTimetable() {
        let app = launch()
        app.buttons["Stundenplan"].firstMatch.tap()
        let found = app.staticTexts["Software Engineering"].firstMatch.waitForExistence(timeout: 15)
        attach(app, "02-stundenplan")
        XCTAssertTrue(found)
        // Later in the week: lists create rows when they scroll into view.
        let thursday = app.staticTexts["Digitale Bild- und Tontechnik"].firstMatch
        for _ in 0..<4 where !thursday.exists { app.swipeUp() }
        XCTAssertTrue(thursday.exists)
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
