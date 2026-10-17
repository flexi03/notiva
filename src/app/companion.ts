import { dayAgenda, studyEvents } from '@/app/calendarEvents'
import { useMoodle } from '@/app/moodle'
import { addShelfFile, addShelfText } from '@/app/shelf'
import { modulePages, portionsFor, setDone } from '@/app/studyPlan'
import { notesPathFor } from '@/lib/annotations'
import { importTargets } from '@/lib/moodle'
import { isoDate } from '@/lib/studyPlan'
import type { Workspace } from '@/lib/workspace'

/**
 * The answers for the iPhone/iPad app (docs/COMPANION.md, protocol v1). The main process does the
 * transport and the cryptography; this builds the answers with the same logic as "Heute", the
 * study plan and the shelf, and writes through the Workspace. Every input comes from the network:
 * checked here (paths must exist in the folder, sizes are limited).
 */

export class CompanionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

const FILE_CHUNK = 512 * 1024
const str = (v: unknown, max = 10_000) => (typeof v === 'string' ? v.slice(0, max) : '')
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
const isDay = (v: string) => /^\d{4}-\d\d-\d\d$/.test(v)

/** A path of the folder the app may use: no hidden folders (.notiva, .git), must exist. */
function safePath(ws: Workspace, raw: unknown, kind: 'page' | 'file' | 'any' = 'any'): string {
  const path = str(raw, 500)
  if (!path || path.split('/').some((part) => part.startsWith('.') || part === '..'))
    throw new CompanionError('Ungültiger Pfad', 'path')
  const page = !!ws.get(path)
  const file = ws.has(path) && !page
  if ((kind === 'page' && !page) || (kind === 'file' && !file) || (!page && !file))
    throw new CompanionError('Nicht gefunden', 'notFound')
  return path
}

function taskDatabases(ws: Workspace): string[] {
  return importTargets(ws)
    .map((t) => t.tasks)
    .filter((p): p is string => !!p && !!ws.get(p)?.database)
}

/** The page a relation value (`["[[Mathe 1]]"]` or `"[[Mathe 1]]"`) points to first. */
function firstLink(ws: Workspace, value: unknown, from: string) {
  const first = Array.isArray(value) ? value[0] : value
  const target = typeof first === 'string' ? first.replace(/^\[\[|\]\]$/g, '') : ''
  const path = target ? ws.resolveLink(target, from) : null
  return path ? ws.get(path) : undefined
}

