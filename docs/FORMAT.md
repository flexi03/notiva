# Dateiformat

Ein Vault ist ein Ordner mit Markdown-Dateien. Notiva liest und schreibt nur, was hier steht; alles andere bleibt unverändert.

## Seiten

`Name.md` – optionaler YAML-Kopfbereich (Frontmatter), dann Markdown.
Unterseiten liegen im gleichnamigen Ordner: `Projekt.md` + `Projekt/Idee.md`.

Beim Speichern bleibt das Frontmatter so, wie es geschrieben wurde: unveränderte Zeilen (Listen in
`[...]`-Schreibweise, Anführungszeichen, Kommentare, Reihenfolge) bleiben Byte für Byte erhalten, nur geänderte
Schlüssel werden neu geschrieben, neue hinten angehängt. Ein Git-Diff zeigt so nur echte Änderungen.

| Schlüssel        | Bedeutung                                                                      |
| ---------------- | ------------------------------------------------------------------------------ |
| `title`          | Anzeigename, falls er nicht als Dateiname taugt (z. B. `Mathe: Teil 1/2`)      |
| `icon`           | Emoji                                                                          |
| `cover`          | Farbband: `blue`, `green`, `yellow`, `purple`, `pink`, `orange`, `gray`, `red` |
| `width`          | `wide` oder `full` für breite Seiten (Dashboards)                              |
| `tags`           | Liste oder kommagetrennt; zusätzlich zählen `#tags` im Text                    |
| `aliases`        | weitere Namen für `[[Links]]`                                                  |
| `order`          | Zahl für die Reihenfolge in der Seitenleiste                                   |
| `template: true` | Seite erscheint als Seitenvorlage                                              |
| alles andere     | freie Eigenschaften                                                            |

Markdown-Erweiterungen: `[[Seite]]`, `[[Seite#Abschnitt|Text]]`, `#tag`, `- [ ] Aufgabe`, `==Marker==`,
`$Formel$`, `$$Block$$`, Callouts `> [!tip] Titel` (note, info, tip, success, question, warning, danger, example, quote),
`<details>`, Tabellen, Code mit Hervorhebung. Bilder liegen neben der Seite in `attachments/`.

## Datenbanken

Eine Seite mit `database:` im Kopfbereich. Einträge sind die Dateien im gleichnamigen Ordner
(oder in `database.folder`, relativ zur Datenbank-Seite). Werte stehen im Kopfbereich der Einträge.

```yaml
database:
  properties:
    - { name: Status, type: select, options: [{ value: Offen, color: gray }, Erledigt] }
    - { name: ECTS, type: number, decimals: 0, format: number } # format: number | percent | euro
    - { name: Semester, type: relation, database: Studium/Semester.md }
    - { name: Summe, type: rollup, relation: Semester, property: ECTS, aggregation: sum }
    - { name: Bestanden, type: formula, formula: 'if(Note <= 4, "✓", "")' }
  views:
    - { name: Board, type: board, groupBy: Status, properties: [ECTS, Semester] }
    - {
        name: Anstehend,
        type: table,
        filter: [{ property: Datum, op: gte, value: today }],
        sort: [{ property: Datum, direction: asc }],
      }
    - { name: Kalender, type: calendar, dateProperty: Datum }
  rowTemplate: |
    ## Notizen
```

**Typen:** text, number, select, multiSelect, date (`2026-10-14`), checkbox, url, email, formula, relation (`"[[Seite]]"`-Liste), rollup.
**Ansichten:** table, board, gallery (Kacheln), list, calendar. Der Titel heißt in Filtern/Formeln `Name`.
**Filter-Operatoren:** eq, neq, contains, notContains, gt, gte, lt, lte, empty, notEmpty, checked, unchecked, before,
after, pastDays, nextDays. Datumswerte dürfen `today`, `today+7`, `today-3` sein.
**Aggregationen:** count, countNotEmpty, countEmpty, sum, avg, min, max, weightedAvg, percentChecked, earliest, latest.

### Formeln

Eigenschaften per Name (`Note * ECTS`) oder `prop("Name mit Leerzeichen")`. Operatoren `+ - * / % ^`,
Vergleiche, `and`/`or`/`not`, `a ? b : c`. Funktionen: if, and, or, not, empty, round, floor, ceil, abs, sqrt, pow,
min, max, sum, avg, count, length, concat, join, upper, lower, trim, contains, replace, slice, toNumber, toText,
format, now, today, dateAdd, dateBetween, daysUntil, formatDate, year, month, day.

## Kacheln und eingebettete Ansichten

Codeblöcke mit der Sprache `notiva` – lesbar in jedem Editor:

````markdown
```notiva
type: tiles
columns: 4
tiles:
  - { type: stat, title: Notenschnitt, source: Studium/Module, aggregation: weightedAvg, property: Note, weight: ECTS, decimals: 2 }
  - { type: progress, title: ECTS, source: Studium/Module, property: ECTS, goal: 180, filter: [{ property: Status, op: eq, value: Bestanden }] }
  - { type: countdown, title: Nächste Prüfung, source: Studium/Prüfungen, dateProperty: Datum }
  - { type: list, title: Fällig, source: Studium/Aufgaben, show: Fällig, limit: 5, span: 2 }
  - { type: link, page: Studium/Module, description: Alle Module }
  - { type: week, title: Vorlesungszeit, start: 2026-10-12, end: 2027-02-05 }
  - { type: text, title: Notiz, text: "**Markdown** erlaubt" }
```

```notiva
type: view
source: Studium/Aufgaben
view: Board
```
````

## Vorlagen

Platzhalter: `{{title}}`, `{{date}}`, `{{date:DD.MM.YYYY}}`, `{{date+7}}`, `{{time}}`, `{{weekday}}`,
eigene Variablen in Paketen; `{{title|yaml}}` setzt den Wert sicher in YAML ein.

## Einstellungen

`.notiva/settings.json` (wird mit dem Vault synchronisiert), Papierkorb in `.notiva/trash/`.

## PDF-Notizen

Markierungen, Haftnotizen und Zeichnungen in einem PDF verändern das PDF nicht. Sie stehen in einer Seite daneben:
`Skript.pdf` → `Skript (Notizen).md`.

```yaml
pdf: Skript.pdf
annotations:
  - {
      id: a1,
      type: highlight,
      page: 2,
      color: green,
      rects: [[72, 140, 220, 14]],
      text: 'Laufzeit O(n)',
      comment: 'Klausur!',
    }
  - { id: a2, type: note, page: 1, color: yellow, x: 300, y: 40, text: 'Nachfragen' }
  - { id: a3, type: ink, page: 3, color: red, width: 2, points: '10,20 12,24 15,30' }
```

Koordinaten in PDF-Punkten (Ursprung oben links). Notizen pro Seite stehen im Text als Abschnitte `## Seite N`.
