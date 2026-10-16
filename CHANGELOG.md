# Changelog

Alle Versionen mit Downloads: [GitHub Releases](https://github.com/flexi03/notiva/releases).
Notiva prüft beim Start und jede Stunde, ob es eine neue Version gibt, und installiert sie auf Wunsch selbst.

## 0.2.0 – 2026-10-16

Größere Umstellung: Module statt Kurse, Unterlagen nach Aktuell/Archiv, Praktika mit einer Seite je Termin.

- **Module statt Kurse:** keine Kurse-Datenbank mehr. Die Modulseite zeigt Unterlagen (`Unterlagen/<Modul>`),
  Moodle-Infos (Beschreibung, Ankündigungen, Ausfälle) und alles Verknüpfte. Ältere Ordner werden nach Rückfrage
  umgestellt (#1).
- **Unterlagen** landen zuverlässiger in Vorlesung bzw. Praktikum & Übung (#2).
- **Aktuell und Archiv:** der aktuelle Kurs liegt direkt im Modul, ältere Semester unter `Archiv/<Semester>`
  (ausgegraut, eingeklappt). Jede Modulseite zeigt ihre Unterlagen so getrennt.
- **Seitenleiste:** Notizen hängen unter ihrem PDF, Dateien und Ordner per Rechtsklick in den Papierkorb (mit
  Rückgängig), die geöffnete Seite wird aufgeklappt, Trennlinie zwischen festen Einträgen und Liste.
- **Abläufe zur Abnahme:** [docs/ABLAEUFE.md](docs/ABLAEUFE.md) – Vorlesung und Praktikum Schritt für Schritt, jeder
  Schritt durch einen Test abgedeckt.
- **Mein Semester:** farbige Modulkarten nebeneinander mit nächstem Termin, Prüfung, Aufgaben, neuestem Skript (#3).
- **Stundenplan** als Wochenansicht in der Seitenleiste (#4).
- **Vorschlagen statt still ändern:** Stundenplan-Zeiten und Studium-Abgleich als Vorschläge zum Abhaken (#5).
- **Anmeldung:** „Neu anmelden“ direkt aus der Benachrichtigung, eine Microsoft-Anmeldung für eCampus und Moodle (#6).
- **„Als Nächstes“** öffnet per Klick das Skript des Tages oder das Modul (#7).
- **Lokales Mini-Modell** (llama.cpp + Qwen) für Commit-Nachrichten, mit Download-Fortschritt (#8).
- **Hilfe:** „So funktioniert Notiva“ in der App, Doku aktualisiert (#9).
- **Auswahl** in Seiten- und Werkzeugleiste als Fläche statt Strich (#10).
- **Einstellungen** neu gegliedert, mit Beschreibung je Bereich und „Über Notiva“ (#11).
- **Statusleiste** unten wie in VS Code:
  - nächster Termin, Bestätigungen und Fortschritt mit Anzahl und Restzeit;
  - „N Vorschläge“, Hilfe, Version und „Problem melden“ (#7, #12, #22).
- **KI-Kontext:** aktuelle Seite oder ganzes PDF per Umschalter (#13).
- **Benachrichtigungen:** jede Prüfung meldet „gefunden – neu“, farbig nach Art. Neue Unterlagen werden vorgeschlagen
  statt still gespeichert. Bestätigungen erscheinen in der Statusleiste statt über dem Inhalt (#14, #24).
- **Git:** Das lokale Modell fasst jede geänderte Datei zusammen und schlägt die Commit-Nachricht automatisch vor (#15).
- **Seitenleiste:** eine Breite für alle Ansichten, Gruppe „Studium“ zum Einklappen, bis zu 8 zuletzt geöffnete
  Dateien (#16, #23).
- **Hilfe:** Ein Klick auf einen Ort zeigt die ausführliche Erklärung und „Öffnen“ (#17).
- **Stundenplan:**
  - Vorschläge nennen ihre Quelle (Moodle-Kurs bzw. Folie und Seite) und werden auch in Einführungsfolien gesucht.
  - Die Modulseite zeigt die Termine des Moduls (#18).
- **Unterlagen neu einlesen:** umsortieren (Notizen wandern mit), Fehlendes laden, neuere Versionen daneben legen.
  „Neue Versionen“ vergleicht sie Seite für Seite; danach entscheidest du: ersetzen oder beide behalten (#19).
- **Stichwörter:** „VL“ und „P01“ werden als Vorlesung bzw. Praktikum erkannt (#20).
- **Externe Links** (z. B. ProjectBase) öffnen im Browser oder im App-Fenster. Git-Projekte holt
  „Repository ins Praktikum holen“ in den Praktikumsordner (#21).
- Behoben: Die ganze Oberfläche ließ sich aus dem Fenster scrollen (#25).
- **Modulseite:**
  - Oben stehen die Termine aus dem Stundenplan (Tag, Zeit, Typ, Raum, nächster Termin, Quelle), direkt änderbar.
  - Bei Praktika: Vorbereitung und Praktikumstermine mit Datum, Uhrzeit und Erinnerung. Notiva schlägt sie aus
    dem Stundenplan und den gefundenen Praktikumsblättern vor; vor dem Eintragen siehst du eine Vorschau.
  - „Links aus Moodle“: Git-Projekte (ProjectBase, auch Snippets) stehen mit „Repository ins Praktikum holen“
    direkt neben dem Link. Erkennt Notiva einen Link nicht sicher, fragt es das lokale Modell.
- **Lose Unterlagen einsortieren:** Dateien, die direkt im Modulordner liegen, kommen nach Rückfrage in Vorlesung,
  Praktikum & Übung oder Sonstiges. Folien wie „DBS2-10_…“ gelten als Vorlesung.
- **Als Nächstes** (Statusleiste) öffnet das Modul und hebt die Dateien hervor, die am wahrscheinlichsten zum
  Termin gehören.
- **Git:** Das lokale Modell schreibt die Commit-Nachricht, solange zeigt das Feld eine Ladeanimation. Die
  Vorlage ist nur noch Rückfallebene, mit Hinweis.
- **KI-Leuchtband** am unteren Fensterrand, solange eine KI arbeitet.
- **Heute:** Tagesübersicht auf jeder Tagesnotiz – Vorlesungen, Prüfungen, Praktika, fällige und überfällige
  Aufgaben, Moodle-Fristen in zeitlicher Reihenfolge.
- **Modulseite – Moodle nach Datum:** anstehende Fristen zuerst, dann Ankündigungen und Links, neueste
  zuerst, mit Semester und Abschnitt. Geholte Repositories öffnen sich über den Link („Im Praktikum: …“).
- **Heute – Demnächst:** Aufgaben, Praktika und Fristen der nächsten 7 Tage, Prüfungen der nächsten 14.
- **Praktika:** eine Seite je Praktikum (P01, P02 …) mit Termin, Vorbereitung, Aufgaben- und
  Vorbereitungsblatt, Repositories, Moodle-Links und eigenen Dateien. „Nach Praktika ordnen“ legt die Seiten an,
  verschiebt Repositories und verbindet die Termine – nach Rückfrage. Neue Repositories fragen nach ihrem Praktikum.
- **Moodle-Kurse pro Modul:** „zählt jetzt“, „anderes Semester (nur ansehen)“ oder „nicht berücksichtigen“ – wirkt
  auf Studium-Abgleich, Stundenplan- und Unterlagen-Vorschläge. Links nach Moodle-Abschnitten.
- **Stundenplan-Vorschläge** bleiben verworfen („Alle verwerfen“, auch beim Schließen des Hinweises).
- **Git:** Herkunft der Commit-Nachricht (KI, Vorlage, von dir) mit Erklärung; Verlauf als Graph wie in VS Code;
  eigener Reiter „Praktikum-Repos“; `.DS_Store` & Co. werden immer ignoriert.
- Behoben: Absturz „t.map is not a function“ auf Seiten mit Verknüpfungen als Text; Links auf PDFs verloren die
  Endung.
- **Git:** PDFs und andere Binärdateien werden in Commits nicht mehr als Text verglichen (das konnte eine
  Minute dauern oder abstürzen); Praktikum-Repos mit farbigem Diff und Änderungsmarken im Editor; „Remote
  hinzufügen“ mit Anleitung; genauere Commit-Beschreibungen (Eigenschaften exakt, Textänderungen darunter).
- **Unterlagen:** ein Ordner pro Kurs-Semester bei Modulen mit mehreren Moodle-Kursen; Anzeige nach Aktuell /
  Ältere Semester / Bestanden.
- **Praktika:** Repositories liegen im gemeinsamen Praktikumsordner und sind mit ihrem Termin (P01 …) verknüpft;
  Beschreibung neben oder über der Datei, Größe ziehbar.
- **Pfad:** Klick neben den Pfad oben zeigt ihn ganz – kopieren, bearbeiten, öffnen.
- **Private Git-Projekte** mit Zugangstoken (verschlüsselt im Schlüsselbund, pro Server); Snippets werden über
  ihre Git-Adresse geholt.
- **Erinnerungen** pro Aufgabe („2 Std. vorher“, „Keine“); Datumsfelder können eine Uhrzeit haben.
- **PDF:** Der Seitenabstand bleibt beim Zoomen gleich, Zoomen ist flüssiger, ←/→ blättern genau eine Seite.
- Behoben: „PDFWorker.create – the worker is being destroyed“ beim Öffnen mancher PDFs.
- Behoben: Unter „Ungelesen“ verschwand eine Benachrichtigung beim Anklicken, bevor man die Details sah.

- **README-Bilder** ohne „Demo“-Hinweise: eigener Screenshot-Build (`npm run screenshots`), normale Builds
  bleiben unverändert.
- **macOS-Signierung vorbereitet:** Mit Developer-ID-Zertifikat und Notarisierungs-Schlüssel als GitHub-Secrets
  baut der Release eine signierte, notarisierte App ([docs/SIGNIEREN.md](docs/SIGNIEREN.md)); ohne sie wie bisher
  ad hoc signiert.

## 0.1.3 – 2026-10-15

- **macOS: „Notiva.app ist beschädigt“ behoben.** Die App wird jetzt beim Bauen als Ganzes (ad hoc) signiert. Beim
  ersten Start fragt macOS nur noch „Apple konnte nicht überprüfen …“ → _Systemeinstellungen → Datenschutz &
  Sicherheit → Dennoch öffnen_.
- README: Installationshinweise für macOS und Windows.

## 0.1.2 – 2026-10-15

- **Fehlermeldungen mit Grund und Ein-Klick-Fix:** bekannte Fehler (Git fehlt, Git-Name/E-Mail fehlen, kein
  Repository, Push abgelehnt, keine Verbindung, Anmeldung abgelaufen, keine Berechtigung, KI nicht eingerichtet …)
  erklärt Notiva in klaren Worten und bietet den passenden Knopf an – sonst „Noch einmal“.
- **Git unter Windows:** statt endlos „Lädt …“ eine Erklärung und „Git installieren“ (winget; macOS: Command Line
  Tools; sonst Download-Seite).
- **Windows-Update repariert:** der Installer läuft erst, wenn Notiva beendet ist; vorher wird alles gespeichert.
- **Benachrichtigungen pro System:** Windows und Linux zeigen keine macOS-Hinweise mehr; Windows-Einstellungen
  öffnen sich direkt, Mitteilungen tragen unter Windows den App-Namen.
- **Prüfungsplan:** nur Termine der letzten 30 Tage und der Zukunft werden eingetragen.
- **Andere Hochschule mit KI:** der Dialog schließt sich, der Hinweis ist schlichter.
- README neu: Notizen, Studium, Code, Anmerkungen und Schnittstellen im Fokus; Hell/Dunkel-Bild.

## 0.1.1 – 2026-10-15

- **Andere Hochschulen:** beim Anlegen „Eigener Studiengang / andere Hochschule“ (Name, Studiengang, ECTS-Ziel) –
  ohne HSD-Adressen. In Studium, Moodle und eCampus ein Hinweis mit drei Wegen: `Hochschule.md` öffnen,
  KI-Assistent fragen oder Issue auf GitHub (Vorlage „Hochschule“).
- **Keine Module vorab:** Ein neues Studium ohne verbundenes Moodle/eCampus legt keine Fächer an; Hinweis und
  Anleitung (Importieren oder selbst anlegen) auf der Seite _Module_.
- **Praktika:** „Praktikum bearbeiten“ in _Mein Semester_ öffnet den Code-Ordner des Moduls mit Editor und Terminal.
- **Stundenplan** aus Moodle-Kurstexten repariert (Einzeltermine, Räume, Übungsgruppen, nur Belegtes).
- **PDF:** flüssiger Zoom zum Mauspunkt, ↑/↓ scrollen, ←/→ ohne Animation.
- **Ablage** statt Papierkorb für schnell abgelegte Dateien und Texte.
- **Mitteilungen** mit Notiva-Logo; Updates werden beim Start und stündlich gesucht.
- Behoben: Chat-Titel, Hinweise über Dialogen.

## 0.1.0 – 2026-10-15

Erste veröffentlichte Version.

- Seiten, Datenbanken (Tabelle, Board, Kacheln, Liste, Kalender), Dashboards und Vorlagen als Markdown-Dateien
- Studium: Moodle, eCampus (HISinOne), Prüfungsplan, Module, Noten, Stundenplan, „Mein Semester“;
  Hochschule über `Studium/Hochschule.md` anpassbar (Standard: HSD)
- PDF-Ansicht mit Suche, flüssigem Zoom, Markierungen und Notizen; Vorlesungsmodus mit lokaler Transkription
- Code-Ordner mit Editor und Terminal, Git eingebaut, KI-Assistent und MCP-Server
- Ablage für schnell abgelegte Dateien und Texte
- Benachrichtigungen und Selbst-Update über GitHub Releases
