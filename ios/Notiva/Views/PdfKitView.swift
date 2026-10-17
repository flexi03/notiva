import PDFKit
import SwiftUI

/// The PDF with Notiva's annotations drawn on it (the file itself stays untouched – they live in
/// the notes page). Reports the page, whether text is selected, and taps on an annotation.
struct PdfKitView: UIViewRepresentable {
    let document: PDFDocument
    let annotations: [PdfAnnotation]
    @Binding var page: Int
    @Binding var selection: PdfSelection?
    /// a page to go to (set from outside, e.g. from the list of notes)
    @Binding var jump: Int?
    let tapped: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.document = document
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.pageShadowsEnabled = true
        view.accessibilityIdentifier = "pdf-view"
        let c = context.coordinator
        NotificationCenter.default.addObserver(c, selector: #selector(Coordinator.pageChanged), name: .PDFViewPageChanged, object: view)
        NotificationCenter.default.addObserver(c, selector: #selector(Coordinator.selectionChanged), name: .PDFViewSelectionChanged, object: view)
        let tap = UITapGestureRecognizer(target: c, action: #selector(Coordinator.tap(_:)))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        c.view = view
        c.draw(annotations)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.drawn != annotations { context.coordinator.draw(annotations) }
        // Marked (or dropped): the selection goes, as in other apps.
        if selection == nil, view.currentSelection != nil { view.clearSelection() }
        if let jump, let target = document.page(at: jump - 1) {
            view.go(to: target)
            DispatchQueue.main.async { self.jump = nil }
        }
    }

    @MainActor
    final class Coordinator: NSObject {
        var parent: PdfKitView
        weak var view: PDFView?
        var drawn: [PdfAnnotation] = []
        private static let tag = "notiva:"

        init(_ parent: PdfKitView) { self.parent = parent }

        @objc func pageChanged() {
            guard let view, let page = view.currentPage, let document = view.document else { return }
            let number = document.index(for: page) + 1
            if parent.page != number { parent.page = number }
        }

        @objc func selectionChanged() {
            guard let view else { return }
            parent.selection = PdfSelection(view.currentSelection)
        }

        @objc func tap(_ gesture: UITapGestureRecognizer) {
            guard let view else { return }
            let point = gesture.location(in: view)
            guard let page = view.page(for: point, nearest: false) else { return }
            let onPage = view.convert(point, to: page)
            guard let hit = page.annotation(at: onPage), let name = hit.userName, name.hasPrefix(Self.tag) else { return }
            parent.tapped(String(name.dropFirst(Self.tag.count)))
        }

        /// Ours replaced, the PDF's own left alone.
        func draw(_ list: [PdfAnnotation]) {
            guard let document = view?.document ?? Optional(parent.document) else { return }
            drawn = list
            for index in 0..<document.pageCount {
                guard let page = document.page(at: index) else { continue }
                for old in page.annotations where old.userName?.hasPrefix(Self.tag) == true { page.removeAnnotation(old) }
            }
            for a in list {
                guard let page = document.page(at: a.page - 1) else { continue }
                for made in Self.make(a, on: page) {
                    made.userName = Self.tag + a.id
                    page.addAnnotation(made)
                }
            }
        }

        static func make(_ a: PdfAnnotation, on page: PDFPage) -> [PDFAnnotation] {
            let crop = page.bounds(for: .cropBox)
            let color = PdfAnnotation.uiColor(a.color)
            switch a.type {
            case .highlight:
                return (a.rects ?? []).compactMap { r in
                    guard r.count == 4 else { return nil }
                    let annotation = PDFAnnotation(bounds: PdfGeometry.toPage(r, crop: crop), forType: .highlight, withProperties: nil)
                    annotation.color = color.withAlphaComponent(0.45)
                    if let comment = a.comment { annotation.contents = comment }
                    return annotation
                }
            case .note:
                let at = PdfGeometry.toPage([a.x ?? 0, a.y ?? 0, 20, 20], crop: crop)
                let annotation = PDFAnnotation(bounds: at, forType: .text, withProperties: nil)
                annotation.color = color
                annotation.contents = a.text
                return [annotation]
            case .text:
                let size = a.size ?? 12
                let lines = max(1, (a.text ?? "").split(separator: "\n", omittingEmptySubsequences: false).count)
                let box = PdfGeometry.toPage([a.x ?? 0, a.y ?? 0, a.w ?? 220, Double(lines) * size * 1.35 + 4], crop: crop)
                let annotation = PDFAnnotation(bounds: box, forType: .freeText, withProperties: nil)
                annotation.contents = a.text
                annotation.font = .systemFont(ofSize: size)
                annotation.fontColor = color.withAlphaComponent(1)
                annotation.color = .clear
                return [annotation]
            case .ink:
                let annotation = PDFAnnotation(bounds: crop, forType: .ink, withProperties: nil)
                let path = UIBezierPath()
                for (i, p) in (a.points ?? []).enumerated() where p.count == 2 {
                    // Ink paths are relative to the annotation's bounds (the whole page here).
                    let point = CGPoint(x: p[0], y: crop.height - p[1])
                    if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
                }
                annotation.add(path)
                let border = PDFBorder()
                border.lineWidth = a.width ?? 2
                annotation.border = border
                annotation.color = color
                return [annotation]
            }
        }
    }
}

/// Selected text in the PDF: on which page, its lines (Notiva rects) and the words.
struct PdfSelection: Equatable {
    let page: Int
    let rects: [[Double]]
    let text: String

    @MainActor
    init?(_ selection: PDFSelection?) {
        guard let selection, let page = selection.pages.first, let document = page.document,
              let text = selection.string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty
        else { return nil }
        let crop = page.bounds(for: .cropBox)
        let rects = selection.selectionsByLine()
            .map { $0.bounds(for: page) }
            .filter { $0.width > 0.5 && $0.height > 0.5 }
            .map { PdfGeometry.toNotiva($0, crop: crop) }
        guard !rects.isEmpty else { return nil }
        self.page = document.index(for: page) + 1
        self.rects = rects
        self.text = String(text.prefix(5000))
    }
}

/// Notiva keeps PDF points with the origin top left (like pdf.js); PDFKit's origin is bottom left.
enum PdfGeometry {
    static func toPage(_ r: [Double], crop: CGRect) -> CGRect {
        CGRect(x: crop.minX + r[0], y: crop.maxY - r[1] - r[3], width: r[2], height: r[3])
    }

    static func toNotiva(_ rect: CGRect, crop: CGRect) -> [Double] {
        let values: [CGFloat] = [rect.minX - crop.minX, crop.maxY - rect.maxY, rect.width, rect.height]
        return values.map { (Double($0) * 10).rounded() / 10 }
    }
}
