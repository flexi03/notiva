import XCTest

/// A PDF against the stand-in Mac: loaded in pieces, the Mac's highlight shown and commented,
/// text marked, a page note written.
final class PdfUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func open() -> (XCUIApplication, XCUIElement) {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", TodayUITests.code]
        app.launch()
        app.buttons["Seiten"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Zuletzt geändert"].firstMatch.waitForExistence(timeout: 15))
        app.buttons["Studium"].firstMatch.tap()
        app.buttons["Unterlagen"].firstMatch.tap()
        app.buttons["pdf-DBS2 - Vorlesung 05 - Indexstrukturen"].firstMatch.tap()
        let pdf = app.descendants(matching: .any)["pdf-view"].firstMatch
        XCTAssertTrue(pdf.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Seite 1 / 2"].waitForExistence(timeout: 5))
        return (app, pdf)
    }

    /// A point on page 1 in PDF points (origin top left), as on screen – the page fits the width.
    private func point(_ pdf: XCUIElement, x: Double, y: Double) -> XCUICoordinate {
        let scale = pdf.frame.width / 612
        return pdf.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x * scale, dy: y * scale))
    }

    func testShowsAndCommentsTheMacsHighlight() {
        let (app, pdf) = open()
        // The highlight from the Mac (page 1, "B-Baeume …").
        var sheet = false
        for dy in [0.0, 6, 12, -6] where !sheet {
            point(pdf, x: 150, y: 118 + dy).tap()
            sheet = app.textFields["annotation-comment"].waitForExistence(timeout: 2)
        }
        XCTAssertTrue(sheet)
        XCTAssertEqual(app.textFields["annotation-comment"].value as? String, "Klausur!")
        app.textFields["annotation-comment"].tap()
        app.textFields["annotation-comment"].typeText(" Beispiel rechnen")
        app.buttons["save-annotation"].tap()
        app.buttons["Alle Notizen"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Beispiel rechnen'")).firstMatch.waitForExistence(timeout: 5))
        // The Mac's page note on page 2.
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS 'Lineares Hashing'")).firstMatch.exists)
    }

    func testMarksTextAndWritesAPageNote() {
        let (app, pdf) = open()
        // Runs first (alphabetically): the PDF as it comes from the Mac.
        attach(app, "09-pdf")
        // Long press on the third line selects a word → "Markieren".
        let mark = app.buttons["mark"]
        for dy in [0.0, 8, -8, 16] where !mark.isEnabled {
            point(pdf, x: 120, y: 160 + dy).press(forDuration: 1.2)
        }
        XCTAssertTrue(mark.isEnabled)
        mark.tap()

        app.buttons["page-note"].tap()
        let note = app.textViews["page-note-text"]
        XCTAssertTrue(note.waitForExistence(timeout: 5))
        note.typeText("Vom iPhone: Beispiel B-Baum der Ordnung 2")
        app.buttons["save-page-note"].tap()

        app.buttons["Alle Notizen"].firstMatch.tap()
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS 'Vom iPhone'")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Suche' OR label CONTAINS 'Einfuegen' OR label CONTAINS 'Loeschen' OR label CONTAINS 'log'")).firstMatch.exists)
        attach(app, "10-pdf-notizen")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
