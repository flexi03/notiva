---
icon: ✅
database:
  properties:
    - {
        name: Status,
        type: select,
        options:
          [
            { value: Offen, color: gray },
            { value: In Arbeit, color: blue },
            { value: Erledigt, color: green },
          ],
      }
    - { name: Fällig, type: date }
    - {
        name: Priorität,
        type: select,
        options: [{ value: Hoch, color: red }, { value: Mittel, color: orange }, Niedrig],
      }
  views:
    - { name: Board, type: board, groupBy: Status, properties: [Fällig, Priorität] }
    - {
        name: Anstehend,
        type: table,
        filter: [{ property: Status, op: neq, value: Erledigt }],
        sort: [{ property: Fällig, direction: asc }],
      }
    - { name: Kalender, type: calendar, dateProperty: Fällig }
---

# Aufgaben

Eine Datenbank: jede Datei im Ordner `Aufgaben/` ist eine Zeile.
