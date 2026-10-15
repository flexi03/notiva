// README images from the desktop app (dark): a lab (code file in the editor, terminal below) and a
// lecture PDF with highlights, a comment, a page note and a pen stroke.
// `npm run build && npm run electron:build && node scripts/screenshots-desktop.mjs`
// A clean shell (prompt "$ ", no profile) so no user or host name shows up.
import { _electron as electron } from '@playwright/test'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUT = new URL('../docs/images/praktikum.png', import.meta.url).pathname
const OUT_PDF = new URL('../docs/images/pdf.png', import.meta.url).pathname
// The folder name shows in the sidebar.
const folder = path.join(mkdtempSync(path.join(os.tmpdir(), 'notiva-lab-')), 'Studium')
const lab = path.join(folder, 'Datenbanken', 'Praktikum 3')
mkdirSync(folder)
mkdirSync(lab, { recursive: true })
writeFileSync(path.join(folder, 'Datenbanken.md'), '---\nicon: 🗄️\n---\n# Datenbanken\n')
writeFileSync(
  path.join(folder, 'Datenbanken', 'Praktikum 3.md'),
  '---\ncode: true\nicon: 💻\n---\n## Aufgabe\n\n- Schema anlegen, Testdaten einfügen\n- Abfragen 1–4 lösen\n',
)
writeFileSync(path.join(lab, '.gitignore'), '__pycache__/\n*.db\n')
writeFileSync(
  path.join(lab, 'abfragen.py'),
  `import sqlite3

db = sqlite3.connect(":memory:")
db.executescript(open("schema.sql").read())

# Aufgabe 2: Umsatz je Kunde, absteigend
rows = db.execute("""
    SELECT k.name, SUM(b.betrag) AS umsatz
    FROM kunde k JOIN bestellung b ON b.kunde_id = k.id
    GROUP BY k.id
    ORDER BY umsatz DESC
""").fetchall()

for name, umsatz in rows:
    print(f"{name:<10} {umsatz:>8.2f} €")
`,
)
writeFileSync(
  path.join(lab, 'schema.sql'),
  `CREATE TABLE kunde (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE bestellung (
  id INTEGER PRIMARY KEY,
  kunde_id INTEGER REFERENCES kunde(id),
  betrag REAL
);
INSERT INTO kunde VALUES (1, 'Ada'), (2, 'Linus'), (3, 'Grace');
INSERT INTO bestellung (kunde_id, betrag) VALUES (1, 120), (2, 80.5), (1, 42), (3, 210);
`,
)
// Lecture slides with notes (format: docs/FORMAT.md, "PDF-Notizen").
mkdirSync(path.join(folder, 'Skripte'))
writeFileSync(path.join(folder, 'Skripte.md'), '---\nicon: 📚\n---\n# Skripte\n')
copyFileSync(
  new URL('../e2e/fixtures/graphen.pdf', import.meta.url).pathname,
  path.join(folder, 'Skripte/Graphen.pdf'),
)
writeFileSync(
  path.join(folder, 'Skripte/Graphen (Notizen).md'),
  `---
pdf: Graphen.pdf
annotations:
  - { id: a1, type: highlight, page: 1, color: yellow, rects: [[80, 134, 252, 18], [80, 174, 291, 18]], text: 'Definition: Ein Graph G = (V, E) besteht aus Knoten V und Kanten E.', comment: 'Kommt in jeder Klausur dran' }
  - { id: a2, type: highlight, page: 1, color: green, rects: [[80, 214, 262, 18]], text: 'Beispiel: Wegesuche mit Dijkstra' }
  - { id: a3, type: note, page: 1, color: blue, x: 400, y: 214, text: 'Dijkstra nur ohne negative Kanten' }
  - { id: a4, type: ink, page: 1, color: red, width: 2.5, points: '80,198 180,200 300,197 372,199' }
  - { id: a5, type: highlight, page: 2, color: yellow, rects: [[80, 174, 157, 18]], text: 'Laufzeit O(|V| + |E|)' }
---
## Seite 1

- **Graph** = Knoten + Kanten, gerichtet oder ungerichtet
- Dijkstra: *Prioritätswarteschlange*, Laufzeit $O((V+E)\\log V)$
`,
)

const shell = path.join(path.dirname(folder), 'shell.sh')
// Notiva asks the login shell for PATH at start (with a command) – that one runs normally.
writeFileSync(
  shell,
  '#!/bin/bash\nif [ "$#" -gt 1 ]; then exec /bin/bash "$@"; fi\nexport PS1=\'$ \'\nexec /bin/bash --noprofile --norc -i\n',
)
chmodSync(shell, 0o755)

const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    SHELL: shell,
    BASH_SILENCE_DEPRECATION_WARNING: '1',
    NOTIVA_E2E_FOLDER: folder,
    NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-lab-user-')),
  },
})
try {
  const window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
  // A fixed 1440×900 view, whatever screen this runs on (the notes column opens from 1100 px).
  await window.evaluate(() => (location.hash = '#/f/Datenbanken%2FPraktikum%203%2Fabfragen.py'))
  const term = window.getByTestId('terminal')
  await term.waitFor({ timeout: 15_000 })
  await window.waitForTimeout(1500)
  await term.click()
  await window.keyboard.type('clear && python3 abfragen.py\n')
  await window.waitForTimeout(2500)
  // Dark (after the folder's settings were applied) and without the setup hint.
  await window.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  for (const close of await window
    .getByTestId('progress-task')
    .getByRole('button', { name: 'Schließen' })
    .all())
    await close.click()
  await window.mouse.move(0, 0)
  await window.waitForTimeout(800)
  await window.screenshot({ path: OUT })

  // The lecture PDF with its notes beside it.
  await window.evaluate(() => (location.hash = '#/f/Skripte%2FGraphen.pdf'))
  await window.locator('[data-page="1"] canvas').waitFor({ timeout: 15_000 })
  // Room for the PDF and its notes on any screen: sidebar in, notes column out, lecture panel closed.
  await window.keyboard.press('ControlOrMeta+\\')
  const notes = window.getByRole('button', { name: 'Notizen ein-/ausblenden' })
  if ((await notes.getAttribute('aria-pressed')) !== 'true') await notes.click()
  await window
    .getByRole('button', { name: 'Einklappen' })
    .first()
    .click()
    .catch(() => undefined)
  await window.waitForTimeout(2000)
  await window.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await window.mouse.move(0, 0)
  await window.waitForTimeout(600)
  await window.screenshot({ path: OUT_PDF })
} finally {
  await app.close()
}
