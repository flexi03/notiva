---
icon: 🏫
# Beispiel für eine andere Hochschule. Nach Studium/Hochschule.md in deinem Notizen-Ordner kopieren
# und die Adressen anpassen. Erklärung: docs/HOCHSCHULE.md
# Example for another university: copy to Studium/Hochschule.md in your notes folder and adjust.
hochschule:
  name: Beispiel-Universität
  moodle:
    adresse: https://moodle.example.edu
  ecampus:
    startseite: https://campus.example.edu/qisserver/pages/cs/sys/portal/hisinoneStartPage.faces
    pruefungen: https://campus.example.edu/qisserver/pages/cs/sys/portal/hisinoneIframePage.faces?id=Pruefungsverwaltung
    anmeldung: https://campus.example.edu/qisserver/api/identityprovider/redirect/1/login
  pruefungsplan:
    seite: https://www.example.edu/informatik/pruefungen
    studiengang: INF24
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
    - { nr: INF 02, name: Mathematik 1, ects: 6, semester: 1, offered: WiSe, exam: Klausur }
    - { nr: INF 03, name: Rechnernetze, ects: 5, semester: 2, offered: SoSe, exam: Klausur }
    - { nr: INF 04, name: Datenbanken, ects: 5, semester: 3, offered: WiSe, exam: Projekt }
---

# Hochschule

Hier steht alles, was an deiner Hochschule anders ist. Ohne `studiengang:` nutzt Notiva die Module oben.
