# Fortschritt

Stand der Entwicklung, nach Meilensteinen. ✅ fertig · 🚧 in Arbeit · ⏳ geplant

## M1 – Gerüst & Werkzeuge ✅

- Vite + React 19 + TypeScript (strict), Tailwind 4, ESLint (kein `eval`), Prettier, Vitest

## M2 – Kern-Logik (`src/lib`) 🚧

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
- ⏳ `templates` – Vorlagen & Pakete

## M3 – App-Oberfläche & Block-Editor ⏳

## M4 – Datenbank-Ansichten ⏳

## M5 – Dashboards, Vorlagen, Studien-Dashboard ⏳

## M6 – Electron ⏳

## M7 – E2E-, Layout-, Sicherheitstests, Feinschliff ⏳
