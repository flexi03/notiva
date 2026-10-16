import { maybeRepo } from '@/app/repoDetect'

describe('asking the local model about links', () => {
  it('only for links that hint at code', () => {
    expect(maybeRepo('https://code.example.org/lab/aufgabe-1', 'Praktikumsaufgaben')).toBe(true)
    expect(maybeRepo('https://example.org/x', 'Repository mit Praktikumsaufgaben')).toBe(true)
    expect(maybeRepo('https://hsd.cloud.panopto.eu/Panopto/Pages/Viewer.aspx?id=1', 'Video Praktikum')).toBe(
      false,
    )
    expect(maybeRepo('https://magentacloud.de/s/abc', 'Code')).toBe(false)
    expect(maybeRepo('https://example.org/skript.pdf', 'Projekt')).toBe(false)
    expect(maybeRepo('https://html.spec.whatwg.org/multipage/', 'HTML5 Spec')).toBe(false)
  })
})
