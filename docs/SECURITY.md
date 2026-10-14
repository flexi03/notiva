# Sicherheit

Notiva verarbeitet Dateien, die aus anderen Quellen stammen können (Sync, Downloads, geteilte Ordner).
Deshalb gilt **jede Datei als nicht vertrauenswürdig**.

| Risiko                     | Schutz                                                                                                                                                                       | Tests                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| XSS über Markdown/HTML     | markdown-it + DOMPurify, verbotene Tags/Attribute, nur http(s)/mailto-Links, `rel="noopener noreferrer"`                                                                     | `markdown.test.ts`, `e2e/security.spec.ts`                                          |
| Code-Ausführung in Formeln | eigener Parser/Interpreter, kein `eval`/`Function` (ESLint), keine geerbten Schlüssel (`constructor`), Längen-/Tiefen-/Schrittlimits                                         | `formula.test.ts`                                                                   |
| YAML-Angriffe              | `core`-Schema (keine Tags), Alias-Limit (Billion Laughs), kein Prototype Pollution                                                                                           | `frontmatter.test.ts`                                                               |
| Pfad-Traversal             | `assertSafePath` in jedem Adapter, im Electron-Hauptprozess zusätzlich `realpath`-Prüfung gegen Symlinks                                                                     | `path.test.ts`, `vault.test.ts`, `electron/vaultFs.test.ts`, `e2e/electron.spec.ts` |
| Manipulierte Adressen      | Routen werden validiert, unsichere Pfade führen zur Startseite                                                                                                               | `settings-route.test.ts`, `e2e/security.spec.ts`                                    |
| Datenabfluss               | CSP: keine fremden Skripte, keine Verbindungen (`connect-src 'self'`), keine Frames/Objekte; eigenes CSS ohne `url()`/`@import`                                              | `e2e/security.spec.ts`                                                              |
| Electron                   | contextIsolation, Sandbox, kein Node, `app://` mit CSP, IPC nur vom eigenen Fenster, Navigation und neue Fenster gesperrt, Berechtigungen abgelehnt, DevTools nur unverpackt | `e2e/electron.spec.ts`                                                              |
| Datenverlust               | atomares Schreiben (Desktop), Papierkorb mit Wiederherstellen, serialisierte Schreibvorgänge, Speichern beim Verlassen                                                       | `workspace.test.ts`                                                                 |

Bilder von `https:` sind erlaubt (Markdown-Bilder aus dem Netz); wer das nicht möchte, entfernt `https:` aus `img-src`
in `index.html` und `electron/main.ts`.

Sicherheitsprobleme bitte nicht öffentlich melden, sondern direkt an den Maintainer (GitHub: flexi03).
