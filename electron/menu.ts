/**
 * The menu bar (macOS: at the top of the screen; Windows/Linux: in the window). Items send a
 * command to the app (src/app/commands.ts). Shortcuts the app handles itself are only shown
 * (registerAccelerator: false), so typing in the editor keeps working the same everywhere.
 */
import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const send = (id: string) => () => getWindow()?.webContents.send('menu:command', id)
  const item = (label: string, id: string, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    click: send(id),
    // The app handles its own shortcuts; these exist only here.
    ...(accelerator ? { accelerator, registerAccelerator: ['openFolder', 'undo', 'redo'].includes(id) } : {}),
  })
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'Über Notiva' },
              { type: 'separator' },
              item('Einstellungen …', 'settings', 'CmdOrCtrl+,'),
              item('Einrichtung prüfen', 'setupCheck'),
              item('Nach Updates suchen …', 'checkUpdates'),
              { type: 'separator' },
              { role: 'services', label: 'Dienste' },
              { type: 'separator' },
              { role: 'hide', label: 'Notiva ausblenden' },
              { role: 'hideOthers', label: 'Andere ausblenden' },
              { role: 'unhide', label: 'Alle einblenden' },
              { type: 'separator' },
              { role: 'quit', label: 'Notiva beenden' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'Ablage',
      submenu: [
        item('Neue Seite', 'newPage', 'CmdOrCtrl+N'),
        item('Heute (Tagesnotiz)', 'today', 'CmdOrCtrl+Shift+D'),
        item('Aus Vorlage …', 'templates'),
        { type: 'separator' },
        item('Speichern', 'save', 'CmdOrCtrl+S'),
        { type: 'separator' },
        item('Ordner öffnen …', 'openFolder', 'CmdOrCtrl+O'),
        item('Ordner schließen', 'closeFolder'),
        ...(mac
          ? []
          : [
              { type: 'separator' } as const,
              item('Einstellungen …', 'settings', 'CmdOrCtrl+,'),
              { role: 'quit', label: 'Beenden' } as const,
            ]),
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        // Text: the usual undo; PDF: highlights, ink, notes (src/app/undo.ts).
        item('Widerrufen', 'undo', 'CmdOrCtrl+Z'),
        item('Wiederholen', 'redo', 'Shift+CmdOrCtrl+Z'),
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { role: 'selectAll', label: 'Alles auswählen' },
        { type: 'separator' },
        item('Suchen …', 'search', 'CmdOrCtrl+K'),
      ],
    },
    {
      label: 'Darstellung',
      submenu: [
        item('Seitenleiste', 'toggleSidebar', 'CmdOrCtrl+\\'),
        item('KI-Assistent', 'assistant', 'CmdOrCtrl+J'),
        item('Änderungen (Git)', 'git', 'CmdOrCtrl+Shift+G'),
        item('Benachrichtigungen', 'notifications'),
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' } as const, { role: 'reload' } as const]),
      ],
    },
    {
      label: 'Gehe zu',
      submenu: [
        item('Zurück', 'back', 'CmdOrCtrl+['),
        item('Vorwärts', 'forward', 'CmdOrCtrl+]'),
        { type: 'separator' },
        item('Mein Semester', 'semester'),
        item('Studium', 'studyDashboard'),
        item('Noten & Leistungen', 'grades'),
        item('Moodle-Kurse', 'moodle'),
        item('Ablage', 'shelf'),
      ],
    },
    {
      label: 'Studium',
      submenu: [
        item('Alles synchronisieren', 'syncAll'),
        { type: 'separator' },
        item('Moodle jetzt abrufen', 'fetchMoodle'),
        item('eCampus-Noten jetzt abrufen', 'fetchEcampus'),
        item('Prüfungsplan prüfen', 'examPlan'),
        { type: 'separator' },
        item('Studium aktualisieren …', 'syncStudy'),
        item('Einrichtung prüfen', 'setupCheck'),
      ],
    },
    { role: 'windowMenu', label: 'Fenster' },
    {
      label: 'Hilfe',
      role: 'help',
      submenu: [
        item('So funktioniert Notiva', 'help'),
        item('Stundenplan', 'timetable'),
        item('Nach Updates suchen …', 'checkUpdates'),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
