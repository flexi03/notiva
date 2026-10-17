/**
 * A stand-in for the Mac in the iOS UI tests and App Store screenshots: the real sync server
 * (electron/companion.ts) with a fixed test device and a small, made-up semester (no real
 * people). `PORT=47999 npx tsx ios/scripts/fake-mac.ts`
 */
import MarkdownIt from 'markdown-it'
import { CompanionServer, type Device } from '../../electron/companion'

export const TEST_DEVICE: Device = {
  id: 'uitest-device',
  name: 'UI-Test',
  key: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  created: new Date().toISOString(),
  paired: true,
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const today = DAYS[(new Date().getDay() + 6) % 7]!

/** The week – today always has two sessions, so "Heute" is never empty. */
const week = [
  { weekday: today, time: '09:15', end: '10:45', title: 'Datenbanksysteme 2', type: 'Vorlesung', room: 'H3' },
  { weekday: today, time: '14:00', end: '15:30', title: 'IT-Sicherheit', type: 'Übung', room: '5.E.001' },
  ...[
    { weekday: 'Mo', time: '08:15', end: '09:45', title: 'Mathematik 3', type: 'Vorlesung', room: 'H1' },
    {
      weekday: 'Di',
      time: '12:00',
      end: '13:30',
      title: 'Software Engineering',
      type: 'Vorlesung',
      room: 'H2',
    },
    {
      weekday: 'Mi',
      time: '10:00',
      end: '13:00',
      title: 'Datenbanksysteme 2',
      type: 'Praktikum',
      room: 'Labor 2',
    },
    {
      weekday: 'Do',
      time: '16:00',
      end: '17:30',
      title: 'Digitale Bild- und Tontechnik',
      type: 'Vorlesung',
      room: 'H4',
    },
    { weekday: 'Fr', time: '09:15', end: '10:45', title: 'IT-Sicherheit', type: 'Vorlesung', room: 'H3' },
  ].filter((s) => s.weekday !== today),
]

/** What was ticked off – kept like the Mac keeps it in the module page. */
const done = new Set(['DBS2 - Vorlesung 05 - Indexstrukturen.pdf'])

const modules = [
  { path: 'Studium/Module/Datenbanksysteme 2.md', title: 'Datenbanksysteme 2' },
  { path: 'Studium/Module/IT-Sicherheit.md', title: 'IT-Sicherheit' },
  { path: 'Studium/Module/Mathematik 3.md', title: 'Mathematik 3' },
  { path: 'Studium/Module/Software Engineering.md', title: 'Software Engineering' },
]
const [dbs, sec, math, se] = modules

/** The tasks database – ticks and new tasks are kept while the stand-in runs. */
type Task = {
  path: string
  title: string
  due: string | null
  status: string
  art: string | null
  priority: string | null
  module: (typeof modules)[number] | null
  moodle?: boolean
}
const tasks: Task[] = [
  {
    path: 'Studium/Aufgaben/Zusammenfassung Kapitel 5.md',
    title: 'Zusammenfassung Kapitel 5',
    due: inDays(-3),
    status: 'Offen',
    art: 'Lernen',
    priority: 'Hoch',
    module: dbs,
  },
  {
    path: 'Studium/Aufgaben/Praktikum 3 vorbereiten.md',
    title: 'Praktikum 3 vorbereiten',
    due: inDays(0),
    status: 'In Arbeit',
    art: 'Projekt',
    priority: null,
    module: dbs,
  },
  {
    path: 'Studium/Aufgaben/Übungsblatt 4 – Transaktionen.md',
    title: 'Übungsblatt 4 – Transaktionen',
    due: `${inDays(0)}T23:59`,
    status: 'Erledigt',
    art: 'Übungsblatt',
    priority: null,
    module: dbs,
    moodle: true,
  },
  {
    path: 'Studium/Aufgaben/Übungsblatt 6 Mathe.md',
    title: 'Übungsblatt 6',
    due: inDays(1),
    status: 'Offen',
    art: 'Übungsblatt',
    priority: 'Hoch',
    module: math,
  },
  {
    path: 'Studium/Aufgaben/Projektskizze abgeben.md',
    title: 'Projektskizze abgeben',
    due: `${inDays(4)}T23:59`,
    status: 'Offen',
    art: 'Abgabe',
    priority: null,
    module: se,
    moodle: true,
  },
  {
    path: 'Studium/Aufgaben/Paper zu TLS lesen.md',
    title: 'Paper zu TLS 1.3 lesen',
    due: inDays(9),
    status: 'Offen',
    art: 'Lesen',
    priority: 'Niedrig',
    module: sec,
  },
  {
    path: 'Studium/Aufgaben/Lerngruppe organisieren.md',
    title: 'Lerngruppe organisieren',
    due: null,
    status: 'Offen',
    art: null,
    priority: null,
    module: null,
  },
]

/** Pages – "Gruppenarbeit" is open on the Mac: it changes after every read (conflicts on save). */
type FakePage = {
  path: string
  title: string
  icon?: string
  body: string
  data: Record<string, unknown>
  mtime: number
}
const pages: FakePage[] = [
  {
    path: 'Willkommen.md',
    title: 'Willkommen',
    icon: '👋',
    body: '# Willkommen\n\nDein Studium in Notiva. Start: [[Datenbanksysteme 2]].',
    data: {},
    mtime: Date.now() - 9e7,
  },
  {
    path: 'Studium/Module/Datenbanksysteme 2.md',
    title: 'Datenbanksysteme 2',
    icon: '🗄️',
    body: '## Überblick\n\nB-Bäume, Hashing, Anfrageoptimierung und Transaktionen.\n\n- [x] Vorlesung 05 nacharbeiten\n- [ ] Übungsblatt 4\n\nNotizen: [[Vorlesung 05 – Indexstrukturen]]',
    data: { Status: 'Laufend', ECTS: 5, Semester: '[[WiSe 26/27]]', lernplan: 'hidden' },
    mtime: Date.now() - 36e5,
  },
  {
    path: 'Studium/Module/Mathematik 3.md',
    title: 'Mathematik 3',
    icon: '📐',
    body: 'Differentialgleichungen und Fourier.',
    data: { Status: 'Laufend', ECTS: 5 },
    mtime: Date.now() - 7e7,
  },
  {
    path: 'Studium/Notizen/Vorlesung 05 – Indexstrukturen.md',
    title: 'Vorlesung 05 – Indexstrukturen',
    body: '# Indexstrukturen\n\n> Ein B+-Baum hält alle Daten in den Blättern.\n\n![Tafel](Tafel.png)\n\n| Struktur | Suche |\n| --- | --- |\n| B+-Baum | O(log n) |\n| Hash | O(1) |',
    data: { Modul: '[[Datenbanksysteme 2]]' },
    mtime: Date.now() - 6e6,
  },
  {
    path: 'Studium/Notizen/Gruppenarbeit.md',
    title: 'Gruppenarbeit',
    body: 'Wer macht was – gerade am Mac offen.',
    data: {},
    mtime: Date.now() - 5e6,
  },
]
// A small green square ("the blackboard").
const TAFEL =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAIAAABhdOiYAAAAZUlEQVR4nO3QMQ0AIADAMBxhBQP4t4EDONnRZAKWjrmXLo3vB/EAAQIECFA4QIAAAQIUDhAgQIAAhQMECBAgQOEAAQIECFA4QIAAAQIUDhAgQIAAhQMECBAgQOEAAQIECFA4QI8OtA944vTdcx4AAAAASUVORK5CYII='
const markdown = new MarkdownIt()
const html = (page: FakePage) =>
  markdown
    .render(page.body)
    // Task lists as on the Mac (markdown-it alone leaves "[x]").
    .replace(
      /<li>\[( |x)\] /g,
      (_, x: string) => `<li><input type="checkbox" disabled${x === 'x' ? ' checked' : ''}> `,
    )
    .replace(/\[\[([^\]]+)\]\]/g, (_, name: string) => {
      const target = pages.find((p) => p.title === name)
      return target
        ? `<a class="wikilink" href="#/p/${encodeURIComponent(target.path)}">${name}</a>`
        : `<a class="wikilink wikilink-missing" href="#">${name}</a>`
    })

