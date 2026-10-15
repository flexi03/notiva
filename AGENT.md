# Notiva – Hinweise für Agents und Entwickler

Notiva ist eine lokale Notion-Alternative: Web-App (PWA) und Electron-Desktop-App aus **einem** React-Code.
Alle Daten sind Markdown-Dateien in einem Ordner („Vault“). Kein Server, kein Konto.

## Die wichtigsten Regeln

1. **Die Dateien gehören dem Nutzer.** Notiva darf Markdown nie unnötig umformatieren. Der Block-Editor ändert
   nur den bearbeiteten Block; unbekannte Frontmatter-Schlüssel bleiben erhalten. Neue Formate in
   [docs/FORMAT.md](docs/FORMAT.md) dokumentieren und abwärtskompatibel halten.
2. **Alle Schreibzugriffe über `Workspace`** (`src/lib/workspace.ts`). Komponenten rufen nie Adapter direkt auf.
   So bleiben Index, Links und Dateien konsistent (Umbenennen passt Links _und_ Pfadverweise an).
3. **Eingaben aus Dateien sind nicht vertrauenswürdig.** YAML, Datenbank-Schemas, Widgets und Einstellungen
   werden validiert (`parse*`-Funktionen); HTML nur über `renderMarkdown` (DOMPurify). Kein `eval`/`Function`
   (ESLint-Regel). Details: [docs/SECURITY.md](docs/SECURITY.md).
4. **Vor jedem Commit:** `npm run check`; bei UI-Änderungen zusätzlich `npm run test:e2e`.

## Wiederverwendbarkeit

- `src/lib/` – **reine Logik ohne React**, jede Datei mit Tests in `src/lib/__tests__/`.
  Neue Rechen-, Format- oder Datenlogik gehört hierhin.
- `src/components/ui/` – **das Design-System**. Seiten bauen nur daraus; keine Einzel-Stile für Buttons,
  Felder, Menüs, Dialoge. Regeln: [docs/DESIGN.md](docs/DESIGN.md).
- KI-Werkzeuge nur in `src/lib/ai/tools.ts` definieren – Assistent und MCP-Server bekommen sie automatisch.
  Neue Werkzeuge: Schema, `readOnly`/`destructive` setzen, Tests in `ai-tools.test.ts`.
- Gleiche Aufgabe → gleiche Komponente: `PropertyCell` (alle Eigenschaften überall), `pageMenuItems`
  (Seitenmenü in Leiste und Kopf), `useDatabase` (alle Ansichten), `usePageActions` (Seitenaktionen),
  `useApp().ask` (Eingabe-/Bestätigungsdialog – nie `window.prompt/confirm`).
- Texte nur über `t('…')` (`src/i18n/de.ts` ist die Quelle, `en.ts` muss jeden Schlüssel haben – prüft tsc).

## Aufbau

```
src/lib/            path, frontmatter, links, blocks, markdown, plainText, editing, formula, database, dates,
                    templates, widgets, settings, route, minimap, workspace, moodle (Import-Plan), moodleInfo, ecampus, examPlan,
                    study/ (Semester, PO-Katalog, Zuordnung, Abgleich des Studienordners), pdfText, vault/ (Adapter), packs/ (Vorlagen),
                    ai/ (Werkzeuge, Agent, Anbieter – gemeinsam für Assistent und MCP)
src/i18n/           de.ts (Quelle), en.ts, t()
src/app/            store.ts (zustand: Workspace, Route, Einstellungen, Dialoge, Vorschau), vaults.ts (Speicher öffnen),
                    assistant.ts (KI-Chat: API oder CLI, Prompt, Einstellungen auf dem Gerät),
                    git.ts (Git-Status, Diffs, Randmarkierungen), hooks/ (useTheme, usePageActions)
src/components/     ui/ (Design-System), layout/ (Shell, Seitenleiste, Topbar), editor/ (Block-Editor,
                    Seitenansicht, Minimap), database/ (Ansichten, Zellen, Schema), widgets/ (Kacheln, Einbettungen),
                    ai/ (Assistent, Prompt-Editor), git/ (Änderungen, Diff), layout/ (u. a. ActivityBar links/rechts, SidePanel;
                    Seite je Ansicht in `useApp().viewSides`, pro Gerät gespeichert)
src/screens/        Start, Tag, Suche, Neue Seite, Vorlagen, Papierkorb, Einstellungen, Willkommen
electron/           main.ts (sicherer Hauptprozess), preload.ts (Brücke), vaultFs.ts (Dateizugriff, auch für MCP),
                    aiRequest.ts (geprüfte KI-Anfragen), aiCli.ts (Claude Code & Co.), git.ts (git-CLI), moodle.ts (Moodle-Zugang),
                    shellPath.ts (PATH der Login-Shell)
mcp/                MCP-Server (server.ts + Tests, main.ts = CLI) → npm run mcp:build
e2e/                Playwright: Abläufe, Layout, Barrierefreiheit, Sicherheit, Electron (inkl. Git und CLI mit
                    simuliertem `claude` in e2e/fixtures/fake-cli)
```

## Tests

| Befehl                                   | Was                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm test`                               | Vitest: Logik, Formeln, Datenbank, Workspace, Pakete (Studien-Dashboard End-to-End), Sicherheit |
| `npm run test:e2e`                       | Playwright: Desktop/Tablet (Chromium), iPhone (WebKit), Electron                                |
| `npx playwright test --update-snapshots` | Screenshot-Referenzen nach gewollten Design-Änderungen erneuern                                 |

Lokal nutzt Playwright einen schon laufenden Preview-Server weiter: nach Änderungen vorher
`npm run build && npm run electron:build && npm run mcp:build` ausführen.
E2E-Tests frieren die Uhr auf den 14.10.2026 ein (`e2e/helpers.ts`), damit Kacheln und Screenshots stabil sind.
In der Demo liegt alles im Speicher: in Tests mit `go(page, '#/…')` navigieren, nicht mit `page.goto`.

## Konventionen

- TypeScript strict, Prettier (`npm run format`), Commit-Nachrichten auf Englisch (ohne Claude-Session-Link), ein Commit pro Feature/Meilenstein.
- Beispieldaten ohne echte Personen; Module/Prüfungen sind generisch.
- Neue Vorlagen-Pakete: `src/lib/packs/`, in `TEMPLATE_PACKS` eintragen, `packs.test.ts` prüft automatisch,
  dass jedes Paket ohne YAML-Fehler installierbar ist.

## Release

1. Version in `package.json` erhöhen (SemVer), Eintrag in `CHANGELOG.md`.
2. Commit, dann `git tag vX.Y.Z && git push origin main vX.Y.Z`.
3. `.github/workflows/release.yml` baut macOS (arm64), Windows und Linux und hängt die Dateien an das Release.
   Die App (`electron/updater.ts`) findet sie über die GitHub-API und aktualisiert sich selbst
   (Dateinamen `Notiva-<version>-<os>-<arch>.<ext>`, siehe `pickAsset` in `src/lib/update.ts`).
