/**
 * What a Moodle course says besides its files: the course description, the text of each section,
 * text blocks ("Textfelder"), pages and announcements. Often that's where dates and organisation
 * live ("Klausur am …", "Praktikum fällt aus"). Kept per course in the snapshot, written into the
 * course's page and compared with the last check for notifications. Pure, runs in both processes
 * (no DOM): HTML is turned into simple Markdown with a small, defensive converter.
 */
import type { AppNotification } from './notifications'

export interface InfoBlock {
  /** Stable key: "summary", "section:12", "label:345", "page:77", "news:9". */
  id: string
  title: string
  text: string
  /** ISO date-time of the last change (if Moodle tells). */
  modified?: string
  url?: string
  /** Forum posts: the forum's name ("Ankündigungen", "Fragen zum Praktikum"). */
  forum?: string
  /** A post about a cancelled / moved lecture or room change. */
  important?: boolean
}

export interface CourseInfo {
  courseId: string
  summary?: InfoBlock
  sections: InfoBlock[]
  pages: InfoBlock[]
  announcements: InfoBlock[]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const time = (v: unknown) => (typeof v === 'number' && v > 0 ? new Date(v * 1000).toISOString() : undefined)

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  euro: '€',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
    }
    return ENTITIES[code] ?? full
  })
}

/**
 * HTML → Markdown for Moodle texts: paragraphs, line breaks, headings, lists, bold/italic, links
 * (http/https/mailto only). Everything else is reduced to its text. Never produces HTML.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  let s = html.slice(0, 200_000)
  s = s.replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/\r?\n/g, ' ')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(
    /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_, _n: string, inner: string) => `\n\n**${inner.trim()}**\n\n`,
  )
  s = s.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
  s = s.replace(/<\/?(p|div|ul|ol|table|tr|section|article|blockquote)\b[^>]*>/gi, '\n\n')
  s = s.replace(/<\/?(td|th)\b[^>]*>/gi, ' ')
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t: string, inner: string) =>
    inner.trim() ? `**${inner.trim()}**` : '',
  )
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t: string, inner: string) =>
    inner.trim() ? `*${inner.trim()}*` : '',
  )
  s = s.replace(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href: string, inner: string) => {
      const url = decodeEntities(href.trim())
      const label = inner.replace(/<[^>]*>/g, '').trim()
      if (!/^(https?:|mailto:)/i.test(url)) return label
      return label && label !== url
        ? `[${label.replace(/[[\]]/g, '')}](${url.replace(/[()\s]/g, encodeURIComponent)})`
        : `<${url}>`
    },
  )
  s = s.replace(/<img\b[^>]*alt\s*=\s*["']([^"']*)["'][^>]*>/gi, (_, alt: string) =>
    alt ? `(Bild: ${alt})` : '',
  )
  s = s.replace(/<[^>]*>/g, '')
  s = decodeEntities(s)
  return s
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t\u00a0]+/g, ' ')
        .trimEnd()
        .replace(/^ (?!-)/, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The info of one course from the web service answers (all untrusted): course entry (summary),
 * core_course_get_contents, pages (mod_page_get_pages_by_courses) and announcement discussions.
 */
export function courseInfoOf(
  courseId: string,
  raw: { course?: unknown; contents?: unknown; pages?: unknown; discussions?: unknown },
): CourseInfo {
  const info: CourseInfo = { courseId, sections: [], pages: [], announcements: [] }
  const course = isObject(raw.course) ? raw.course : {}
  const summary = htmlToMarkdown(str(course.summary))
  if (summary) info.summary = { id: 'summary', title: 'Beschreibung', text: summary.slice(0, 20_000) }
  for (const section of (Array.isArray(raw.contents) ? raw.contents : []).filter(isObject).slice(0, 80)) {
    const parts: string[] = []
    const summaryText = htmlToMarkdown(str(section.summary))
    if (summaryText) parts.push(summaryText)
    let modified: string | undefined
    for (const mod of (Array.isArray(section.modules) ? section.modules : []).filter(isObject)) {
      if (str(mod.modname) !== 'label') continue
      const text = htmlToMarkdown(str(mod.description))
      if (text) parts.push(text)
      const changed = time(mod.timemodified)
      if (changed && (!modified || changed > modified)) modified = changed
    }
    const text = parts.join('\n\n').slice(0, 20_000)
    if (!text) continue
    info.sections.push({
      id: `section:${str(section.id) || info.sections.length}`,
      title: htmlToMarkdown(str(section.name)) || `Abschnitt ${str(section.section)}`,
      text,
      ...(modified ? { modified } : {}),
    })
  }
  const pages = isObject(raw.pages) && Array.isArray(raw.pages.pages) ? raw.pages.pages : []
  for (const page of pages.filter(isObject).slice(0, 40)) {
    if (`course:${str(page.course)}` !== courseId) continue
    const text = htmlToMarkdown(str(page.content)).slice(0, 30_000)
    if (!text) continue
    const modified = time(page.timemodified)
    info.pages.push({
      id: `page:${str(page.coursemodule) || str(page.id)}`,
      title: htmlToMarkdown(str(page.name)) || 'Seite',
      text,
      ...(modified ? { modified } : {}),
    })
  }
  // Forum posts: one list (old shape) or one list per forum ({ forum, data }).
  const forumLists: Array<{ forum?: string; data: unknown }> = Array.isArray(raw.discussions)
    ? raw.discussions.filter(isObject).map((d) => ({ forum: str(d.forum), data: d.data }))
    : [{ data: raw.discussions }]
  for (const { forum, data } of forumLists) {
    const discussions = isObject(data) && Array.isArray(data.discussions) ? data.discussions : []
    for (const d of discussions.filter(isObject).slice(0, 15)) {
      const text = htmlToMarkdown(str(d.message)).slice(0, 10_000)
      const subject = htmlToMarkdown(str(d.subject || d.name))
      if (!subject) continue
      const modified = time(d.timemodified ?? d.created)
      info.announcements.push({
        id: `news:${str(d.discussion) || str(d.id)}`,
        title: subject,
        text,
        ...(modified ? { modified } : {}),
        ...(forum ? { forum } : {}),
        ...(isImportantPost(`${subject} ${text}`) ? { important: true } : {}),
      })
    }
  }
  return info
}