/** What was put on the shelf (name and size). */
const shelf: Array<{ name: string; bytes: number }> = []

function day(date: string) {
  const weekday = DAYS[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]
  const sessions = week
    .filter((s) => s.weekday === weekday)
    .map((s, i) => ({
      key: `session-${i}`,
      kind: 'session',
      time: s.time,
      end: s.end,
      title: s.title,
      sub: `${s.type} · ${s.room}`,
      room: s.room,
    }))
  const isToday = date === inDays(0)
  return {
    date,
    items: [
      ...sessions,
      ...(isToday
        ? [
            {
              key: 'task-1',
              kind: 'moodle',
              time: '23:59',
              title: 'Übungsblatt 4 – Transaktionen',
              sub: 'Datenbanksysteme 2 · abgegeben',
              done: true,
            },
            { key: 'task-2', kind: 'task', title: 'Praktikum 3 vorbereiten', sub: 'Vorbereitung' },
            {
              key: 'task-3',
              kind: 'task',
              title: 'Zusammenfassung Kapitel 5',
              sub: 'überfällig seit 14.10.',
              overdue: true,
            },
          ]
        : []),
    ],
    upcoming: isToday
      ? [
          {
            key: 'up-1',
            kind: 'lab',
            date: inDays(2),
            time: '10:00',
            title: 'Datenbanksysteme 2 – P03 Praktikumstermin',
            sub: 'Praktikum',
          },
          {
            key: 'up-2',
            kind: 'moodle',
            date: inDays(4),
            time: '23:59',
            title: 'Projektskizze abgeben',
            sub: 'Software Engineering · nicht abgegeben',
          },
          {
            key: 'up-3',
            kind: 'exam',
            date: inDays(12),
            time: '10:00',
            title: 'Klausur Mathematik 3',
            sub: 'Prüfung · H1',
          },
        ]
      : [],
    study: isToday
      ? [
          {
            module: { path: 'Studium/Module/Datenbanksysteme 2.md', title: 'Datenbanksysteme 2' },
            topics: [
              { key: 'DBS2 - Vorlesung 05 - Indexstrukturen.pdf', path: 'x', kind: 'lecture' },
              { key: 'DBS2 - Vorlesung 06 - Anfrageoptimierung.pdf', path: 'y', kind: 'lecture' },
            ].map((t) => ({ ...t, done: done.has(t.key) })),
          },
        ]
      : [],
  }
}

