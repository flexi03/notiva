# Changelog

Alle Versionen mit Downloads: [GitHub Releases](https://github.com/flexi03/notiva/releases).
Notiva prüft beim Start und jede Stunde, ob es eine neue Version gibt, und installiert sie auf Wunsch selbst.

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
