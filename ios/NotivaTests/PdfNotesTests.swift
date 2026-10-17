import CoreGraphics
import Foundation
import Testing
@testable import Notiva

struct PdfNotesTests {
    private let highlight = PdfAnnotation(id: "a1", type: .highlight, page: 1, color: "green", rects: [[60, 107, 290, 22]], text: "B-Baum")

    @Test func changesAreLaidOverTheStateLikeOnTheMac() {
        let state = PdfNotes(pdf: "x.pdf", annotations: [highlight], notes: ["2": "Alt"])
        var commented = highlight
        commented.comment = "Klausur"
        let added = PdfAnnotation(id: "a2", type: .note, page: 3, color: "yellow", text: "?", x: 10, y: 10)
        let next = state
            .applying(PdfNotesChange(pdf: "x.pdf", add: [added], update: [commented], notes: [.init(page: 2, text: "", base: "Alt"), .init(page: 4, text: "Neu", base: "")]))
        #expect(next.annotations.map(\.id) == ["a1", "a2"])
        #expect(next.annotations[0].comment == "Klausur")
        #expect(next.notes == ["4": "Neu"])
        #expect(next.applying(PdfNotesChange(pdf: "x.pdf", remove: ["a1"])).annotations.map(\.id) == ["a2"])
    }

    @Test func notivaRectsMatchPDFKitsBottomLeftOrigin() {
        let crop = CGRect(x: 0, y: 0, width: 612, height: 792)
        let onPage = PdfGeometry.toPage([60, 107, 290, 22], crop: crop)
        #expect(onPage == CGRect(x: 60, y: 792 - 107 - 22, width: 290, height: 22))
        #expect(PdfGeometry.toNotiva(onPage, crop: crop) == [60, 107, 290, 22])
    }

    @Test func readsWhatTheMacSends() throws {
        let json = #"{"pdf":"x.pdf","annotations":[{"id":"k1","type":"ink","page":1,"color":"red","width":2,"points":[[1,2],[3.5,4]]},{"id":"t1","type":"text","page":2,"color":"blue","x":5,"y":6,"w":200,"size":14,"text":"Hi"}],"notes":{"1":"Notiz"},"mtime":null}"#
        let notes = try JSONDecoder().decode(PdfNotes.self, from: Data(json.utf8))
        #expect(notes.annotations.count == 2 && notes.annotations[0].points?[1] == [3.5, 4])
        #expect(notes.annotations[1].size == 14 && notes.note(1) == "Notiz")
    }
}
