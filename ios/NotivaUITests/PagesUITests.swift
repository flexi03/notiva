import XCTest

/// Pages against the stand-in Mac: browse, search, follow a wiki link, edit – and a conflict.
final class PagesUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", TodayUITests.code]
        app.launch()
        app.buttons["Seiten"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Zuletzt geändert"].firstMatch.waitForExistence(timeout: 15))
        return app
    }

    private func search(_ app: XCUIApplication, _ text: String) {
        let field = app.searchFields.firstMatch
        // iPad: behind a "Suchen" button in the bar; iPhone: below the title (pull down if hidden).
        if !field.waitForExistence(timeout: 3) {
            let button = app.buttons["Suchen"].firstMatch
            if button.exists { button.tap() } else { app.swipeDown() }
        }
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(text)
    }

    /// The editor gets the focus on opening; tapped once more if a device is slow with it.
    private func type(_ app: XCUIApplication, _ text: String) {
        let editor = app.textViews["page-editor"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let focused = { (editor.value(forKey: "hasKeyboardFocus") as? Bool) ?? false }
        let end = Date().addingTimeInterval(3)
        while !focused(), Date() < end { RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
        if !focused() { editor.tap() }
        editor.typeText(text)
    }

    private func webText(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.webViews.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    func testBrowsesFoldersAndFollowsWikiLinks() {
        let app = launch()
        XCTAssertTrue(app.buttons["Studium"].firstMatch.exists)
        attach(app, "06-seiten")
        app.buttons["Studium"].firstMatch.tap()
        app.buttons["Module"].firstMatch.tap()
        app.buttons["page-Datenbanksysteme 2"].firstMatch.tap()
        // Properties on top (the user's, not Notiva's hidden ones), then the page.
        XCTAssertTrue(webText(app, "B-Bäume").waitForExistence(timeout: 10))
        XCTAssertTrue(webText(app, "Laufend").exists)
        XCTAssertFalse(webText(app, "hidden").exists)
        attach(app, "07-seite")
        app.webViews.links["Vorlesung 05 – Indexstrukturen"].firstMatch.tap()
        XCTAssertTrue(webText(app, "B+-Baum").waitForExistence(timeout: 10))
    }

    func testEditsAPage() {
        let app = launch()
        search(app, "Mathe")
        app.buttons["page-Mathematik 3"].firstMatch.tap()
        XCTAssertTrue(webText(app, "Fourier").waitForExistence(timeout: 10))
        app.buttons["edit-page"].tap()
        type(app, " Neu vom iPhone.")
        app.buttons["save-page"].tap()
        XCTAssertTrue(webText(app, "Neu vom iPhone").waitForExistence(timeout: 10))
    }

    func testAConflictKeepsBothVersions() {
        let app = launch()
        search(app, "Gruppen")
        app.buttons["page-Gruppenarbeit"].firstMatch.tap()
        XCTAssertTrue(webText(app, "gerade am Mac offen").waitForExistence(timeout: 10))
        app.buttons["edit-page"].tap()
        type(app, " Ich mache die Folien.")
        app.buttons["save-page"].tap()
        // Changed on the Mac meanwhile: a hint, nothing overwritten.
        let keep = app.buttons["keep-copy"]
        XCTAssertTrue(keep.waitForExistence(timeout: 10))
        attach(app, "08-konflikt")
        keep.tap()
        XCTAssertTrue(keep.waitForNonExistence(timeout: 10))
        let back = app.buttons["BackButton"].firstMatch
        if back.exists { back.tap() } else { app.navigationBars.buttons.element(boundBy: 0).tap() }
        // Back in the search for "Gruppen": the copy is there, next to the page.
        XCTAssertTrue(app.buttons["page-Gruppenarbeit (iPhone)"].firstMatch.waitForExistence(timeout: 10))
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
