import { installPack, studyPack } from '@/lib/packs'
import { MemoryVault } from '@/lib/vault/memory'
import { Workspace } from '@/lib/workspace'
import { companionAnswer } from '../companion'

async function demo() {
  const ws = await Workspace.open(new MemoryVault('Studium'))
  await installPack(ws, studyPack, { studiengang: 'Informatik (B.Sc.)' })
  await ws.writeFile('Studium/Unterlagen/Datenbanken/Vorlesung/DB-01.pdf', new Uint8Array(1_200_000).fill(7))
  return ws
}

describe('companion answers', () => {
  it('hello, week and day come from the same logic as "Heute"', async () => {
    const ws = await demo()
    expect(await companionAnswer(ws, 'hello', {})).toMatchObject({ protocol: 1, vault: 'Studium' })
    const week = (await companionAnswer(ws, 'week', {})) as Array<{ title: string; room?: string }>
    expect(week.find((s) => s.title === 'Datenbanken')).toMatchObject({ room: 'H3' })
    const day = (await companionAnswer(ws, 'day', { date: '2026-10-20' })) as {
      items: unknown[]
      upcoming: unknown[]
    }
    expect(Array.isArray(day.items) && Array.isArray(day.upcoming)).toBe(true)
  })

  it('tasks: list, tick off, add', async () => {
    const ws = await demo()
    const tasks = (await companionAnswer(ws, 'tasks', {})) as Array<{ path: string; status: string }>
    expect(tasks.length).toBeGreaterThan(0)
    await companionAnswer(ws, 'task.set', { path: tasks[0]!.path, done: true })
    expect(ws.get(tasks[0]!.path)!.data.Status).toBe('Erledigt')
    const { path } = (await companionAnswer(ws, 'task.add', { title: 'Vom iPhone', due: '2026-10-30' })) as {
      path: string
    }
    expect(ws.get(path)!.data).toMatchObject({ Status: 'Offen', Fällig: '2026-10-30' })
  })

  it('shelf: text and photo land in "Ablage"', async () => {
    const ws = await demo()
    const text = (await companionAnswer(ws, 'shelf.add', { text: 'Tafelbild Normalformen' })) as {
      path: string
    }
    expect(text.path).toMatch(/^Ablage\/.+Tafelbild Normalformen\.md$/)
    const photo = (await companionAnswer(ws, 'shelf.add', { name: 'Tafel.jpg', data: btoa('jpegdata') })) as {
      path: string
    }
    expect(photo.path).toBe('Ablage/Tafel.jpg')
    expect(new TextDecoder().decode(await ws.vault.readBinary('Ablage/Tafel.jpg'))).toBe('jpegdata')
  })

  it('pages: read, write, conflict instead of overwriting', async () => {
    const ws = await demo()
    const page = (await companionAnswer(ws, 'page', { path: 'Studium.md' })) as {
      body: string
      mtime: number
    }
    const saved = (await companionAnswer(ws, 'page.put', {
      path: 'Studium.md',
      body: `${page.body}\nVom iPhone\n`,
      base: page.mtime,
    })) as { mtime: number }
    expect(ws.get('Studium.md')!.body).toContain('Vom iPhone')
    await expect(
      companionAnswer(ws, 'page.put', { path: 'Studium.md', body: 'alt', base: page.mtime }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(saved.mtime).toBeTruthy()
  })

  it('files in chunks; PDF notes next to the PDF', async () => {
    const ws = await demo()
    const pdf = 'Studium/Unterlagen/Datenbanken/Vorlesung/DB-01.pdf'
    const first = (await companionAnswer(ws, 'file', { path: pdf })) as { size: number; data: string }
    expect(first.size).toBe(1_200_000)
    expect(atob(first.data).length).toBe(512 * 1024)
    const mark = { id: 'm1', type: 'highlight', page: 1, color: 'blue', rects: [[1, 2, 30, 10]], text: 'SQL' }
    await companionAnswer(ws, 'notes.put', {
      pdf,
      add: [mark],
      notes: [{ page: 1, text: 'Notiz', base: '' }],
    })
    const notes = (await companionAnswer(ws, 'notes', { pdf })) as {
      annotations: Array<{ id: string }>
      notes: Record<string, string>
    }
    expect(notes.annotations.map((x) => x.id)).toEqual(['m1'])
    expect(notes.notes).toEqual({ '1': 'Notiz' })
    // Ink from the phone may come as point pairs.
    const ink = {
      id: 'k1',
      type: 'ink',
      page: 1,
      color: 'red',
      width: 2,
      points: [
        [1, 2],
        [3, 4],
      ],
    }
    const after = (await companionAnswer(ws, 'notes.put', { pdf, add: [ink] })) as { annotations: unknown[] }
    expect(after.annotations).toHaveLength(2)
  })

  it('refuses hidden folders, traversal, unknown paths and methods', async () => {
    const ws = await demo()
    for (const path of ['.notiva/settings.json', '../etc/passwd', 'Studium/../../x.md', 'gibts-nicht.md'])
      await expect(companionAnswer(ws, 'page', { path })).rejects.toBeTruthy()
    await expect(companionAnswer(ws, 'rm -rf', {})).rejects.toMatchObject({ code: 'unknown' })
  })
})
