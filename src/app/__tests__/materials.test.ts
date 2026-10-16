import { MemoryVault } from '@/lib/vault/memory'
import { Workspace } from '@/lib/workspace'
import { forgetMaterials, missingMaterials, moveMaterials, savedMaterials } from '../materials'
import type { MoodleSnapshot } from '@/lib/moodle'

const U = 'Studium/Unterlagen/DBS 2'

async function vault() {
  const ws = await Workspace.open(
    new MemoryVault('Test', {
      [`${U}/VL 00.pdf`]: '%PDF',
      [`${U}/VL 00 (Notizen).md`]: '---\npdf: VL 00.pdf\n---\n',
      [`${U}/Blatt.pdf`]: '%PDF',
    }),
  )
  await ws.writeMeta('moodle-files.json', {
    'file:1:vl00.pdf': { path: `${U}/VL 00.pdf`, modified: '2026-10-01' },
    // The same script in an older course of the module.
    'file:9:vl00.pdf': { path: `${U}/VL 00.pdf` },
    'file:2:blatt.pdf': { path: `${U}/Blatt.pdf` },
  })
  return ws
}

const snapshot = (ids: string[]): MoodleSnapshot => ({
  site: 'https://moodle.example.org',
  source: 'webservice',
  fetchedAt: '2026-10-17T10:00:00Z',
  courses: [{ id: 'course:1', name: 'DBS 2' }],
  events: [],
  grades: [],
  notices: [],
  materials: ids.map((id) => ({
    id,
    courseId: 'course:1',
    title: id,
    filename: id.split(':')[2]!,
    section: 'Woche 1',
    kind: 'file' as const,
    url: 'u',
    size: 4,
  })),
})

describe('moveMaterials', () => {
  it('keeps every Moodle id of a moved file (and moves its notes) – nothing turns "new"', async () => {
    const ws = await vault()
    await moveMaterials(ws, [{ from: `${U}/VL 00.pdf`, to: `${U}/Vorlesung/VL 00.pdf` }])
    const saved = await savedMaterials(ws)
    expect(saved['file:1:vl00.pdf']!.path).toBe(`${U}/Vorlesung/VL 00.pdf`)
    expect(saved['file:9:vl00.pdf']!.path).toBe(`${U}/Vorlesung/VL 00.pdf`)
    expect(ws.has(`${U}/Vorlesung/VL 00 (Notizen).md`)).toBe(true)
    expect(await missingMaterials(ws, snapshot(['file:1:vl00.pdf', 'file:9:vl00.pdf']))).toEqual([])
  })
})

describe('forgetMaterials', () => {
  it('thrown-away Moodle files are not offered again', async () => {
    const ws = await vault()
    await forgetMaterials(ws, [U])
    await ws.trashPath(`${U}/Blatt.pdf`)
    expect(
      (await missingMaterials(ws, snapshot(['file:2:blatt.pdf', 'file:3:neu.pdf']))).map((m) => m.id),
    ).toEqual(['file:3:neu.pdf'])
  })
})
