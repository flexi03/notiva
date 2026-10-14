import { renderMarkdown, toPlainText } from '../markdown'

const html = (md: string) =>
  renderMarkdown(md, { resolveLink: (t) => (t === 'Analysis' ? 'Studium/Analysis.md' : null) })

describe('renderMarkdown – features', () => {
  it('renders wiki links and marks missing targets', () => {
    const out = html('[[Analysis]] und [[Fehlt|fehlende Seite]]')
    expect(out).toContain('class="wikilink" href="#/p/Studium%2FAnalysis.md"')
    expect(out).toContain('wikilink-missing')
    expect(out).toContain('>fehlende Seite</a>')
  })

  it('renders ==highlights== as mark', () => {
    expect(html('ein ==wichtiger **Satz**== hier')).toContain('<mark>wichtiger <strong>Satz</strong></mark>')
  })

  it('renders tags', () => {
    expect(html('Lernen #Klausur')).toContain('data-tag="klausur"')
  })

  it('renders task lists with indexed checkboxes', () => {
    const out = html('- [ ] eins\n- [x] zwei')
    expect(out).toContain('data-task-index="0"')
    expect(out).toMatch(/data-task-index="1"[^>]*checked|checked[^>]*data-task-index="1"/)
  })

  it('renders callouts with title', () => {
    const out = html('> [!warning] Achtung\n> Abgabe Freitag')
    expect(out).toContain('callout-warning')
    expect(out).toContain('Achtung')
    expect(out).toContain('Abgabe Freitag')
    expect(out).not.toContain('[!warning]')
  })

  it('maps callout aliases', () => {
    expect(html('> [!todo]\n> x')).toContain('callout-info')
  })

  it('renders inline and display math with KaTeX', () => {
    expect(html('Formel $a^2$ hier')).toContain('katex')
    expect(html('$$\n\\int_0^1 x\\,dx\n$$')).toContain('math-block')
  })

  it('does not treat prices as math', () => {
    expect(html('Kostet $5 und $10')).not.toContain('katex')
  })

  it('highlights code', () => {
    expect(html('```ts\nconst x = 1\n```')).toContain('hljs-keyword')
  })

  it('renders notiva widgets as placeholders', () => {
    expect(html('```notiva\ntype: tiles\n```')).toContain('data-widget')
  })

  it('opens external links in a new tab safely', () => {
    expect(html('[x](https://example.com)')).toContain('rel="noopener noreferrer"')
  })

  it('wraps tables for horizontal scrolling', () => {
    expect(html('| a | b |\n| - | - |\n| 1 | 2 |')).toContain('table-wrap')
  })
})

/** Returns every dangerous construct found in rendered HTML (checked on the DOM, not on text). */
function findDangers(markup: string): string[] {
  const root = document.createElement('div')
  root.innerHTML = markup
  const dangers: string[] = []
  for (const el of root.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase()
    if (['script', 'iframe', 'object', 'embed', 'style', 'form', 'base', 'meta', 'link'].includes(tag))
      dangers.push(`<${tag}>`)
    if (tag === 'input' && el.getAttribute('type') !== 'checkbox') dangers.push('input')
    for (const attr of el.attributes) {
      if (attr.name.startsWith('on')) dangers.push(attr.name)
      if (
        ['href', 'src', 'xlink:href', 'action'].includes(attr.name) &&
        /^\s*(javascript|vbscript|data:text)/i.test(attr.value)
      ) {
        dangers.push(`${attr.name}=${attr.value}`)
      }
    }
  }
  return dangers
}

describe('security: renderMarkdown sanitizes untrusted Markdown', () => {
  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '[klick](javascript:alert(1))',
    '[klick](JaVaScRiPt:alert(1))',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<style>body{display:none}</style>',
    '<form action="https://evil.example"><input type="password"></form>',
    '<div onclick="alert(1)">x</div>',
    '<object data="evil.swf"></object>',
    '<base href="https://evil.example/">',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '[[x" onmouseover="alert(1)]]',
    '[[x|<img src=x onerror=alert(1)>]]',
    '#tag"><img src=x onerror=alert(1)>',
    '$\\href{javascript:alert(1)}{x}$',
    '> [!note] <img src=x onerror=alert(1)>',
    '<details open ontoggle="alert(1)"><summary>x</summary></details>',
  ])('neutralizes %j', (input) => {
    expect(findDangers(html(input))).toEqual([])
  })

  it('keeps harmless HTML like details/summary', () => {
    expect(html('<details><summary>Mehr</summary>Inhalt</details>')).toContain('<details>')
  })
})

describe('toPlainText', () => {
  it('strips Markdown syntax', () => {
    expect(toPlainText('# Titel\n\n- [ ] **fett** [[Seite|Label]] [link](http://x)\n```\ncode\n```')).toBe(
      'Titel fett Label link',
    )
  })
})
