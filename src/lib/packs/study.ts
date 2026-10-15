import type { TemplatePack } from '../templates'
import { COURSE_DB, MODULE_PROPERTIES, MODULE_ROW_TEMPLATE, MODULE_VIEWS } from '../study/sync'

/**
 * Study planner: dashboard + semesters, modules, exams, tasks, timetable, notes and templates.
 * All databases link to each other via relations; tiles compute grade average, ECTS, next exam …
 */

const SEMESTER = `---
icon: 🗓️
database:
  properties:
    - { name: Zeitraum, type: text }
    - { name: Status, type: select, options: [{ value: Geplant, color: gray }, { value: Aktiv, color: blue }, { value: Abgeschlossen, color: green }] }
    - { name: Beginn, type: date }
    - { name: Ende, type: date }
    - { name: Module, type: relation, database: "{{name}}/Module.md" }
    - { name: ECTS, type: rollup, relation: Module, property: ECTS, aggregation: sum }
    - { name: Schnitt, type: rollup, relation: Module, property: Note, aggregation: avg }
    - { name: ECTS Plan, type: number }
    - { name: ECTS erreicht, type: number }
  views:
    - { name: Alle, type: table, sort: [{ property: Beginn, direction: asc }], properties: [Zeitraum, Status, Beginn, Ende, ECTS, ECTS Plan, ECTS erreicht, Schnitt] }
    - { name: Kacheln, type: gallery, properties: [Zeitraum, Status, ECTS erreicht] }
---
Jedes Semester hat eine eigene Übersichtsseite mit seinen Modulen, Prüfungen und Aufgaben. Öffne das aktuelle Semester, um nur das zu sehen. Eigenes Semester (z. B. Auslands- oder Urlaubssemester): **＋ Neu** und *Zeitraum* eintragen (z. B. „SoSe 27“) – Notiva füllt die Übersicht.
`

const MODULE = `---
icon: 📚
database:
  properties:${MODULE_PROPERTIES}
    - { name: Semester, type: relation, database: "{{name}}/Semester.md" }
  views:${MODULE_VIEWS}
  rowTemplate: |
${MODULE_ROW_TEMPLATE.split('\n')
  .map((l) => (l ? `    ${l}` : ''))
  .join('\n')}
---
Alle Module deines Studiums nach Prüfungsordnung. Oben umschalten: **Dieses Semester**, **Nächstes Semester**, **Studienverlauf** (nach Fachsemester) oder **Offen** (was noch fehlt). Jede Modulseite sammelt Moodle-Kurs, Unterlagen, Mitschriften, Prüfungen und Aufgaben des Moduls.
`

const EXAMS = `---
icon: 📝
database:
  properties:
    - { name: Modul, type: relation, database: "{{name}}/Module.md" }
    - { name: Datum, type: date }
    - { name: Art, type: select, options: [Klausur, Mündlich, Abgabe, Testat] }
    - { name: Raum, type: text }
    - { name: Versuch, type: number }
    - { name: Angemeldet, type: checkbox }
    - { name: Note, type: number, decimals: 1 }
    - { name: In Tagen, type: formula, formula: 'if(empty(Datum), "", if(daysUntil(Datum) < 0, "vorbei", daysUntil(Datum) + " Tage"))' }
  views:
    - { name: Anstehend, type: table, filter: [{ property: Datum, op: gte, value: today }], sort: [{ property: Datum, direction: asc }], properties: [Modul, Datum, In Tagen, Art, Raum, Angemeldet] }
    - { name: Kalender, type: calendar, dateProperty: Datum }
    - { name: Alle, type: table, sort: [{ property: Datum, direction: desc }] }
---
Prüfungstermine. Das Dashboard zeigt die nächste Prüfung als Countdown.
`