export async function companionAnswer(ws: Workspace, method: string, params: unknown): Promise<unknown> {
  const p = obj(params)
  switch (method) {
    case 'hello':
      return {
        protocol: 1,
        vault: ws.vault.name,
        version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
      }

    case 'day': {
      const date = isDay(str(p.date)) ? str(p.date) : isoDate(new Date())
      const { items, upcoming } = dayAgenda(
        studyEvents(ws, useMoodle.getState().snapshot),
        date,
        date === isoDate(new Date()),
      )
      const plain = <T extends { event: { path?: string; url?: string; room?: string; module?: string } }>(
        i: T,
      ) => {
        const { event, ...rest } = i
        return {
          ...rest,
          ...(event.path ? { path: event.path } : {}),
          ...(event.url ? { url: event.url } : {}),
          ...(event.room ? { room: event.room } : {}),
          ...(event.module ? { module: event.module } : {}),
        }
      }
      return {
        date,
        items: items.map(plain),
        upcoming: upcoming.map(plain),
        study: portionsFor(ws, date).map(({ module, topics, done }) => ({
          module: { path: module.path, title: module.title },
          topics: topics.map((x) => ({ key: x.key, path: x.path, kind: x.kind, done: done.has(x.key) })),
        })),
      }
    }

    case 'week':
      return studyEvents(ws, useMoodle.getState().snapshot)
        .filter((e) => e.kind === 'session')
        .map((e) => ({
          weekday: e.weekday,
          time: e.time,
          ...(e.end ? { end: e.end } : {}),
          title: e.title,
          ...(e.type ? { type: e.type } : {}),
          ...(e.room ? { room: e.room } : {}),
          ...(e.module ? { module: e.module } : {}),
        }))

    case 'tasks':
      return taskDatabases(ws)
        .flatMap((db) => ws.rows(db))
        .map((r) => {
          const module = firstLink(ws, r.data.Modul, r.path)
          return {
            path: r.path,
            title: r.title,
            due: str(r.data.Fällig) || null,
            status: str(r.data.Status) || 'Offen',
            art: str(r.data.Art) || null,
            priority: str(r.data.Priorität) || null,
            module: module ? { path: module.path, title: module.title } : null,
            moodle: typeof r.data.moodle === 'string',
          }
        })
        .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))

    case 'modules':
      return modulePages(ws).map((m) => ({ path: m.path, title: m.title }))

    case 'task.set': {
      const path = safePath(ws, p.path, 'page')
      await ws.setProperty(path, 'Status', p.done === true ? 'Erledigt' : 'Offen')
      return { path }
    }

    case 'task.add': {
      const [db] = taskDatabases(ws)
      if (!db) throw new CompanionError('Keine Aufgaben-Datenbank im Ordner', 'noTasks')
      const title = str(p.title, 200).trim()
      if (!title) throw new CompanionError('Titel fehlt', 'title')
      const due = str(p.due, 25)
      const module = str(p.module, 200)
      const path = await ws.createRow(db, title, {
        Status: 'Offen',
        ...(/^\d{4}-\d\d-\d\d(T\d\d:\d\d)?$/.test(due) ? { Fällig: due } : {}),
        ...(module && ws.get(module) ? { Modul: [`[[${ws.linkText(module)}]]`] } : {}),
      })
      return { path }
    }

    case 'study.done': {
      const module = modulePages(ws).find((m) => m.path === str(p.module, 500))
      if (!module) throw new CompanionError('Modul nicht gefunden', 'notFound')
      await setDone(ws, module, str(p.key, 300), p.done === true)
      return { ok: true }
    }

    case 'shelf.add': {
      const data = str(p.data, 11_000_000)
      if (data) {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        if (bytes.length > 8_000_000) throw new CompanionError('Datei zu groß (max. 8 MB)', 'tooLarge')
        return { path: await addShelfFile(ws, str(p.name, 120) || 'Foto.jpg', bytes) }
      }
      const path = await addShelfText(ws, str(p.text, 100_000))
      if (!path) throw new CompanionError('Nichts zum Ablegen', 'empty')
      return { path }
    }

    case 'pages':
      return ws
        .all()
        .filter((x) => !x.path.split('/').some((part) => part.startsWith('.')))
        .map((x) => ({ path: x.path, title: x.title, mtime: x.mtime }))

    case 'page': {
      const page = ws.get(safePath(ws, p.path, 'page'))!
      return { path: page.path, title: page.title, body: page.body, data: page.data, mtime: page.mtime }
    }

    case 'page.put': {
      const path = safePath(ws, p.path, 'page')
      const page = ws.get(path)!
      // Changed on the Mac since the phone loaded it: no overwriting – both versions stay.
      if (typeof p.base === 'number' && p.base !== page.mtime)
        throw new CompanionError('Die Seite wurde inzwischen am Mac geändert', 'conflict', {
          body: page.body,
          mtime: page.mtime,
        })
      await ws.save(path, { body: str(p.body, 2_000_000) })
      return { path, mtime: ws.get(path)?.mtime ?? Date.now() }
    }

    case 'file': {
      const path = safePath(ws, p.path, 'file')
      const offset = Math.max(0, Math.floor(Number(p.offset ?? 0)) || 0)
      const length = Math.min(
        FILE_CHUNK,
        Math.max(1, Math.floor(Number(p.length ?? FILE_CHUNK)) || FILE_CHUNK),
      )
      const bytes = await ws.vault.readBinary(path)
      const part = bytes.subarray(offset, offset + length)
      let binary = ''
      for (let i = 0; i < part.length; i += 0x8000)
        binary += String.fromCharCode(...part.subarray(i, i + 0x8000))
      return { path, size: bytes.length, offset, data: btoa(binary) }
    }

    case 'notes': {
      const pdf = safePath(ws, p.pdf, 'file')
      const notes = notesPathFor(pdf)
      const page = ws.get(notes)
      return page
        ? { path: notes, text: await ws.vault.read(notes), mtime: page.mtime }
        : { path: notes, text: null, mtime: null }
    }

    case 'notes.put': {
      const pdf = safePath(ws, p.pdf, 'file')
      const notes = notesPathFor(pdf)
      const page = ws.get(notes)
      if (page && typeof p.base === 'number' && p.base !== page.mtime)
        throw new CompanionError('Die Notizen wurden inzwischen am Mac geändert', 'conflict', {
          text: await ws.vault.read(notes),
          mtime: page.mtime,
        })
      await ws.writeFile(notes, str(p.text, 2_000_000))
      return { path: notes, mtime: ws.get(notes)?.mtime ?? Date.now() }
    }

    default:
      throw new CompanionError(`Unbekannte Anfrage: ${method}`, 'unknown')
  }
}
