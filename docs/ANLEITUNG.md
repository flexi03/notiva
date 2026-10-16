# Anleitung

Alles, was über den Einstieg im [README](../README.md) hinausgeht. Die gleiche Übersicht gibt es in der App unter
_Hilfe → So funktioniert Notiva_ (bitte beides gemeinsam aktuell halten). English: [GUIDE.en.md](GUIDE.en.md).

## Speicherorte

| Speicher    | Wo                                                              | Plattform                |
| ----------- | --------------------------------------------------------------- | ------------------------ |
| **Ordner**  | ein normaler Ordner (mit iCloud/Syncthing/Git synchronisierbar) | Desktop-App, Chrome/Edge |
| **Browser** | privater Speicher des Browsers (OPFS)                           | alle modernen Browser    |
| **Demo**    | nur im Arbeitsspeicher, mit Studien-Dashboard                   | überall                  |

## Studium

- **Module** kommen aus der Prüfungsordnung (voreingestellt BMI, PO 2018 der HSD) oder aus deiner eigenen Liste in
  `Studium/Hochschule.md`. Status, Versuche, Note und „Bestanden im“ füllt der eCampus-Abgleich.
- **Belegung** schlägt Notiva aus Moodle und dem Semesterangebot vor; du kannst sie auf der Modulseite selbst setzen.
  Belegte Module erscheinen in _Mein Semester_.
- **Unterlagen** aus Moodle landen in `Unterlagen/<Modul>/Vorlesung`, `Praktikum & Übung` oder `Sonstiges`. Neue
  Unterlagen schlägt Notiva vor (Hinweis und Benachrichtigung), gespeichert wird nach deiner Bestätigung.
- **Unterlagen neu einlesen** (_Moodle_): holt Moodle neu und listet zum Abhaken auf, was abweicht. Dazu gehören
  falsch einsortierte Dateien (die Notizseite wandert mit), fehlende Dateien und neuere Versionen.
- **Neue Versionen** überschreiben nie deine Datei. Sie kommen als `<Name> (neu <Datum>).pdf` daneben. Unter
  _Moodle → N neue Version(en)_ vergleicht Notiva beide Seite für Seite: geänderte Seiten gelb, neue grün,
  entfernte aufgezählt. Danach wählst du **Alte ersetzen** (Name und Notizen bleiben) oder **Beide behalten**.
- **Links** in Moodle (z. B. ProjectBase) öffnen im Browser, dort klappt die Anmeldung mit 2FA. Alternativ öffnen
  sie in einem App-Fenster mit der Uni-Anmeldung. Bei Git-Projekten holt **Repository ins Praktikum holen** den
  Code mit Fortschritt in den Praktikumsordner. Verlangt der Server eine Anmeldung, hilft **Im Terminal holen**.
- **Alles hängt am Modul**: Die Modulseite zeigt Unterlagen, Moodle-Infos, Prüfungen, Aufgaben und Mitschriften.
  Eigene Kursseiten gibt es nicht mehr. Überblick in der App: _Hilfe → So funktioniert Notiva_.
- **Mein Semester**: eine farbige Karte je belegtem Modul – nächster Termin, Prüfung, offene Aufgaben, neuestes
  Skript, neue Unterlagen, „Praktikum bearbeiten“.
- **Stundenplan** (Seitenleiste): Wochenansicht in Modulfarben. „Zeiten vorschlagen“ liest die Moodle-Kurstexte
  und die ersten Seiten der Einführungs-PDFs. Pro Termin fragt Notiva, ob er übernommen werden soll, und nennt die
  Quelle (Kurs oder Folie und Seite, mit dem passenden Satz). Die Quelle bleibt in der Spalte „Quelle“ und erscheint
  beim Darüberfahren. Weicht etwas von deinen eigenen Einträgen ab, fragt Notiva nach. Auf der Modulseite stehen
  die Termine des Moduls mit „Termin hinzufügen“ und „Zeiten suchen“.
- **Modulseite**: oben die Termine des Moduls aus dem Stundenplan, bei Praktika die Vorbereitungen und
  Praktikumstermine.
  - Für Praktika schlägt _Termine planen_ eine Reihe vor: erster Termin aus dem Stundenplan, Rhythmus, Anzahl
    aus den gefundenen Blättern (P01, Praktikum_02 …), Vorbereitung einige Tage vorher und Erinnerungen.
  - Eingetragen wird nach der Vorschau in _Aufgaben_ (mit Datum, Uhrzeit und `Erinnerung`).
  - _Links aus Moodle_ zeigt Git-Projekte mit „Repository ins Praktikum holen“.
- **Als Nächstes** in der Statusleiste öffnet das Modul. „Für diesen Termin“ zeigt dort die wahrscheinlichsten
  Dateien.
- **Praktika**: Im Praktikumsordner hat jedes Praktikum eine eigene Seite (P01, P02 …) mit Termin, Vorbereitung,
  Blättern, Repositories und Links. „Nach Praktika ordnen“ bringt einen bestehenden Ordner in diese Form (mit
  Vorschau). Geholte Repositories haben eine eigene Seite: Beschreibung vom Server (nur lesen), Dateien, „Meine
  Notizen“; ihr Git steht unter _Änderungen → Praktikum-Repos_.
- **Moodle-Kurse eines Moduls**: Auf der Modulseite wählst du pro Kurs „zählt jetzt“, „anderes Semester“ oder
  „nicht berücksichtigen“ – z. B. für Kurse, in die du nur schon hineinschaust.