const TASKS = `---
icon: ✅
database:
  properties:
    - { name: Status, type: select, options: [{ value: Offen, color: gray }, { value: In Arbeit, color: blue }, { value: Erledigt, color: green }] }
    - { name: Modul, type: relation, database: "{{name}}/Module.md" }
    - { name: Fällig, type: date }
    - { name: Priorität, type: select, options: [{ value: Hoch, color: red }, { value: Mittel, color: orange }, { value: Niedrig, color: gray }] }
    - { name: Art, type: select, options: [Übungsblatt, Abgabe, Lesen, Projekt, Lernen] }
  views:
    - { name: Board, type: board, groupBy: Status, sort: [{ property: Fällig, direction: asc }], properties: [Modul, Fällig, Priorität] }
    - { name: Diese Woche, type: list, filter: [{ property: Fällig, op: nextDays, value: 7 }, { property: Status, op: neq, value: Erledigt }], sort: [{ property: Fällig, direction: asc }], properties: [Fällig, Modul, Priorität] }
    - { name: Kalender, type: calendar, dateProperty: Fällig }
    - { name: Tabelle, type: table, sort: [{ property: Fällig, direction: asc }] }
---
Übungsblätter, Abgaben und To-dos – nach Status auf dem Board verschieben.
`

const TIMETABLE = `---
icon: ⏰
database:
  properties:
    - { name: Tag, type: select, options: [Mo, Di, Mi, Do, Fr, Sa] }
    - { name: Beginn, type: text }
    - { name: Ende, type: text }
    - { name: Typ, type: select, options: [{ value: Vorlesung, color: blue }, { value: Übung, color: green }, { value: Tutorium, color: yellow }, { value: Labor, color: purple }] }
    - { name: Raum, type: text }
    - { name: Modul, type: relation, database: "{{name}}/Module.md" }
  views:
    - { name: Woche, type: board, groupBy: Tag, sort: [{ property: Beginn, direction: asc }], properties: [Beginn, Ende, Typ, Raum] }
    - { name: Liste, type: table, sort: [{ property: Tag, direction: asc }, { property: Beginn, direction: asc }] }
---
Dein Stundenplan für das aktuelle Semester.
`

const NOTES = `---
icon: 🗒️
database:
  properties:
    - { name: Modul, type: relation, database: "{{name}}/Module.md" }
    - { name: Datum, type: date }
    - { name: Art, type: select, options: [{ value: Vorlesung, color: blue }, { value: Übung, color: green }, { value: Lernzettel, color: yellow }, { value: Transkript, color: purple }] }
  views:
    - { name: Nach Modul, type: list, groupBy: Modul, sort: [{ property: Datum, direction: desc }], properties: [Datum, Art] }
    - { name: Neueste, type: table, sort: [{ property: Datum, direction: desc }], properties: [Modul, Datum, Art] }
  rowTemplate: |
    ## Kernaussagen

    - 

    ## Notizen

    ## Fragen

    - [ ] 
---
Deine Mitschriften zu Vorlesungen und Übungen – jede gehört zu einem Modul und erscheint auf dessen Seite.
`

const ORGA = `---
icon: 🧭
---
Alles, was nicht zu einem einzelnen Modul gehört: Prüfungsplan, Fristen, Studieninfos und allgemeine Moodle-Kurse.

## Prüfungen und Fristen

- Prüfungsplan: Notiva holt ihn unter **Studium → Prüfungsplan** und trägt deine Termine in [[{{name}}/Prüfungen|Prüfungen]] ein.
- Anmeldezeitraum: 
- Rückmeldung / Semesterbeitrag: 

## Allgemeine Kurse aus Moodle

\`\`\`notiva
type: view
source: "{{name}}/Kurse"
view: Alle
filter: [{ property: Art, op: neq, value: Modul }]
\`\`\`

## Wichtige Links

- 

## Notizen

- 
`

