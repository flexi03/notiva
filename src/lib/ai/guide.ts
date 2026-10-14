/**
 * Short reference of Notiva's file formats for the AI (tool `notiva_format`), built from the same
 * constants the parsers use – so it can't drift from what the app accepts.
 */
import { AGGREGATIONS, COLORS, FILTER_OPS, PROPERTY_TYPES, VIEW_TYPES } from '../database'
import { TILE_TYPES } from '../widgets'

export const FORMAT_GUIDE = `# Notiva-Formate

## Widgets (Kacheln und eingebettete Ansichten)
Stehen als Codeblock \`\`\`notiva … \`\`\` im Markdown einer Seite. Bearbeiten mit list_widgets / update_widget.

### Kacheln
type: tiles
columns: 4            # 1–6
tiles:
  - { type: stat, title: Notenschnitt, icon: 🏅, source: "Studium/Module", aggregation: weightedAvg, property: Note, weight: ECTS, decimals: 2, filter: [{ property: Status, op: eq, value: Bestanden }] }

Kachel-Typen: ${TILE_TYPES.join(', ')}
- stat: Kennzahl aus einer Datenbank (source, aggregation, property, weight, filter, decimals, unit)
- progress: Fortschritt zu einem Ziel (wie stat + goal)
- countdown: Tage bis zum nächsten Datum (source, dateProperty, filter)
- list: Einträge (source, show = Eigenschaft neben dem Namen, limit, sort, filter)
- link: Verweis auf eine Seite (page, description)
- text: Markdown-Text (text)
- week: Woche X von Y (start, end als YYYY-MM-DD)
Für alle: title, icon (Emoji), span (Breite 1–4), color.
Aggregationen: ${AGGREGATIONS.join(', ')}

### Eingebettete Datenbank-Ansicht
type: view
source: "Studium/Aufgaben"   # Datenbank-Seite
view: Board                  # Name einer Ansicht der Datenbank
limit: 10
filter: [{ property: Status, op: neq, value: Erledigt }]

### Alles zu einer Seite (Modulseite)
type: related   # zeigt Seiten, die hierher verlinken, nach Datenbank (Kurse, Mitschriften, Prüfungen …)

## Filter und Sortierung
filter: [{ property, op, value }] – op: ${FILTER_OPS.join(', ')}
Datumswerte: YYYY-MM-DD oder "today", "today+7". nextDays/pastDays: value = Anzahl Tage.
Semester: "@semester" (aktuelles, z. B. "WiSe 26/27"), "@nextSemester", "@lastSemester" – z. B.
{ property: Belegt, op: contains, value: "@semester" } für die Module dieses Semesters.
sort: [{ property, direction: asc|desc }]

## Datenbanken
Eine Seite mit \`database:\` im Frontmatter; Einträge sind Seiten im gleichnamigen Ordner, ihre
Eigenschaften stehen im Frontmatter. Ändern mit update_database (nur hinzufügen, nichts löschen).
Eigenschafts-Typen: ${PROPERTY_TYPES.join(', ')}
Ansichts-Typen: ${VIEW_TYPES.join(', ')} (board: groupBy, calendar: dateProperty)
Farben für Auswahl-Optionen: ${COLORS.join(', ')}
Relationen speichern "[[Seite]]"-Links; Rollups rechnen über eine Relation (relation, property, aggregation).

## Studien-Dashboard (Vorlage „Studium“)
Dashboard-Seite mit Kacheln + Ansichten; Datenbanken darunter: Module (ECTS, Note, Status, Semester),
Prüfungen (Modul, Datum, Art, Raum, Angemeldet), Aufgaben (Modul, Fällig, Status, Priorität, Art),
Stundenplan (Modul, Tag, Beginn, Ende, Raum), Semester. Namen können abweichen – erst mit
list_databases nachsehen.

## Vorgehen beim Anpassen
1. Lesen: list_databases, list_widgets, read_page, list_files/read_file (z. B. Modulhandbuch als PDF).
2. Kurz sagen, was du ändern willst.
3. Ändern: create_row/set_properties für Einträge, update_database für neue Felder/Optionen/Ansichten,
   update_widget für Kacheln. Keine Daten erfinden – fehlt etwas, nachfragen.
`
