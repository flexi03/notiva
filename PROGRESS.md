# Fortschritt

Stand der Entwicklung, nach Meilensteinen. ✅ fertig · 🚧 in Arbeit · ⏳ geplant

## M1 – Gerüst & Werkzeuge ✅

- Vite + React 19 + TypeScript (strict), Tailwind 4, ESLint (kein `eval`), Prettier, Vitest

## M2 – Kern-Logik (`src/lib`) ✅

- ✅ `path` – sichere Vault-Pfade, Dateinamen für alle Plattformen
- ✅ `frontmatter` – YAML sicher lesen/schreiben (core-Schema, Alias-Limit, kein Prototype Pollution)
- ✅ `links` – Wiki-Links, Tags, Umbenennen
- ✅ `blocks` – Markdown in Blöcke zerlegen/zusammensetzen (Quelltext bleibt exakt)
- ✅ `markdown` – Rendering (Wiki-Links, Tags, Callouts, Aufgaben, KaTeX, Code) + DOMPurify
- ✅ `vault` – Adapter: Speicher, Ordner/OPFS, Electron; Pfad-Wächter
- ✅ `workspace` – Index, Seitenbaum, Link-Auflösung, Backlinks, Suche, Umbenennen (nur betroffene Links), Papierkorb
- ✅ `formula` – sichere Formeln ohne `eval` (Tests fanden und schlossen Lücke über geerbte Schlüssel wie `constructor`)
- ✅ `database` – Schema, Relationen/Rollups, Filter, Sortierung, Gruppierung, Aggregation (u. a. gewichteter Schnitt)
- ✅ `dates` – Datumshilfen
- ✅ `templates` – Platzhalter (`{{date+7}}`, `{{title|yaml}}`), Seitenvorlagen, Pakete
- ✅ `widgets` – `notiva`-Codeblöcke: Kacheln (Wert, Fortschritt, Countdown, Liste, Link, Text, Semesterwoche) und Ansichten
- ✅ `packs` – Studien-Dashboard (5 verknüpfte Datenbanken, Beispieldaten, Vorlagen), Projekte, Tagebuch, Leseliste

## M3 – App-Oberfläche & Block-Editor ⏳

## M4 – Datenbank-Ansichten ⏳

## M5 – Dashboards, Vorlagen, Studien-Dashboard ⏳

## M6 – Electron ✅

- Sicherer Hauptprozess: contextIsolation, Sandbox, kein Node im Renderer, `app://`-Protokoll mit CSP,
  Navigation/neue Fenster gesperrt, Berechtigungen abgelehnt, IPC nur vom eigenen Fenster
- `FsVault`: Zugriff nur im gewählten Ordner (auch gegen Symlink-Ausbrüche), atomares Schreiben
- Dateiüberwachung: Änderungen von außen (iCloud, Syncthing, Git, andere Editoren) erscheinen sofort
- macOS-Fensterleiste integriert; Pakete per `npm run dist:mac|win|linux` (electron-builder)
- E2E mit der echten Desktop-App (Abschottung, echte Dateien, Live-Änderungen, Pfad-Angriffe)

## M7 – E2E-, Layout-, Sicherheitstests, Feinschliff ⏳

- ✅ Doku: README, AGENT.md, docs/ (Architektur, Dateiformat, Sicherheit, Design), GitHub-CI

## M8 – Vorschau, Minimap, KI ✅

- ✅ Vorschau (Peek): Karten, Tabellenzeilen, Kacheln und Relationen öffnen als Seitenfenster; ⌘/Strg-Klick oder
  Einstellung „Als ganze Seite“ öffnet ganz; Umbenennen/Löschen in der Vorschau wird nachgeführt
- ✅ Seitenrand: Minimap mit Textmarker-Ansicht, Sprung zu Überschriften, Lese- und Aufgabenfortschritt
- ✅ KI-Werkzeuge (`src/lib/ai`): 16 Werkzeuge mit Schema-Validierung, gemeinsam für MCP und App
- ✅ MCP-Server (stdio, offizielles SDK), Nur-Lesen-Modus, in der Desktop-App mitgeliefert (startet ohne Node)
- ✅ Assistent in der App: Ollama/LM Studio (kostenlos, lokal), OpenRouter, Anthropic, OpenAI-kompatibel;
  Rückfrage vor Löschen, Nur-Lesen-Schalter, Antworten ohne Bilder aus dem Netz
- ✅ Fehler gefunden und behoben: Aufzählungen ohne Punkte (Tailwind-Reset), Dateinamen aus Titeln wie `../x`
  begannen mit Leerzeichen

## Ideen für später ⏳

- Synchronisation zwischen Geräten ohne Fremddienst (z. B. eigener Sync-Server auf dem Mac mini)
- Import aus Notion-Export (Markdown + CSV), Export als HTML/PDF-Paket
- Graph-Ansicht der Links, Timeline-Ansicht, wiederkehrende Aufgaben
- Mobile Native-Hüllen (Capacitor) für App-Store-Builds
- KI: Antworten streamen, Chatverläufe speichern, Kontext „markierter Text“, Vorschläge direkt im Editor
- Code-Splitting (KaTeX/highlight.js nachladen) für schnelleren ersten Start