const blocks = (info: CourseInfo) => [
  ...(info.summary ? [info.summary] : []),
  ...info.announcements,
  ...info.sections,
  ...info.pages,
]

/** Cancelled or moved lectures, room changes – posts that need attention. */
export function isImportantPost(text: string): boolean {
  return /f(ä|ae)llt\b[^.!?\n]{0,40}\baus\b|findet\b[^.!?\n]{0,40}\bnicht\s+statt|entf(ä|ae)llt|abgesagt|ausfall|verschoben|verlegt|raum(ä|ae)nderung|anderer raum|statt(dessen)?\s+in|online statt|nur online|cancel+ed|postponed|moved to/i.test(
    text,
  )
}

/** Latest change date of a course (from Moodle's dates). */
export function lastChange(info: CourseInfo): string | undefined {
  return blocks(info)
    .map((b) => b.modified)
    .filter((m): m is string => !!m)
    .sort()
    .pop()
}

const MARK = '## Meine Notizen'

/**
 * The body of a course page: everything from Moodle, then the user's own part (kept from the old
 * body, below "## Meine Notizen").
 */
export function courseInfoMarkdown(info: CourseInfo, previousBody = '', locale = 'de-DE'): string {
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale) : '')
  const out: string[] = [
    '> [!info] Aus Moodle – Notiva hält diese Seite aktuell und meldet Änderungen. Eigene Notizen unten unter „Meine Notizen“ oder auf der Modulseite.',
  ]
  if (info.summary) out.push('## Beschreibung', info.summary.text)
  if (info.announcements.length) {
    out.push('## Forum')
    const forums = [...new Set(info.announcements.map((a) => a.forum ?? 'Ankündigungen'))]
    // Forum names as sub-headings – unless it is just the announcements.
    const named = forums.length > 1 || forums[0] !== 'Ankündigungen'
    for (const forum of forums) {
      if (named) out.push(`### ${forum}`)
      for (const a of info.announcements.filter((x) => (x.forum ?? 'Ankündigungen') === forum))
        out.push(
          `${named ? '####' : '###'} ${a.important ? '⚠️ ' : ''}${a.title}${a.modified ? ` (${date(a.modified)})` : ''}`,
          a.text || '–',
        )
    }
  }
  if (info.sections.length) {
    out.push('## Abschnitte')
    for (const s of info.sections) out.push(`### ${s.title}`, s.text)
  }
  if (info.pages.length) {
    out.push('## Seiten')
    for (const p of info.pages) out.push(`### ${p.title}`, p.text)
  }
  if (!info.summary && !info.announcements.length && !info.sections.length && !info.pages.length)
    out.push('Dieser Kurs hat (noch) keine Texte in Moodle.')
  const index = previousBody.indexOf(MARK)
  const own = index >= 0 ? previousBody.slice(index) : `${MARK}\n\n- \n`
  return `${out.join('\n\n')}\n\n${own.trimEnd()}\n`
}

/** Short excerpt for a notification. */
const excerpt = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/[*#>[\]]/g, '')
    .slice(0, 160)

/**
 * New announcements and changed texts since the last check, per course. The first check (no
 * previous info) only sets the baseline.
 */
export function courseInfoNews(
  previous: Record<string, CourseInfo> | undefined,
  next: Record<string, CourseInfo> | undefined,
  courseName: (id: string) => string,
  now = new Date(),
): AppNotification[] {
  if (!previous || !next) return []
  const news: AppNotification[] = []
  for (const [id, info] of Object.entries(next)) {
    const before = previous[id]
    if (!before) continue
    const old = new Map(blocks(before).map((b) => [b.id, b]))
    for (const b of blocks(info)) {
      const prev = old.get(b.id)
      if (prev && prev.text === b.text && prev.title === b.title) continue
      // A forum read for the first time: only recent posts are news.
      if (
        !prev &&
        b.id.startsWith('news:') &&
        b.modified &&
        now.getTime() - Date.parse(b.modified) > 14 * 86_400_000
      )
        continue
      const isNews = b.id.startsWith('news:')
      const important = isNews && (b.important || isImportantPost(`${b.title} ${b.text}`))
      news.push({
        id: `info:${id}:${b.id}:${b.text.length}:${b.modified ?? ''}`,
        kind: important ? 'moved' : 'notice',
        topic: isNews ? 'forum' : 'page',
        courseId: id,
        title: isNews
          ? `${important ? (/f(ä|ae)llt|entf|abgesagt|ausfall|cancel/i.test(`${b.title} ${b.text}`) ? 'Ausfall: ' : 'Wichtig: ') : ''}${b.forum && !/ankündig|nachricht|news/i.test(b.forum) ? `${b.forum}: ` : ''}${b.title}`
          : prev
            ? `Geändert: ${b.title}`
            : `Neu: ${b.title}`,
        body: excerpt(b.text),
        course: courseName(id),
        time: b.modified ?? now.toISOString(),
        target: { type: 'course', courseId: id },
      })
    }
  }
  return news.slice(0, 30)
}
