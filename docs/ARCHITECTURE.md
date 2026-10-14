# Architektur

```
            ┌──────────────── React (src/components, src/screens) ────────────────┐
            │  Block-Editor · Datenbank-Ansichten · Kacheln · Suche · Einstellungen │
            └───────────────▲──────────────────────────────┬───────────────────────┘
                 useWorkspace() (Version)          Workspace-Methoden (schreiben)
            ┌───────────────┴──────────────────────────────▼───────────────────────┐
            │ Workspace (src/lib/workspace.ts) – Index: Seiten, Baum, Links,         │
            │ Backlinks, Tags, Suche (MiniSearch), Datenbankzeilen, Papierkorb      │
            └───────────────▲──────────────────────────────┬───────────────────────┘
                     reine Logik: frontmatter, blocks, markdown, database, formula, widgets
            ┌───────────────┴──────────────────────────────▼───────────────────────┐
            │ guardVault → VaultAdapter: Memory · Directory (Ordner/OPFS) · Electron │
            └──────────────────────────────────────────────┬───────────────────────┘
                                                IPC (preload) ▼
                                     electron/main.ts → FsVault (Dateisystem)
```

- **Eine Quelle der Wahrheit:** die Dateien. Der Workspace ist ein Index darüber und wird bei Änderungen von
  außen neu aufgebaut (Electron: Dateiüberwachung, Browser-Ordner: beim Fokussieren). Unveränderte Dateien
  (gleiche mtime) werden nicht erneut gelesen.
- **Block-Editor:** `splitBlocks` zerlegt den Text anhand der markdown-it-Zeilenzuordnung in Blöcke; ein Block wird
  roh bearbeitet, die anderen gerendert. `joinBlocks` setzt zusammen. Speichern ist entprellt und wird beim
  Verlassen erzwungen.
- **Datenbanken:** `rowValues` berechnet Werte (Typen, Rollups über Relationen, Formeln), `applyFilters` /
  `applySorts` / `groupRows` / `aggregate` sind reine Funktionen, die Ansichten und Kacheln gemeinsam nutzen.
- **Zustand:** zustand-Store für App-Zustand (offener Vault, Route, Einstellungen, Dialoge); Workspace-Änderungen
  über `useSyncExternalStore`.
- **Plattformen:** gleiche Web-App überall; Electron lädt sie über `app://notiva/`. Hash-Routing funktioniert in
  allen Umgebungen gleich.

## Entscheidungen

| Entscheidung                                                | Grund                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| Markdown-Ordner statt Datenbank                             | Daten bleiben lesbar, portabel, mit beliebigem Sync nutzbar     |
| Block-Editor über Markdown-Quelltext (statt WYSIWYG-Modell) | verlustfreie Rundreise, eigene Syntax (Kacheln) bleibt erhalten |
| Datenbank = Seite + Ordner                                  | Einträge sind normale Seiten mit Inhalt, Links und Backlinks    |
| Widgets als `notiva`-Codeblöcke                             | in anderen Editoren lesbar, kein proprietäres Format            |
| Electron statt Tauri                                        | kein Rust nötig; Sicherheit über Sandbox + schmale Brücke       |