- **Heute** (Seitenleiste) öffnet die Tagesnotiz mit der Tagesübersicht: Vorlesungen, Prüfungen, Praktika,
  fällige und überfällige Aufgaben, Moodle-Fristen – ein Klick öffnet den Eintrag bzw. das Modul.
- **Private Repositories** (z. B. ProjectBase): Beim ersten Holen fragt Notiva nach einem Zugangstoken (Recht
  `read_repository`) und speichert ihn verschlüsselt pro Server.
- **Prüfungsplan**: die neueste PDF der Fakultät wird gelesen und in _Prüfungen_ eingetragen.
- **Hintergrund-Abrufe**: jede Quelle hat ein eigenes Intervall (_Einstellungen → Benachrichtigungen_).

Andere Hochschule: [HOCHSCHULE.md](HOCHSCHULE.md) und [examples/Hochschule.md](../examples/Hochschule.md).

## Statusleiste

Unten am Fensterrand (wie in VS Code):

- **Links:** der nächste Termin und kurze Bestätigungen („Gespeichert“).
- **Mitte:** laufende Aufgaben mit Balken, Anzahl und Restzeit. Ein Klick öffnet die Liste. Fehler öffnen sie
  selbst, mit Grund und Knopf zum Beheben.
- **Rechts:**
  - „N Vorschläge“ (öffnet die Benachrichtigungen)
  - Hilfe
  - Version (Info und Updates)
  - „Problem melden“

Hintergrund-Prüfungen melden in den Benachrichtigungen, was sie gefunden haben und was davon neu ist.

## PDFs und Vorlesungen

- `⌘/Strg F` sucht im PDF, `←/→` blättert, Zoom per Pinch oder `⌘ +/−`.
- Markieren, kommentieren, Seitennotizen; mit dem Zeiger auswählen, verschieben, löschen; `⌘Z` macht rückgängig.
- **Vorlesungsmodus** (rechte Spalte): nimmt auf, transkribiert lokal mit Whisper (das Modell lädt beim ersten Start)
  und folgt den Folien. Danach fasst die KI auf Wunsch zusammen.

## Code-Ordner

Eine Seite mit `code: true` bekommt einen Ordner daneben: Dateiliste, Editor, Terminal (auch zwei nebeneinander),
Links und eine Webseite daneben. Git-Commits mit Fortschrittsanzeige. Links auf Git-Projekte bieten
„Repository ins Praktikum holen“ (`git clone` in den Ordner).

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

## Lokales Mini-Modell

Für schnelle Zusammenfassungen ohne Internet und ohne Konto: _Einstellungen → KI → Lokales Mini-Modell_.
Notiva nutzt dafür [llama.cpp](https://github.com/ggml-org/llama.cpp) (Knopf „llama.cpp installieren“: Homebrew
bzw. winget) und ein kleines Qwen-2.5-Modell (empfohlen 1,5 B, ~1,1 GB; klein 0,5 B, ~0,5 GB), das beim ersten Mal
mit Fortschrittsbalken geladen und per Prüfsumme kontrolliert wird. Im Git-Panel fasst es dann jede geänderte
Datei zusammen und schlägt die Commit-Nachricht vor (automatisch, du kannst sie ändern; ✨ fragt neu). Das Modell läuft nur auf `127.0.0.1` und beendet sich nach 5 Minuten ohne Anfrage.

## Anmeldung (Microsoft)

eCampus und Moodle melden sich über deine Hochschule an. Bei „Angemeldet bleiben?“ **Ja** wählen – dann erneuert
Notiva die Anmeldung im Hintergrund selbst, und eine Anmeldung gilt für eCampus und Moodle. Läuft sie trotzdem ab
(Microsoft verlangt z. B. nach einiger Zeit wieder Passwort oder Bestätigung), kommt eine Benachrichtigung mit
**„Neu anmelden“**, die das Anmeldefenster direkt öffnet.

## Fehlermeldungen

Klappt etwas nicht, nennt Notiva den Grund in klaren Worten und bietet einen Knopf zum Beheben an (z. B. „Git
installieren“, „Neu anmelden“, „Noch einmal“). Die technische Meldung steht klein darunter – hilfreich für ein
Issue auf GitHub.

## Git

Liegt dein Ordner in einem Git-Repository (oder _Git einrichten_), zeigt die Desktop-App rechts unter
_Änderungen_ (`⌘/Strg ⇧ G`) alle neuen, geänderten und gelöschten Seiten mit +/− Zeilen, einen Diff
(untereinander oder nebeneinander), Commit ausgewählter Dateien, Verwerfen, Verlauf und Push/Pull. Im Editor
markiert ein farbiger Rand geänderte (blau), neue (grün) und gelöschte (rot) Stellen – wie in VS Code; der
Seitenbaum zeigt `M`/`U`.

### Mit GitHub oder GitLab verbinden

1. Dort ein neues, **leeres** Repository anlegen (ohne README), am besten privat.
2. In Notiva unter _Änderungen_ auf **Remote hinzufügen**, die HTTPS-Adresse einfügen, **Verbinden und
   hochladen**.
3. Fragt der Server nach einer Anmeldung: **Zugangstoken eintragen** (GitHub: Recht „repo“, GitLab:
   „read_repository“ und „write_repository“). Notiva speichert ihn verschlüsselt im Schlüsselbund.

Typische Fehler erklärt Notiva direkt: falsche Adresse, Repository nicht leer, fehlende Anmeldung.

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
