# Abläufe (zur Abnahme)

So soll Notiva im Studienalltag benutzt werden – Schritt für Schritt, mit dem, was du siehst, und wo die
Dateien liegen. Jeder Schritt ist durch einen automatischen Test abgedeckt
([e2e/electron-userflows.spec.ts](../e2e/electron-userflows.spec.ts)); läuft der Test, funktioniert der Ablauf
so, wie er hier steht.

Beispiel: Modul **Datenbanken** mit einer Vorlesung (heute) und einem Praktikum (P02).

Suchen geht in beiden Abläufen jederzeit mit **⌘K** – auch im Text der PDFs (Bereich „In Skripten“, mit Seite).

## Entscheidungen (von dir, 16.10.2026)

| Frage                          | Entscheidung                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unterlagen mit mehreren Kursen | Der **aktuelle** Kurs liegt direkt im Modul (`Vorlesung`, `Praktikum & Übung`, `Sonstiges`). Ältere Semester unter `Archiv/<Semester>` – ausgegraut, eingeklappt. Nicht berücksichtigte Kurse: ausgeblendet.                |
| Praktikumsordner               | **Ein Arbeitsordner für alle Praktika.** Repos und eigene Dateien liegen zusammen im Praktikumsordner, das Terminal startet dort. Die Seiten P01, P02 … ordnen nur: Termin, Vorbereitung, Blätter, welches Repo dazugehört. |
| Repos                          | Jedes Repo ist ein eigener Unterordner (Git braucht das). Pfad im Praktikumsordner per „Pfad kopieren“.                                                                                                                     |
| Umstellungen an deinen Daten   | Erst ein Probelauf mit Liste, dann nach deinem OK ausführen und mit klarer Nachricht committen.                                                                                                                             |

## Ordner im Überblick

```
Studium/
  Unterlagen/Datenbanken/
    Vorlesung/        DBS-03_SQL.pdf, DBS-03_SQL (Notizen).md   ← aktueller Kurs
    Praktikum & Übung/ DBS_Praktikum_02.pdf, DBS - Praktikum 02 - Vorbereitungsblatt.pdf
    Archiv/WiSe 25-26/ …                                         ← ältere Semester
  Module/Datenbanken.md                 Modulseite: Termine, Praktikum, Unterlagen, Moodle
  Module/Datenbanken/Praktikum.md       Praktikumsordner (Seite)
  Module/Datenbanken/Praktikum/         Arbeitsordner: Repos + eigene Dateien, Terminal startet hier
    praktikum-2/                        Repo von P02 (eigenes Git)
  Module/Datenbanken/Praktikum/P02.md   Seite des Praktikums P02 (Termin, Vorbereitung, Blätter, Repo)
  Aufgaben/Datenbanken – P02 Praktikumstermin.md / … P02 Vorbereitung.md
```

## Ablauf 1: Vorlesung

| #   | Ziel                   | So geht's                                 | Was du siehst                                                                                                       | Test                  |
| --- | ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Was ist heute dran?    | Seitenleiste **Heute**                    | Tagesübersicht: „Datenbanken · Vorlesung“ mit Uhrzeit, darunter „Demnächst“                                         | `Vorlesung` Schritt 1 |
| 2   | Zur Vorlesung          | Klick auf den Termin                      | Modulseite **Datenbanken**, oben „Für diesen Termin“ mit dem passenden Skript (wahrscheinlichstes zuerst)           | Schritt 2             |
| 3   | Skript öffnen          | Klick auf das Skript                      | Das PDF, daneben Seitennotizen                                                                                      | Schritt 3             |
| 4   | Mitschreiben           | Text markieren, Notiz zur Seite schreiben | Markierung im PDF; gespeichert in `… (Notizen).md` neben dem PDF                                                    | Schritt 4             |
| 5   | Wiederfinden           | Seitenleiste: PDF aufklappen              | Die Notiz-Seite hängt **unter** ihrem PDF                                                                           | Schritt 5             |
| 6   | Nur Aktuelles sehen    | Modulseite → Unterlagen                   | „Aktuell“ (markiert, offen), „Archiv – ältere Semester“ (ausgegraut, zu)                                            | Schritt 6             |
| 7   | Für die Prüfung lernen | Modulseite → Prüfungsvorbereitung         | Probeklausur mit „Lösung“, Übungsblätter, Klausurhinweise; abhaken → „1 von 2 bearbeitet“ (steht in der Modulseite) | Schritt 7             |

## Ablauf 2: Praktikum

| #   | Ziel               | So geht's                                                                                             | Was du siehst                                                                    | Test                  |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------- |
| 1   | Termine anlegen    | Modulseite → Praktikum → **Termine planen** → **Eintragen**                                           | Liste der Termine mit Vorbereitung; Seiten P01, P02 … im Praktikumsordner        | `Praktikum` Schritt 1 |
| 2   | P02 ansehen        | Seitenleiste **Praktika** → **P02**                                                                   | Termin + Vorbereitung, Blätter (Aufgabe, Vorbereitungsblatt)                     | Schritt 2             |
| 3   | Vorbereiten        | P02 → **Vorbereitung** → Link aufs Vorbereitungsblatt                                                 | Das **PDF** öffnet (keine leere Seite)                                           | Schritt 3             |
| 4   | Repo holen         | Praktikumsordner → Link → **Repository ins Praktikum holen** → P02 (vorgeschlagen) → Name → **Holen** | Repo-Seite (Beschreibung, Dateien, „Meine Notizen“); Repo liegt im Arbeitsordner | Schritt 4             |
| 5   | Arbeiten           | Datei im Repo öffnen und ändern                                                                       | Editor mit Änderungsmarken am Rand; oben Repo + P02                              | Schritt 5             |
| 6   | Sichern            | Git → **Praktikum-Repos** → Datei ansehen → Commit                                                    | Farbiger Vergleich; Commit im Repo (nicht im Ordner-Git)                         | Schritt 6             |
| 7   | Alles an einem Ort | P02-Seite                                                                                             | Termin, Vorbereitung, Blätter, Repo zusammen                                     | Schritt 7             |

## Ablauf 3: Auf die Prüfung lernen

| #   | Ziel             | So geht's                                              | Was du siehst                                                                        | Test                 |
| --- | ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------- |
| 1   | Rechtzeitig dran | Modulseite (oder Benachrichtigung)                     | „Prüfung in 20 Tagen – ein Lernplan verteilt 2 Themen …“ mit Starten / Später / Nein | `Lernplan` Schritt 1 |
| 2   | Später erinnern  | **In 3 Tagen erinnern**                                | Der Vorschlag ist weg, „Lernplan starten“ bleibt                                     | Schritt 2            |
| 3   | Plan einrichten  | **Lernplan starten** → Lerntage wählen → **Speichern** | „1 von 2 Themen · noch N Lerntage“, heute: die Vorlesung                             | Schritt 3            |
| 4   | Heute lernen     | **Heute** → „Lernen heute“ → abhaken                   | Haken in der Modulseite (gemeinsam mit der Prüfungsvorbereitung)                     | Schritt 4            |

## Was ausdrücklich nicht passiert

- Notiva verschiebt oder löscht nichts ohne Liste und Bestätigung.
- Ein fehlender Datei-Link legt keine leere Seite an, sondern sagt, dass die Datei fehlt.
- Geholte Repos landen nicht im Git deines Ordners (eigene Geschichte, Reiter „Praktikum-Repos“).
