# Changelog

Alle Versionen mit Downloads: [GitHub Releases](https://github.com/flexi03/notiva/releases).
Notiva prüft beim Start und jede Stunde, ob es eine neue Version gibt, und installiert sie auf Wunsch selbst.

## 0.1.4 – noch nicht veröffentlicht

- **Module statt Kurse:** keine Kurse-Datenbank mehr. Die Modulseite zeigt Unterlagen (`Unterlagen/<Modul>`),
  Moodle-Infos (Beschreibung, Ankündigungen, Ausfälle) und alles Verknüpfte. Ältere Ordner werden nach Rückfrage
  umgestellt (#1).
- **Unterlagen** landen zuverlässiger in Vorlesung bzw. Praktikum & Übung (#2).
- **Mein Semester:** farbige Modulkarten nebeneinander mit nächstem Termin, Prüfung, Aufgaben, neuestem Skript (#3).
- **Stundenplan** als Wochenansicht in der Seitenleiste (#4).
- **Vorschlagen statt still ändern:** Stundenplan-Zeiten und Studium-Abgleich als Vorschläge zum Abhaken (#5).
- **Anmeldung:** „Neu anmelden“ direkt aus der Benachrichtigung, eine Microsoft-Anmeldung für eCampus und Moodle (#6).
- **„Als Nächstes“** öffnet per Klick das Skript des Tages oder das Modul (#7).
- **Lokales Mini-Modell** (llama.cpp + Qwen) für Commit-Nachrichten, mit Download-Fortschritt (#8).
- **Hilfe:** „So funktioniert Notiva“ in der App, Doku aktualisiert (#9).
- **Auswahl** in Seiten- und Werkzeugleiste als Fläche statt Strich (#10).
- **Einstellungen** neu gegliedert, mit Beschreibung je Bereich und „Über Notiva“ (#11).

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