const DASHBOARD = `---
icon: 🎓
cover: blue
width: wide
---
Willkommen in deinem Studium **{{studiengang}}**. Alles hier ist Markdown – Kacheln, Ansichten und Datenbanken kannst du frei anpassen (Block anklicken).

> [!info] Wo steht was?
> - **Belege ich gerade** (unten) – Module mit *Belegung* (Vorlesung, Praktikum, Übung oder nur Prüfung); Notiva schlägt sie vor, du kannst sie selbst setzen. Andere Semester: [[{{name}}/Semester|Semester]] (je Semester eine Seite).
> - **[[{{name}}/Module|Module]]** – alle Module der Prüfungsordnung mit Status, Versuchen und Note. Die **Modulseite** ist der Ort für alles zu einem Fach: Moodle-Infos, Unterlagen, Mitschriften, Prüfungen und deine Notizen.
> - **[[{{name}}/Orga|Orga]]** – Prüfungsplan, Fristen, Studieninfos und allgemeine Kurse.
> - **[[{{name}}/Mitschriften|Mitschriften]]** – Notizen aus Vorlesungen, je Modul verknüpft.

\`\`\`notiva
type: tiles
columns: 4
tiles:
  - { type: week, title: Vorlesungszeit, icon: 📅, start: "{{semesterStart}}", end: "{{semesterEnd}}" }
  - { type: stat, title: Notenschnitt, icon: 🏅, source: "{{name}}/Module", aggregation: weightedAvg, property: Note, weight: ECTS, decimals: 2, filter: [{ property: Status, op: eq, value: Bestanden }] }
  - { type: progress, title: ECTS, icon: 🎯, source: "{{name}}/Module", aggregation: sum, property: ECTS, goal: {{ectsZiel}}, filter: [{ property: Status, op: eq, value: Bestanden }] }
  - { type: countdown, title: Nächste Prüfung, icon: ⏳, source: "{{name}}/Prüfungen", dateProperty: Datum }
  - { type: stat, title: Offene Aufgaben, icon: 📌, source: "{{name}}/Aufgaben", aggregation: count, filter: [{ property: Status, op: neq, value: Erledigt }] }
  - { type: list, title: Diese Woche fällig, icon: 🔥, span: 2, source: "{{name}}/Aufgaben", show: Fällig, limit: 5, sort: [{ property: Fällig, direction: asc }], filter: [{ property: Fällig, op: nextDays, value: 7 }, { property: Status, op: neq, value: Erledigt }] }
  - { type: stat, title: Module laufend, icon: 📖, source: "{{name}}/Module", aggregation: count, filter: [{ property: Status, op: eq, value: In Vorlesung }] }
  - { type: link, page: "{{name}}/Module", description: Alle Module & Noten }
  - { type: link, page: "{{name}}/Prüfungen", description: Termine & Anmeldung }
  - { type: link, page: "{{name}}/Stundenplan", description: Deine Woche }
  - { type: link, page: "{{name}}/Semester", description: Überblick je Semester }
\`\`\`

## Belege ich gerade

\`\`\`notiva
type: view
source: "{{name}}/Module"
view: Aktiv
\`\`\`

## Aufgaben

\`\`\`notiva
type: view
source: "{{name}}/Aufgaben"
view: Board
\`\`\`

## Prüfungen

\`\`\`notiva
type: view
source: "{{name}}/Prüfungen"
view: Anstehend
\`\`\`

> [!tip] So geht's
> - Neue Mitschrift: auf der Modulseite **Neue Mitschrift** – oder Mitschriften → ＋ Neu.
> - Mit eCampus und Moodle verbunden? **Studium aktualisieren** (Noten & Leistungen) füllt Module, Versuche und Semester selbst.
> - Noten von Hand: Modul öffnen und *Note* + *Status: Bestanden* setzen – Schnitt und ECTS aktualisieren sich.
> - Eigene Kachel: diesen Block bearbeiten und eine Zeile kopieren.
`

const LECTURE_TEMPLATE = `---
template: true
icon: 🧑‍🏫
Modul: ""
Datum: {{date}}
tags: [vorlesung]
---
# {{title}}

> [!info] {{weekday}}, {{date:DD.MM.YYYY}}

## Kernaussagen

- 

## Notizen

## Fragen

- [ ] 

## Zusammenfassung
`

const CHEATSHEET_TEMPLATE = `---
template: true
icon: 🧠
tags: [lernzettel]
---
# {{title}}

> [!tip] Prüfungsrelevant
> Die drei wichtigsten Punkte:
> 1. 
> 2. 
> 3. 

## Definitionen

| Begriff | Bedeutung |
| --- | --- |
|  |  |

## Formeln

$$
\\,
$$

## Typische Aufgaben

- [ ] Altklausur gerechnet
- [ ] Übungsblätter wiederholt
`

