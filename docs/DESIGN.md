# Design

**Leitbild: Textmarker.** Ruhiges, kühles Papier mit tiefer Tinte; der einzige laute Akzent ist der Markerstrich –
für das Aktive (Seite in der Leiste, gewählte Ansicht, heute im Kalender), Fortschritt und Hervorhebungen.

## Tokens (`src/styles/tokens.css`)

| Token                     | Hell                              | Rolle                                  |
| ------------------------- | --------------------------------- | -------------------------------------- |
| `paper`                   | `#f5f6f8`                         | Hintergrund                            |
| `surface`                 | `#ffffff`                         | Karten, Felder, Popover                |
| `sunken`                  | `#eceef2`                         | Seitenleiste, Board-Spalten, Code      |
| `ink` / `ink-2` / `ink-3` | `#1c2230` / `#4a5263` / `#626a7c` | Text / sekundär / Hinweise (≥ 4,5 : 1) |
| `accent`                  | Tanne `#2f5d50` (wählbar)         | primäre Aktionen, Links                |
| `marker`                  | Gelb `#f2d74e` (wählbar)          | Markerstrich, Fortschritt, „heute“     |
| `opt-*`                   | 9 Farben                          | Auswahl-Optionen, Callouts             |

Dunkles Schema unter `[data-theme='dark']`. Radien: Steuerelemente 6 px, Panels 10 px, Chips rund.

## Schrift

Atkinson Hyperlegible Next (für Lesbarkeit entworfen) für Oberfläche und Inhalt; für Inhalte wählbar:
Source Serif 4 („Buch“) oder JetBrains Mono („Schreibmaschine“). Alle Schriften sind gebündelt (offline).

## Regeln

- Bausteine nur aus `src/components/ui`. Icon-Buttons haben immer ein `label`.
- Überschriften in Satzschreibung, keine Großbuchstaben-Labels.
- Kacheln unterscheiden sich nach Typ (Wert, Fortschritt, Countdown, Liste, Link) statt identischer Karten.
- Bewegung nur als Antwort auf Aktionen; `prefers-reduced-motion` wird respektiert.
- Mobil: Seitenleiste als Schublade, Kacheln zweispaltig, Touch-Ziele ≥ 24 px, kein horizontales Scrollen der Seite
  (breite Inhalte scrollen in ihrem eigenen Container – absolut positionierte Kinder brauchen dort `relative`).
