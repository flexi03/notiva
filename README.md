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
- 🌿 **Git eingebaut** (Desktop-App): neue und geänderte Seiten, Markierungen pro Zeile, Diff, Commit, Verlauf, Push/Pull
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

Rechts in der Werkzeugleiste ✨ oder `⌘/Strg J` – beim ersten Öffnen schlägt Notiva vor, was gefunden wurde.

**Mit einem installierten KI-Programm (Desktop-App, empfohlen):** Ist **Claude Code** installiert, reicht ein Klick
auf _Claude Code verwenden_. Notiva startet es mit deinem Login (z. B. Opus 5.5 über `opus`) und gibt ihm
**nur die Notiva-Werkzeuge** – keine Shell, keine Dateien außerhalb des Ordners; Löschen ist dort nicht freigegeben.
Gespräche werden fortgesetzt (`--resume`). Codex CLI und Google Antigravity (`agy`) werden ebenfalls erkannt (experimentell,
ohne Notiva-Werkzeuge).

**Direkt über eine API:** Ollama/LM Studio (kostenlos, lokal), OpenRouter, Anthropic, OpenAI-kompatibel –
_Einstellungen → KI → Direkt über API_. Im Browser muss Ollama Anfragen der Seite erlauben:
`OLLAMA_ORIGINS=http://localhost:5173 ollama serve`.

**Prompt:** _Prompt anzeigen_ (im Assistenten) oder _Einstellungen → Prompt_: der fest eingebaute Standard, ein
eigener Prompt mit Platzhaltern (`{{heute}}`, `{{seite}}`, `{{rechte}}`, `{{sprache}}`) und live, was genau
gesendet wird. Unter jeder Nachricht zeigt _Gesendet_ System-Prompt, Befehl und das antwortende Modell.

Im Editor öffnet `/ki` den Assistenten mit dem aktuellen Absatz als Bezug.

**Per MCP (Claude Desktop, Claude Code, …):** _Einstellungen → MCP-Server_ zeigt die fertige Konfiguration zum
Kopieren. In der Desktop-App startet die App selbst den Server (kein Node nötig). Ohne Desktop-App:

```bash
npm run mcp:build
claude mcp add notiva -- node /pfad/zu/notiva/dist-mcp/notiva-mcp.mjs /pfad/zu/deinem/ordner
# nur lesen: … notiva-mcp.mjs /pfad/zu/deinem/ordner --read-only
```

## Git

Liegt dein Ordner in einem Git-Repository (oder _Git einrichten_), zeigt die Desktop-App rechts unter
_Änderungen_ (`⌘/Strg ⇧ G`) alle neuen, geänderten und gelöschten Seiten mit +/− Zeilen, einen Diff
(untereinander oder nebeneinander), Commit ausgewählter Dateien, Verwerfen, Verlauf und Push/Pull. Im Editor
markiert ein farbiger Rand geänderte (blau), neue (grün) und gelöschte (rot) Stellen – wie in VS Code; der
Seitenbaum zeigt `M`/`U`.

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
