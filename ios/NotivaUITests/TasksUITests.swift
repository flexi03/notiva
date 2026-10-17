import XCTest

/// The tasks against the stand-in Mac: grouped by due date, tick off, create.
final class TasksUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", TodayUITests.code]
        app.launch()
        app.buttons["Aufgaben"].firstMatch.tap()
        return app
    }

    /// One test: the screenshot first, before anything is created on the stand-in Mac.
    func testGroupsTicksAndCreates() {
        let app = launch()
        XCTAssertTrue(app.buttons["task-Übungsblatt 6"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Überfällig"].exists)
        XCTAssertTrue(app.staticTexts["Morgen"].exists)
        attach(app, "03-aufgaben")

        // Ticked: stays in place, struck through – and back again.
        app.buttons["task-Übungsblatt 6"].tap()
        XCTAssertEqual(app.buttons["task-Übungsblatt 6"].value as? String, "erledigt")
        app.buttons["task-Übungsblatt 6"].tap()
        XCTAssertEqual(app.buttons["task-Übungsblatt 6"].value as? String, "offen")

        app.buttons["new-task"].tap()
        let title = app.textFields["task-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.typeText("Folien nacharbeiten")
        attach(app, "04-neue-aufgabe")
        app.buttons["add-task"].tap()
        let created = app.buttons["task-Folien nacharbeiten"]
        XCTAssertTrue(created.waitForExistence(timeout: 10))
        // On the Mac now (not "wird übertragen" any more): it can be ticked.
        let end = Date().addingTimeInterval(10)
        while created.value as? String != "offen", Date() < end { RunLoop.current.run(until: Date().addingTimeInterval(0.3)) }
        XCTAssertEqual(created.value as? String, "offen")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
