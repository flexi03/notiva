import { clock, lecturePagePath, renderTranscript, setTranscriptSection } from '../lecture/transcript'

describe('lecture transcript', () => {
  it('groups by slide and merges sentences of one speaker', () => {
    const md = renderTranscript([
      { page: 1, start: 5, end: 9, text: 'Guten Morgen.', speaker: 'A' },
      { page: 1, start: 10, end: 14, text: 'Heute: Graphen.', speaker: 'A' },
      { page: 2, start: 70, end: 75, text: 'Die Breitensuche …', speaker: 'A' },
      { page: 2, start: 76, end: 79, text: 'Ist das klausurrelevant?', speaker: 'B' },
      { page: 2, start: 80, end: 84, text: 'Ja.', speaker: 'A' },
    ])
    expect(md).toBe(
      [
        '### Folie 1',
        '',
        '**[00:05] Sprecher A:** Guten Morgen. Heute: Graphen.',
        '',
        '### Folie 2',
        '',
        '**[01:10] Sprecher A:** Die Breitensuche …',
        '',
        '**[01:16] Sprecher B:** Ist das klausurrelevant?',
        '',
        '**[01:20] Sprecher A:** Ja.',
      ].join('\n'),
    )
    expect(renderTranscript([{ page: 3, start: 3700, end: 3705, text: 'Ohne Sprecher' }])).toBe(
      '### Folie 3\n\n**[1:01:40]** Ohne Sprecher',
    )
    expect(clock(65)).toBe('01:05')
  })

  it('only rewrites the transcript section', () => {
    const body =
      'Intro\n\n## Zusammenfassung\n\nWichtig!\n\n## Transkript\n\nalt\n\n## Eigene Notizen\n\nmeins\n'
    expect(setTranscriptSection(body, 'neu')).toBe(
      'Intro\n\n## Zusammenfassung\n\nWichtig!\n\n## Transkript\n\nneu\n\n## Eigene Notizen\n\nmeins\n',
    )
    expect(setTranscriptSection('Intro', 'neu')).toBe('Intro\n\n## Transkript\n\nneu\n')
  })

  it('names the page after slides and date', () => {
    expect(lecturePagePath('Studium/Unterlagen/LA/vl03.pdf', '2026-10-14')).toBe(
      'Studium/Unterlagen/LA/vl03 – Mitschrift 2026-10-14.md',
    )
  })
})
