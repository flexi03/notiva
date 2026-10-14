/** First page in every new vault: a short tour that doubles as a feature showcase. */
export const WELCOME_PAGE = `---
icon: 👋
---
Notiva speichert alles als **Markdown-Dateien** in deinem Ordner. Du kannst sie mit jedem Editor öffnen, mit Git versionieren oder per iCloud/Syncthing synchronisieren.

> [!tip] Schnellstart
> - Klicke auf einen Block, um ihn zu bearbeiten. Tippe \`/\` für Befehle.
> - **⌘K / Strg+K** öffnet die Suche, **⌘N / Strg+N** legt eine neue Seite an.
> - Unter **Vorlagen** findest du fertige Bereiche wie das Studien-Dashboard.

## Was Markdown hier kann

- [x] Aufgabenlisten zum Abhaken
- [ ] Links auf andere Seiten mit \`[[Seitenname]]\`
- Tags wie #idee sammeln Seiten unter einem Stichwort
- Formeln: $E = mc^2$ und Code mit Hervorhebung

\`\`\`ts
const lernzeit = (stunden: number) => stunden * 60
\`\`\`

<details><summary>Aufklappbereich</summary>

Inhalt, der erst beim Klicken erscheint.

</details>
`