const server = new CompanionServer(
  () => [TEST_DEVICE],
  async (_device, method, params) => {
    const p = (params ?? {}) as Record<string, unknown>
    if (method === 'hello') return { protocol: 1, vault: 'Studium', version: 'test' }
    if (method === 'day') return day(typeof p.date === 'string' ? p.date : inDays(0))
    if (method === 'week') return week
    if (method === 'tasks') return tasks
    if (method === 'modules') return modules
    if (method === 'task.set') {
      const task = tasks.find((t) => t.path === p.path)
      if (!task) throw Object.assign(new Error('Nicht gefunden'), { code: 'notFound' })
      task.status = p.done === true ? 'Erledigt' : 'Offen'
      return { path: task.path }
    }
    if (method === 'task.add') {
      const title = String(p.title ?? '').trim()
      const path = `Studium/Aufgaben/${title}.md`
      tasks.push({
        path,
        title,
        due: typeof p.due === 'string' ? p.due : null,
        status: 'Offen',
        art: null,
        priority: null,
        module: modules.find((m) => m.path === p.module) ?? null,
        moodle: false,
      })
      return { path }
    }
    if (method === 'shelf.add') {
      const name =
        typeof p.name === 'string' ? p.name : `${inDays(0)} ${String(p.text ?? '').slice(0, 30)}.md`
      shelf.push({ name, bytes: typeof p.data === 'string' ? Buffer.from(p.data, 'base64').length : 0 })
      return { path: `Ablage/${name}` }
    }
    if (method === 'pages')
      return pages.map(({ path, title, icon, mtime }) => ({ path, title, mtime, ...(icon ? { icon } : {}) }))
    if (method === 'page' || method === 'page.put' || method === 'page.copy') {
      const page = pages.find((x) => x.path === p.path)
      if (!page) throw Object.assign(new Error('Nicht gefunden'), { code: 'notFound' })
      if (method === 'page') {
        const answer = {
          path: page.path,
          title: page.title,
          body: page.body,
          data: page.data,
          mtime: page.mtime,
          html: html(page),
        }
        if (page.title === 'Gruppenarbeit') page.mtime += 1000
        return answer
      }
      if (method === 'page.copy') {
        const copy = {
          ...page,
          path: page.path.replace(/\.md$/, ' (iPhone).md'),
          title: `${page.title} (iPhone)`,
          body: String(p.body),
          mtime: Date.now(),
        }
        pages.push(copy)
        return { path: copy.path }
      }
      if (typeof p.base === 'number' && p.base !== page.mtime)
        throw Object.assign(new Error('Die Seite wurde inzwischen am Mac geändert'), { code: 'conflict' })
      page.body = String(p.body)
      page.mtime = Date.now()
      return { path: page.path, mtime: page.mtime }
    }
    if (method === 'file') {
      if (p.path !== 'Studium/Notizen/Tafel.png')
        throw Object.assign(new Error('Nicht gefunden'), { code: 'notFound' })
      const bytes = Buffer.from(TAFEL, 'base64')
      return { path: p.path, size: bytes.length, offset: 0, data: TAFEL }
    }
    if (method === 'study.done') {
      if (p.done === true) done.add(String(p.key))
      else done.delete(String(p.key))
      return { ok: true }
    }
    throw Object.assign(new Error(`Unbekannte Anfrage: ${method}`), { code: 'unknown' })
  },
)
// All interfaces: newer simulators reach the Mac by its network address, not 127.0.0.1.
await server.start(Number(process.env.PORT ?? 47_999), '0.0.0.0')
console.log(`fake mac on ${server.port}`)
