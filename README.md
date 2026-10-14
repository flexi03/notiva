# Notiva

**Freie, lokale Notion-Alternative auf Markdown-Basis.** Seiten, Datenbanken mit Tabellen-, Board-, Kachel-,
Listen- und Kalenderansicht, Dashboards mit Kacheln, Vorlagen – und alles liegt als normale Markdown-Dateien
in einem Ordner, der dir gehört.

- 📝 **Block-Editor** wie Notion – aber jeder Block ist echtes Markdown (`/`-Befehle, `[[Links]]`, Aufgaben, Callouts, Formeln, Code)
- 🗂️ **Datenbanken** als Ordner voller Markdown-Dateien – Eigenschaften, Formeln, Relationen, Rollups, Filter, Sortierung, Gruppierung
- 🧩 **Kacheln & Dashboards** – Kennzahlen, Fortschritt, Countdown, Listen, Links, eingebettete Ansichten
- 🎓 **Studien-Dashboard** – Semester, Module, Noten (gewichteter Schnitt), ECTS, Prüfungen, Aufgaben, Stundenplan
- 💻📱 **Überall**: Desktop-App (macOS, Windows, Linux) und installierbare Web-App (auch iPhone/iPad, Android)
- 🔒 **Privat & sicher**: kein Konto, keine Cloud, keine Telemetrie; alles offline
- 🤖 **KI, wenn du willst**: Assistent in der App (kostenlos und lokal mit Ollama/LM Studio, oder mit eigenem Schlüssel)
  und ein **MCP-Server** für Claude Desktop, Claude Code & Co. – beide mit denselben, abgesicherten Werkzeugen
- 👀 **Vorschau & Minimap**: Karten und Einträge öffnen als Seitenfenster; am Rand Minimap mit Lese- und Aufgabenfortschritt
- 🎨 **Anpassbar**: Farben, Schrift, Breite, Sprache (DE/EN), eigenes CSS, eigene Vorlagen – und der Quelltext (MIT)

## Loslegen

```bash
npm install
npm run dev          # Web-App unter http://localhost:5173
npm run electron     # Desktop-App
```

Beim ersten Start wählst du, wo deine Notizen liegen:

| Speicher    | Wo                                                              | Plattform                                  |
| ----------- | --------------------------------------------------------------- | ------------------------------------------ |
| **Ordner**  | ein normaler Ordner (mit iCloud/Syncthing/Git synchronisierbar) | Desktop-App, Chrome/Edge                   |
| **Browser** | privater Speicher des Browsers (OPFS)                           | alle modernen Browser, auch Safari auf iOS |
| **Demo**    | nur im Arbeitsspeicher, mit Studien-Dashboard                   | überall                                    |

Als Web-App installieren: im Browser „Zum Home-Bildschirm“ bzw. „App installieren“.
Desktop-Pakete bauen: `npm run dist:mac` · `npm run dist:win` · `npm run dist:linux` (Ausgabe in `release/`).

## Studium planen in 3 Schritten

1. **Vorlagen → Studien-Dashboard → Verwenden.** Ordnername, Studiengang, ECTS-Ziel und Vorlesungszeit eintragen.
2. **Module pflegen:** im Dashboard auf _Module_ → _＋ Neu_. ECTS, Semester und nach der Prüfung _Note_ + _Status: Bestanden_ setzen.
3. **Fertig:** Notenschnitt (nach ECTS gewichtet), ECTS-Fortschritt, nächste Prüfung und fällige Aufgaben rechnen sich selbst.

Vorlesungsnotizen und Lernzettel: _Neue Seite_ → Vorlage _Vorlesungsnotiz_ oder _Lernzettel_.

## KI nutzen

**In der App:** _Einstellungen → KI_ → Anbieter wählen → _Verbindung testen_ → _Speichern_. Dann `⌘/Strg J` oder ✨ oben rechts.

| Anbieter                | Kosten                   | Hinweis                                                                  |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------ |
| **Ollama**, LM Studio   | kostenlos, lokal         | z. B. `ollama pull qwen2.5`; Modell muss Werkzeuge (Tool Calling) können |
| OpenRouter              | teils kostenlose Modelle | API-Schlüssel nötig                                                      |
| Anthropic, OpenAI u. a. | nach Verbrauch           | eigener API-Schlüssel                                                    |

Der Assistent sucht und liest Seiten, fragt Datenbanken ab (z. B. „Was ist diese Woche fällig?“), legt Seiten und
Einträge an und ändert Text gezielt. Löschen und Überschreiben fragt immer nach; mit „Darf Seiten ändern: aus“
liest er nur. Einstellungen und Schlüssel bleiben auf dem Gerät (nicht im Ordner).
Im Browser muss Ollama Anfragen der Seite erlauben: `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`.

**Per MCP (Claude Desktop, Claude Code, …):** _Einstellungen → MCP-Server_ zeigt die fertige Konfiguration zum
Kopieren. In der Desktop-App startet die App selbst den Server (kein Node nötig). Ohne Desktop-App:

```bash
npm run mcp:build
claude mcp add notiva -- node /pfad/zu/notiva/dist-mcp/notiva-mcp.mjs /pfad/zu/deinem/ordner
# nur lesen: … notiva-mcp.mjs /pfad/zu/deinem/ordner --read-only
```

## Wie die Dateien aussehen

```
Studium.md                  ← Dashboard (Kacheln stehen als YAML-Block im Markdown)
Studium/Module.md           ← Datenbank: Schema und Ansichten im Kopfbereich
Studium/Module/Analysis I.md
```

```markdown
---
Status: Bestanden
ECTS: 9
Note: 2.3
Semester: ['[[1. Semester]]']
---

## Inhalte

- Folgen und Reihen
```

Alle Details: [docs/FORMAT.md](docs/FORMAT.md).

## Tastenkürzel

|                        |                                        |
| ---------------------- | -------------------------------------- |
| `⌘/Strg K`             | Suchen & Seite öffnen/anlegen          |
| `⌘/Strg N`             | Neue Seite                             |
| `⌘/Strg ⇧ D`           | Tagesnotiz                             |
| `⌘/Strg \`             | Seitenleiste                           |
| `⌘/Strg J`             | KI-Assistent                           |
| `⌘/Strg`-Klick         | Eintrag ganz statt als Vorschau öffnen |
| `/`                    | Befehle im Editor                      |
| `[[`                   | Seite verlinken                        |
| `⌘/Strg B · I · E · K` | fett · kursiv · Code · Link            |
| `⌘/Strg ⇧ H`           | ==Textmarker==                         |
| `Esc` / `⌘↵`           | Block fertig                           |

## Entwicklung

```bash
npm run check        # Typen, Lint, Unit-Tests
npm test             # Vitest (Logik, Sicherheit, Dateisystem)
npm run test:e2e     # Playwright: Desktop, Tablet, iPhone (WebKit) und Electron
```

Aufbau, Regeln und Konventionen: [AGENT.md](AGENT.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DESIGN.md](docs/DESIGN.md) · [docs/SECURITY.md](docs/SECURITY.md) · Fortschritt: [PROGRESS.md](PROGRESS.md)

## Lizenz

[MIT](LICENSE) – frei nutzbar, veränderbar und weitergebbar.
