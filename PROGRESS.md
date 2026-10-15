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

## M9 – Git, KI-Programme, Prompt, Schreiben ✅

- ✅ Minimap im Detail (Canvas): Textzeilen, Überschriften, Links, Markierungen, Kacheln, Checkboxen, Git
- ✅ Schreiben: ganze Blockfläche klickbar und sichtbar, bearbeiteter Block eingerahmt, Einfügelinie zwischen Blöcken,
  „Hier klicken, um weiterzuschreiben“
- ✅ Rechte Werkzeugleiste wie VS Code (Assistent, Änderungen)
- ✅ Git: Status, +/− pro Datei, Diff (untereinander/nebeneinander), Commit, Verwerfen, Verlauf, Pull/Push,
  Randmarkierungen im Editor, Buchstaben im Seitenbaum
- ✅ KI über installierte Programme: Claude Code (nur Notiva-Werkzeuge via MCP, Sitzungen fortsetzen),
  Codex/Gemini erkannt (experimentell); Ein-Klick-Einrichtung
- ✅ Prompt: fester Standard, eigener Prompt mit Platzhaltern, Live-Vorschau, „Gesendet“ je Nachricht; `/ki` im Editor
- ✅ Fehler gefunden und behoben: E2E-Profil der Desktop-App teilte den Browser-Speicher mit dem echten Profil

## M10 – Studium mit Moodle, PDFs und Vorlesungen ✅

- ✅ Git-Diffs nur echte Änderungen: Frontmatter formattreu gespeichert, Wort-Hervorhebung im Diff
- ✅ KI und Änderungen links oder rechts (Drag & Drop, Knopf), Werkzeugleiste links wie VS Code
- ✅ KI passt Dashboards an: Format-Hilfe, Kacheln lesen/ändern (geprüft), Datenbanken erweitern, Dateien lesen (PDF-Text)
- ✅ Moodle: Uni-Login wie die Moodle-App (Microsoft/SSO, 2FA, Passkeys im Fenster aus), Benutzername, Token oder
  Kalender-Link; Zugang verschlüsselt im Profil; Kurse/Abgaben ins Dashboard (Vorschau, keine Doppelten)
- ✅ Kursübersicht und Unterlagen je Kurs: öffnen in Notiva oder im Browser, Dateien in den Ordner speichern
- ✅ Benachrichtigungscenter: Moodle wird regelmäßig abgefragt (neue Abgaben, Termine, Unterlagen, Mitteilungen,
  Bewertungen), Erinnerungen an Fristen, Systemmitteilungen
- ✅ PDF-Viewer: markieren, kommentieren, „KI erklären“, Stift, Haftnotizen, Text auf der Seite, Notiz pro Seite –
  alles in einer Notizseite neben dem PDF
- ✅ Vorlesungsmodus: Aufnahme, Transkript lokal mit whisper.cpp (von Notiva eingerichtet) oder per API (OpenAI mit
  Sprechern, Groq), Folien folgen automatisch, Mitschrift-Seite, Zusammenfassung durch den Assistenten
- ✅ Automatisch speichern an/aus (Standard an), ⌘S
- ✅ Git: automatische Commit-Nachricht mit allen Änderungen
- ✅ Moodle-Unterlagen werden automatisch in den Ordner gespeichert; Fortschrittsanzeige für längere Vorgänge
- ✅ eCampus (HISinOne): Noten/Leistungen per Microsoft-Login, Hintergrundprüfung, Benachrichtigung, Übernahme in
  die Module, Seite „Noten & Leistungen“
- ✅ Fehler gefunden und behoben: leere Zeile nach Frontmatter ging verloren; eingeklappte Seitenleiste lag über der
  linken Leiste; Fensterknöpfe (macOS) auf der Trennlinie; scrollIntoView-Promise als Effekt-Rückgabe riss die
  Oberfläche ab; Anmerkungsebene vor Screenreadern versteckt; Whisper-Server überlebte die App

## M11 – Studium nach Prüfungsordnung ✅

- eCampus: Modul- und Summenzeilen, alle Versuche je Modul, Semester des Bestehens; Anmeldung bleibt
  14 Tage und wird still über die Hochschul-Anmeldung erneuert; eine Notiva pro Profil
- `src/lib/study/`: Semester (`terms`), Katalog BMI PO 2018 (`catalog`), Zuordnung (`match`), Stand je Modul
  (`state`), Abgleich des Studienordners (`sync`); Filter `@semester`, Vorlage `{{semester}}`, Widget `related`
- Moodle-Kursinfos (`moodleInfo`): Beschreibung, Abschnitte, Seiten, Ankündigungen → Kursseiten, Meldungen
- Prüfungsplan (`examPlan`): neuestes PDF finden, Tabelle aus Textpositionen, Termine der offenen Module
- Prüfintervalle je Quelle, PDF-Zoom (Pinch, ⌘+Mausrad), Einstellungen in Reitern, Papierkorb/Einstellungen oben rechts
- Benachrichtigungen mit Ziel (aufklappen, zum Inhalt), „Neu seit dem letzten Abruf“ und Einrichtungshinweise unten links,
  Studium anlegen mit einem Klick, eigene Semester, Menüleiste (⌘, ⌘[ ⌘]), Zurück/Vorwärts, Papierkorb/Einstellungen
  verschiebbar, Antigravity (`agy`) statt Gemini CLI
- Offen: Moodle-Studydashboard (LTI) nicht angebunden; weitere Studiengänge/POs als Katalog ergänzen

- ✅ Hochschul-Profil `Studium/Hochschule.md`: Moodle, eCampus, Prüfungsplan, Studiengang oder eigene Module pro Uni
  (Standard HSD, [docs/HOCHSCHULE.md](docs/HOCHSCHULE.md))
- ✅ Öffentliches Repo vorbereitet: README de/en mit Bildern (`scripts/screenshots.mjs`), Anleitung/Guide,
  `examples/` (Beispielordner, Profil einer anderen Uni), `.gitignore` für Persönliches

## Ideen für später ⏳

- Sprechertrennung lokal (z. B. pyannote/sherpa-onnx), Audio-Wiedergabe synchron zum Transkript

- Synchronisation zwischen Geräten ohne Fremddienst (z. B. eigener Sync-Server auf dem Mac mini)
- Import aus Notion-Export (Markdown + CSV), Export als HTML/PDF-Paket
- Graph-Ansicht der Links, Timeline-Ansicht, wiederkehrende Aufgaben
- Mobile Native-Hüllen (Capacitor) für App-Store-Builds
- KI: Antworten streamen, Chatverläufe speichern, Kontext „markierter Text“, Vorschläge direkt im Editor
- Code-Splitting (KaTeX/highlight.js nachladen) für schnelleren ersten Start