const row = (db: string, title: string, data: string, body = '') => ({
  path: `{{name}}/${db}/${title}.md`,
  content: `---\n${data.trim()}\n---\n${body}`,
})

export const studyPack: TemplatePack = {
  id: 'study',
  name: 'Studien-Dashboard',
  description:
    'Semester, Module, Noten, ECTS, Prüfungen, Aufgaben und Stundenplan – alles verknüpft, mit Notenschnitt und Countdown.',
  icon: '🎓',
  variables: [
    { key: 'name', label: 'Ordnername', default: 'Studium' },
    { key: 'studiengang', label: 'Studiengang', default: 'mein Studium' },
    { key: 'ectsZiel', label: 'ECTS-Ziel', type: 'number', default: '180' },
    { key: 'semesterStart', label: 'Vorlesungsbeginn', type: 'date', default: '{{date-21}}' },
    { key: 'semesterEnd', label: 'Vorlesungsende', type: 'date', default: '{{date+77}}' },
  ],
  entry: '{{name}}.md',
  files: [
    { path: '{{name}}.md', content: DASHBOARD },
    { path: '{{name}}/Semester.md', content: SEMESTER },
    { path: '{{name}}/Module.md', content: MODULE },
    { path: '{{name}}/Prüfungen.md', content: EXAMS },
    { path: '{{name}}/Aufgaben.md', content: TASKS },
    { path: '{{name}}/Stundenplan.md', content: TIMETABLE },
    { path: '{{name}}/Mitschriften.md', content: NOTES },
    { path: '{{name}}/Kurse.md', content: COURSE_DB('{{name}}') },
    { path: '{{name}}/Orga.md', content: ORGA },
    { path: '{{name}}/Vorlagen/Vorlesungsnotiz.md', content: LECTURE_TEMPLATE },
    { path: '{{name}}/Vorlagen/Lernzettel.md', content: CHEATSHEET_TEMPLATE },
    row(
      'Semester',
      '1. Semester',
      'Zeitraum: {{semester-1}}\nStatus: Abgeschlossen\nBeginn: {{date-200}}\nEnde: {{date-60}}\nModule: ["[[Analysis I]]", "[[Programmieren I]]"]',
    ),
    row(
      'Semester',
      '2. Semester',
      'Zeitraum: {{semester}}\nStatus: Aktiv\nBeginn: {{semesterStart}}\nEnde: {{semesterEnd}}\nModule: ["[[Lineare Algebra]]", "[[Datenbanken]]", "[[Software Engineering]]"]',
    ),
    row(
      'Module',
      'Analysis I',
      'Status: Bestanden\nSemester: ["[[1. Semester]]"]\nBelegt: ["{{semester-1}}"]\nBestanden im: {{semester-1}}\nVersuche: 1\nFachsemester: 1\nECTS: 9\nNote: 2.3\nArt: Pflicht\nPrüfungsform: Klausur',
      '## Inhalte\n\n- Folgen und Reihen\n- Stetigkeit, Differenzierbarkeit\n- Integralrechnung\n',
    ),
    row(
      'Module',
      'Programmieren I',
      'Status: Bestanden\nSemester: ["[[1. Semester]]"]\nBelegt: ["{{semester-1}}"]\nBestanden im: {{semester-1}}\nVersuche: 2\nVerlauf: "1. {{semester-1}}: 5,0 · 2. {{semester-1}}: 1,7 ✓"\nFachsemester: 1\nECTS: 6\nNote: 1.7\nArt: Pflicht\nPrüfungsform: Projekt',
    ),
    row(
      'Module',
      'Lineare Algebra',
      'Status: In Vorlesung\nSemester: ["[[2. Semester]]"]\nBelegt: ["{{semester}}"]\nFachsemester: 2\nPraktikum: Offen\nECTS: 9\nArt: Pflicht\nPrüfungsform: Klausur',
    ),
    row(
      'Module',
      'Datenbanken',
      'Status: In Vorlesung\nSemester: ["[[2. Semester]]"]\nBelegt: ["{{semester}}"]\nFachsemester: 2\nPraktikum: Offen\nECTS: 6\nArt: Pflicht\nPrüfungsform: Klausur',
    ),
    row(
      'Module',
      'Software Engineering',
      'Status: In Vorlesung\nSemester: ["[[2. Semester]]"]\nBelegt: ["{{semester}}"]\nFachsemester: 2\nPraktikum: Offen\nECTS: 6\nArt: Wahlpflicht\nPrüfungsform: Projekt',
    ),
    row(
      'Prüfungen',
      'Klausur Lineare Algebra',
      'Modul: ["[[Lineare Algebra]]"]\nDatum: {{date+40}}\nArt: Klausur\nRaum: H1\nVersuch: 1\nAngemeldet: false',
    ),
    row(
      'Prüfungen',
      'Klausur Datenbanken',
      'Modul: ["[[Datenbanken]]"]\nDatum: {{date+47}}\nArt: Klausur\nVersuch: 1\nAngemeldet: true',
    ),
    row(
      'Prüfungen',
      'Klausur Analysis I',
      'Modul: ["[[Analysis I]]"]\nDatum: {{date-80}}\nArt: Klausur\nVersuch: 1\nAngemeldet: true\nNote: 2.3',
    ),
    row(
      'Aufgaben',
      'Übungsblatt 3 LA',
      'Status: Offen\nModul: ["[[Lineare Algebra]]"]\nFällig: {{date+2}}\nPriorität: Hoch\nArt: Übungsblatt',
      '- [ ] Aufgabe 1\n- [ ] Aufgabe 2\n- [ ] Aufgabe 3\n',
    ),
    row(
      'Aufgaben',
      'ER-Modell entwerfen',
      'Status: In Arbeit\nModul: ["[[Datenbanken]]"]\nFällig: {{date+5}}\nPriorität: Mittel\nArt: Abgabe',
    ),
    row(
      'Aufgaben',
      'Projektidee SE abstimmen',
      'Status: Offen\nModul: ["[[Software Engineering]]"]\nFällig: {{date+12}}\nPriorität: Mittel\nArt: Projekt',
    ),
    row(
      'Aufgaben',
      'Skript Kapitel 1 lesen',
      'Status: Erledigt\nModul: ["[[Lineare Algebra]]"]\nFällig: {{date-3}}\nPriorität: Niedrig\nArt: Lesen',
    ),
    row(
      'Stundenplan',
      'LA Vorlesung',
      'Tag: Mo\nBeginn: "08:15"\nEnde: "09:45"\nTyp: Vorlesung\nRaum: H1\nModul: ["[[Lineare Algebra]]"]',
    ),
    row(
      'Stundenplan',
      'LA Übung',
      'Tag: Mi\nBeginn: "10:00"\nEnde: "11:30"\nTyp: Übung\nRaum: S2\nModul: ["[[Lineare Algebra]]"]',
    ),
    row(
      'Stundenplan',
      'DB Vorlesung',
      'Tag: Di\nBeginn: "12:00"\nEnde: "13:30"\nTyp: Vorlesung\nRaum: H3\nModul: ["[[Datenbanken]]"]',
    ),
    row(
      'Stundenplan',
      'SE Labor',
      'Tag: Do\nBeginn: "14:00"\nEnde: "17:00"\nTyp: Labor\nRaum: Lab 1\nModul: ["[[Software Engineering]]"]',
    ),
    {
      path: '{{name}}/Mitschriften/LA – Vektorräume.md',
      content:
        '---\nicon: 🧑‍🏫\nModul: "[[Lineare Algebra]]"\nDatum: {{date-2}}\ntags: [vorlesung]\n---\n# Vektorräume\n\n> [!note] Definition\n> Ein Vektorraum $V$ über einem Körper $K$ ist eine Menge mit Addition und Skalarmultiplikation …\n\n- [x] Axiome gelernt\n- [ ] Beispiele $\\mathbb{R}^n$ durchrechnen\n',
    },
  ],
}
