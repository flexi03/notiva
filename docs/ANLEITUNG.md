# Anleitung

Alles, was über den Einstieg im [README](../README.md) hinausgeht. English: [GUIDE.en.md](GUIDE.en.md).

## Speicherorte

| Speicher    | Wo                                                              | Plattform                                  |
| ----------- | --------------------------------------------------------------- | ------------------------------------------ |
| **Ordner**  | ein normaler Ordner (mit iCloud/Syncthing/Git synchronisierbar) | Desktop-App, Chrome/Edge                   |
| **Browser** | privater Speicher des Browsers (OPFS)                           | alle modernen Browser, auch Safari auf iOS |
| **Demo**    | nur im Arbeitsspeicher, mit Studien-Dashboard                   | überall                                    |

## Studium

- **Module** kommen aus der Prüfungsordnung (voreingestellt BMI, PO 2018 der HSD) oder aus deiner eigenen Liste in
  `Studium/Hochschule.md`. Status, Versuche, Note und „Bestanden im“ füllt der eCampus-Abgleich.
- **Belegung** schlägt Notiva aus Moodle und dem Semesterangebot vor; du kannst sie auf der Modulseite selbst setzen.
  Belegte Module erscheinen in _Mein Semester_.
- **Unterlagen** aus Moodle landen in `Unterlagen/<Kurs>/Vorlesung`, `Praktikum & Übung` oder `Sonstiges`.
- **Stundenplan**: Termine aus den Kursseiten werden übernommen. Weicht etwas von deinen eigenen Einträgen ab, fragt
  Notiva nach.
- **Prüfungsplan**: die neueste PDF der Fakultät wird gelesen und in _Prüfungen_ eingetragen.
- **Hintergrund-Abrufe**: jede Quelle hat ein eigenes Intervall (_Einstellungen → Benachrichtigungen_).

Andere Hochschule: [HOCHSCHULE.md](HOCHSCHULE.md) und [examples/Hochschule.md](../examples/Hochschule.md).

## PDFs und Vorlesungen

- `⌘/Strg F` sucht im PDF, `←/→` blättert, Zoom per Pinch oder `⌘ +/−`.
- Markieren, kommentieren, Seitennotizen; mit dem Zeiger auswählen, verschieben, löschen; `⌘Z` macht rückgängig.
- **Vorlesungsmodus** (rechte Spalte): nimmt auf, transkribiert lokal mit Whisper (das Modell lädt beim ersten Start)
  und folgt den Folien. Danach fasst die KI auf Wunsch zusammen.

## Code-Ordner

Eine Seite mit `code: true` bekommt einen Ordner daneben: Dateiliste, Editor, Terminal (auch zwei nebeneinander),
Links und eine Webseite daneben. Git-Commits mit Fortschrittsanzeige.

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

**Kontext:** Die Leiste über dem Eingabefeld zeigt, was mitgeht: offene Seite, aktuelle PDF-Seite oder das ganze
PDF, Markierungen. **Verläufe** bleiben gespeichert und lassen sich fortsetzen.

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

## Tastenkürzel

|                        |                                        |
| ---------------------- | -------------------------------------- |
| `⌘/Strg K`             | Suchen & Seite öffnen/anlegen          |
| `⌘/Strg N`             | Neue Seite                             |
| `⌘/Strg ⇧ D`           | Tagesnotiz                             |
| `⌘/Strg \`             | Seitenleiste                           |
| `⌘/Strg J`             | KI-Assistent                           |
| `⌘/Strg ,`             | Einstellungen                          |
| `⌘/Strg [` / `]`       | zurück / vor                           |
| `⌘/Strg`-Klick         | Eintrag ganz statt als Vorschau öffnen |
| `/`                    | Befehle im Editor                      |
| `[[`                   | Seite verlinken                        |
| `⌘/Strg B · I · E · K` | fett · kursiv · Code · Link            |
| `⌘/Strg ⇧ H`           | ==Textmarker==                         |
| `Esc` / `⌘↵`           | Block fertig                           |
