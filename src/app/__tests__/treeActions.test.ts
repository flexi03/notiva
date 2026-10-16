import { MemoryVault } from '@/lib/vault/memory'
import { Workspace } from '@/lib/workspace'
import { savedMaterials } from '../materials'
import { canMove, countInside, moveEntries, outermost, restoreEntries, trashEntries } from '../treeActions'

const U = 'Studium/Unterlagen/DBS 2'

async function vault() {
  const ws = await Workspace.open(
    new MemoryVault('Test', {
      [`${U}/VL 00.pdf`]: '%PDF',
      [`${U}/VL 00 (Notizen).md`]: '---\npdf: VL 00.pdf\n---\n',
      [`${U}/Blatt.pdf`]: '%PDF',
      [`${U}/Alt/Klausur.pdf`]: '%PDF',
      'Notizen.md': '# Notizen\n',
    }),
  )
  await ws.writeMeta('moodle-files.json', {
    'file:1': { path: `${U}/VL 00.pdf` },
    'file:3': { path: `${U}/Alt/Klausur.pdf` },
  })
  return ws
}

describe('tree actions', () => {
  it('outermost: a chosen folder covers what is in it', () => {
    expect(outermost([`${U}/Alt`, `${U}/Alt/Klausur.pdf`, 'Notizen.md'])).toEqual([`${U}/Alt`, 'Notizen.md'])
  })

  it('canMove: not into itself, not where it already is', () => {
    expect(canMove([`${U}/Alt`], `${U}/Alt`)).toBe(false)
    expect(canMove([`${U}/Blatt.pdf`], U)).toBe(false)
    expect(canMove([`${U}/Blatt.pdf`], `${U}/Alt`)).toBe(true)
  })

  it('moves files, folders and pages together – notes and Moodle places follow', async () => {
    const ws = await vault()
    const count = await moveEntries(ws, [`${U}/VL 00.pdf`, `${U}/Alt`, 'Notizen.md'], `${U}/Archiv`)
    expect(count).toBe(3)
    expect(ws.has(`${U}/Archiv/VL 00 (Notizen).md`)).toBe(true)
    expect(ws.has(`${U}/Archiv/Alt/Klausur.pdf`)).toBe(true)
    expect(ws.get(`${U}/Archiv/Notizen.md`)).toBeTruthy()
    const saved = await savedMaterials(ws)
    expect(saved['file:1']!.path).toBe(`${U}/Archiv/VL 00.pdf`)
    expect(saved['file:3']!.path).toBe(`${U}/Archiv/Alt/Klausur.pdf`)
  })

  it('trash several at once, restorable', async () => {
    const ws = await vault()
    expect(countInside(ws, [`${U}/Alt`, `${U}/Blatt.pdf`])).toBe(2)
    const entries = await trashEntries(ws, [`${U}/Alt`, `${U}/Blatt.pdf`, 'Notizen.md'])
    expect(ws.has(`${U}/Blatt.pdf`) || ws.has(`${U}/Alt/Klausur.pdf`) || !!ws.get('Notizen.md')).toBe(false)
    await restoreEntries(ws, entries)
    expect(ws.has(`${U}/Blatt.pdf`) && ws.has(`${U}/Alt/Klausur.pdf`) && !!ws.get('Notizen.md')).toBe(true)
  })
})
