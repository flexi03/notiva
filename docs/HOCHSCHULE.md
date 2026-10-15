# Notiva an eine Hochschule anpassen

Notiva ist auf die **Hochschule Düsseldorf** (Moodle, eCampus/HISinOne, Prüfungspläne des FB Medien,
B.Sc. Medieninformatik PO 2018) eingestellt. Alles, was an einer anderen Hochschule anders ist, steht an
**einer** Stelle: der Seite `Studium/Hochschule.md` im Studienordner.

```yaml
hochschule:
  name: Uni X
  moodle:
    adresse: https://moodle.uni-x.de
  ecampus: # HISinOne / QIS
    startseite: https://campus.uni-x.de/qisserver/pages/cs/sys/portal/hisinoneStartPage.faces
    pruefungen: https://campus.uni-x.de/qisserver/pages/cs/sys/portal/hisinoneIframePage.faces?id=…
    anmeldung: https://campus.uni-x.de/qisserver/api/identityprovider/redirect/1/login
  pruefungsplan:
    seite: https://fb.uni-x.de/pruefungen # Seite, die die Prüfungsplan-PDFs verlinkt
    studiengang: INF20 # Kürzel des Studiengangs im Plan
  studiengang: hsd-bmi-2018 # eingebauter Katalog – oder eigene Module:
  module:
    - {
        nr: INF 01,
        name: Programmieren 1,
        ects: 6,
        semester: 1,
        offered: WiSe,
        exam: Klausur,
        prerequisite: Praktikum,
      }
    - { nr: INF 02, name: Mathematik 1, ects: 6, semester: 1, offered: WiSe }
```

- **Selbst:** die Seite in Notiva öffnen (Quelltext-Ansicht) und die Werte ändern.
- **Mit dem KI-Assistenten:** „Stelle Notiva auf die Uni X ein: Moodle ist …, eCampus …, Modulhandbuch …“.
  Der Assistent kennt die Seite und ändert nur dort.
- Ungültige Adressen (kein `https`) werden ignoriert, es gilt dann der HSD-Wert.

## Wo das im Code steckt

| Teil                            | Datei                                             | Anpassbar über           |
| ------------------------------- | ------------------------------------------------- | ------------------------ |
| Profil (Standard HSD, Einlesen) | `src/lib/university.ts`                           | `hochschule:`            |
| Modulkatalog (PO)               | `src/lib/study/catalog.ts`                        | `studiengang` / `module` |
| eCampus-Ergebnistabelle         | `src/lib/ecampus.ts` (`COLUMNS`, `parseResults`)  | Spaltennamen per Regex   |
| Prüfungsplan-Tabelle            | `src/lib/examPlan.ts` (`COLUMNS`)                 | Spaltennamen per Regex   |
| Moodle                          | `electron/moodle.ts` (Web-Service der Moodle-App) | Adresse                  |

Ein neuer eingebauter Studiengang ist ein Eintrag in `PROGRAMS` (`src/lib/study/catalog.ts`) – Daten aus dem
Modulhandbuch: Nummer, Name, ECTS, Fachsemester, Angebot (WiSe/SoSe), Prüfungsform, Voraussetzung.

## Andere Hochschule von Anfang an

Beim Anlegen „Eigener Studiengang / andere Hochschule“ wählen (Hochschule, Studiengang, ECTS-Ziel). Notiva schreibt
dann ein Profil mit `vorlage: keine` – ohne HSD-Adressen als Rückfall. Moodle-, eCampus- und Prüfungsplan-Adressen
trägst du selbst ein (oder der KI-Assistent). Module kommen beim Abgleich aus Moodle/eCampus, aus `module:` oder
werden in _Module_ mit „+ Neu“ angelegt.

Klappt etwas nicht? [Issue auf GitHub](https://github.com/flexi03/notiva/issues/new?template=hochschule.md) mit
der Vorlage „Hochschule“ – dann wird die Hochschule fest eingebaut.
