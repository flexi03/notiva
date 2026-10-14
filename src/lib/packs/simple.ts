import type { TemplatePack } from '../templates'

/** Smaller packs that show what Notiva can do beyond studying. */

export const projectPack: TemplatePack = {
  id: 'projects',
  name: 'Projekte & Aufgaben',
  description: 'Kanban-Board mit Prioritäten, Fälligkeiten und Kalender.',
  icon: '🚀',
  variables: [{ key: 'name', label: 'Name', default: 'Projekte' }],
  entry: '{{name}}.md',
  files: [
    {
      path: '{{name}}.md',
      content: `---
icon: 🚀
database:
  properties:
    - { name: Status, type: select, options: [{ value: Idee, color: gray }, { value: In Arbeit, color: blue }, { value: Review, color: orange }, { value: Fertig, color: green }] }
    - { name: Priorität, type: select, options: [{ value: Hoch, color: red }, { value: Mittel, color: orange }, { value: Niedrig, color: gray }] }
    - { name: Fällig, type: date }
    - { name: Tags, type: multiSelect }
  views:
    - { name: Board, type: board, groupBy: Status, properties: [Priorität, Fällig, Tags] }
    - { name: Kalender, type: calendar, dateProperty: Fällig }
    - { name: Tabelle, type: table }
---
`,
    },
    {
      path: '{{name}}/Erstes Projekt.md',
      content:
        '---\nStatus: In Arbeit\nPriorität: Hoch\nFällig: {{date+7}}\nTags: [beispiel]\n---\n- [ ] Ziel festlegen\n- [ ] Schritte planen\n',
    },
  ],
}

export const journalPack: TemplatePack = {
  id: 'journal',
  name: 'Tagebuch',
  description: 'Tageseinträge mit Stimmung und Gewohnheiten, als Kalender und Liste.',
  icon: '📓',
  variables: [{ key: 'name', label: 'Name', default: 'Tagebuch' }],
  entry: '{{name}}.md',
  files: [
    {
      path: '{{name}}.md',
      content: `---
icon: 📓
database:
  properties:
    - { name: Datum, type: date }
    - { name: Stimmung, type: select, options: [{ value: 😀, color: green }, { value: 🙂, color: blue }, { value: 😐, color: gray }, { value: 🙁, color: orange }] }
    - { name: Sport, type: checkbox }
    - { name: Gelesen, type: checkbox }
  views:
    - { name: Kalender, type: calendar, dateProperty: Datum }
    - { name: Liste, type: list, sort: [{ property: Datum, direction: desc }], properties: [Datum, Stimmung] }
  rowTemplate: |
    ## Heute

    ## Dankbar für

    - 
---
\`\`\`notiva
type: tiles
tiles:
  - { type: stat, title: Einträge, icon: 📝, source: "{{name}}", aggregation: count }
  - { type: stat, title: Sport-Tage, icon: 🏃, source: "{{name}}", aggregation: percentChecked, property: Sport, unit: "%" }
\`\`\`
`,
    },
    {
      path: '{{name}}/{{date}}.md',
      content: '---\nDatum: {{date}}\nStimmung: 🙂\nSport: false\nGelesen: true\n---\n## Heute\n\n',
    },
  ],
}

export const readingPack: TemplatePack = {
  id: 'reading',
  name: 'Leseliste',
  description: 'Bücher und Artikel als Kacheln mit Bewertung und Status.',
  icon: '📖',
  variables: [{ key: 'name', label: 'Name', default: 'Leseliste' }],
  entry: '{{name}}.md',
  files: [
    {
      path: '{{name}}.md',
      content: `---
icon: 📖
database:
  properties:
    - { name: Autor, type: text }
    - { name: Status, type: select, options: [{ value: Will ich lesen, color: gray }, { value: Lese ich, color: blue }, { value: Gelesen, color: green }] }
    - { name: Bewertung, type: number }
    - { name: Sterne, type: formula, formula: 'if(empty(Bewertung), "", slice("★★★★★", 0, Bewertung))' }
    - { name: Link, type: url }
  views:
    - { name: Kacheln, type: gallery, properties: [Autor, Status, Sterne] }
    - { name: Board, type: board, groupBy: Status, properties: [Autor, Sterne] }
---
`,
    },
    {
      path: '{{name}}/Clean Code.md',
      content: '---\nAutor: Robert C. Martin\nStatus: Lese ich\nBewertung: 4\n---\n',
    },
  ],
}
