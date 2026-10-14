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

## KI

```
  Assistent (src/components/ai, src/app/assistant.ts)        MCP-Client (Claude Desktop/Code …)
           │ runAgent (src/lib/ai/agent.ts)                            │ stdio
           │   ModelProvider: Anthropic | OpenAI-kompatibel            ▼
           │   HttpClient: fetch (Browser) | ai:request (Electron)   mcp/server.ts
           └──────────────┐                              ┌───────────┘
                          ▼                              ▼
               TOOLS + runTool (src/lib/ai/tools.ts) – Validierung, nur über Workspace
```

- **Ein Werkzeugkasten für beide Wege:** `TOOLS` beschreibt Werkzeuge mit JSON-Schema, `readOnly`- und
  `destructive`-Markierung. Der MCP-Server und der Assistent nutzen dieselben Definitionen.
- **Anbieterneutral:** `Message`/`Part` (Text, Werkzeugaufruf, Ergebnis) werden pro Anbieter übersetzt; HTTP wird
  hineingereicht und ist dadurch in Tests ersetzbar.
- **KI-Programme:** `electron/aiCli.ts` startet Claude Code mit dem mitgelieferten MCP-Server (nur Notiva-Werkzeuge);
  `src/lib/ai/claudeStream.ts` übersetzt dessen `stream-json`-Ausgabe in dieselben Chat-Nachrichten wie der API-Weg.
  Der System-Prompt ist eine Vorlage (`DEFAULT_PROMPT`, eigene Vorlage mit Platzhaltern, `renderPrompt`).
- **MCP-Server:** `mcp/main.ts` → `dist-mcp/notiva-mcp.mjs` (esbuild). Lädt den Workspace über `FsVault` und liest vor
  jedem Aufruf geänderte Dateien neu ein. Die Desktop-App liefert ihn mit und startet ihn als Node-Prozess
  (`ELECTRON_RUN_AS_NODE`).

## Git

```
GitPanel / Randmarkierungen / Seitenbaum ── useGit (src/app/git.ts) ── Brücke git:* ── electron/git.ts (git-CLI)
                     └── src/lib/diff.ts (Myers-Diff, lineMarkers, blockChanges, toHunks)
```

Der Hauptprozess liefert nur Status, Dateistände (`git show`) und Aktionen; Diffs und Markierungen rechnet die App
selbst aus Datei und HEAD-Stand – dadurch aktualisieren sie sich nach jedem Speichern.

## Vorschau und Seitenrand

- `openEntry` (Store) öffnet Inhalte (Karten, Zeilen, Kacheln, Relationen) im `Sheet`; `PageContent` ist die
  gemeinsame Seitenansicht für Seite und Vorschau. Der scrollende Container kommt über `ScrollRootContext`.
- `PageRail` zeichnet die Seite auf ein Canvas: `minimapShapes.ts` tastet Textzeilen (Range-Rechtecke), Überschriften,
  Links, Markierungen, Kacheln, Checkboxen und Git-Markierungen ab; Messen nur bei Änderungen, Scrollen ist billig.
- Überschriften kommen über das `data-rail`-Attribut; die Geometrie (Skalierung, sichtbarer Bereich, Fortschritt)
  steckt in `src/lib/minimap.ts`.

## Entscheidungen

| Entscheidung                                                | Grund                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Markdown-Ordner statt Datenbank                             | Daten bleiben lesbar, portabel, mit beliebigem Sync nutzbar        |
| Block-Editor über Markdown-Quelltext (statt WYSIWYG-Modell) | verlustfreie Rundreise, eigene Syntax (Kacheln) bleibt erhalten    |
| Datenbank = Seite + Ordner                                  | Einträge sind normale Seiten mit Inhalt, Links und Backlinks       |
| Widgets als `notiva`-Codeblöcke                             | in anderen Editoren lesbar, kein proprietäres Format               |
| Electron statt Tauri                                        | kein Rust nötig; Sicherheit über Sandbox + schmale Brücke          |
| KI optional, anbieterneutral, lokal möglich                 | kostenlos mit Ollama/LM Studio; kein Zwang zu einem Dienst         |
| Offizielles MCP-SDK (gebündelt)                             | Protokoll-Details/Versionen gepflegt; eine Datei ohne Installation |
