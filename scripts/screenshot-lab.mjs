// README image of a lab in the desktop app: code file in the editor, terminal below (dark).
// `npm run build && npm run electron:build && node scripts/screenshot-lab.mjs`
// A clean shell (prompt "$ ", no profile) so no user or host name shows up.
import { _electron as electron } from '@playwright/test'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUT = new URL('../docs/images/praktikum.png', import.meta.url).pathname
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
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900))
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
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
} finally {
  await app.close()
}
