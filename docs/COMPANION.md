# Notiva für iPhone und iPad (Companion-App)

Eine eigene App in SwiftUI für iPhone, iPhone Duo und iPad. Sie arbeitet mit dem Ordner auf deinem Mac – ohne
Cloud. Verteilt wird sie über TestFlight (Apple-Developer-Konto, Team `6728DRMDL9`).

## Was die App kann

- **Heute & Stundenplan:** Tagesübersicht wie in der Desktop-App (Vorlesungen mit Raum, Prüfungen, Fristen mit
  Abgabestatus, Praktika), „Lernen heute“, Wochenansicht.
- **Aufgaben:** ansehen, abhaken, neu anlegen.
- **Schnell ablegen:** Foto (z. B. Tafel), Text oder Datei – landet in der Ablage auf dem Mac.
- **Seiten:** lesen und bearbeiten (Markdown).
- **PDFs:** lesen und markieren; Markierungen und Notizen landen in derselben `… (Notizen).md` wie am Mac.

## Aufbau

```
iPhone / iPad (SwiftUI)                          Mac (Notiva-Desktop-App)
┌──────────────────────────┐   WLAN / Tailscale  ┌──────────────────────────────────────┐
│ Ansichten (SwiftUI)      │ ─────────────────▶  │ Hauptprozess: Transport + Kryptografie │
│ Speicher (letzter Stand) │  HTTP, Inhalt mit   │   (electron/companion.ts)             │
│ Warteschlange (offline)  │  AES-256-GCM        │        │ IPC                          │
│ CryptoKit                │ ◀─────────────────  │ Oberfläche: dieselbe Logik wie „Heute“ │
└──────────────────────────┘                     │   (src/app/companion.ts, Workspace)   │
                                                 └──────────────────────────────────────┘
```

- **Koppeln:** _Einstellungen → Handy koppeln_ zeigt einen QR-Code mit Adressen (WLAN, Tailscale), Port und einem
  zufälligen 256-Bit-Schlüssel nur für dieses Gerät. Der Schlüssel wird nie übertragen.
- **Verschlüsselung:** Jede Anfrage und Antwort ist mit AES-256-GCM verschlüsselt und trägt Zeitstempel und
  Zufallszahl (gegen Wiederholung). Ohne passenden Schlüssel antwortet der Mac nichts. Ein Gerät lässt sich jederzeit
  entkoppeln.
- **Eine Logik:** Der Hauptprozess kümmert sich nur um Transport und Kryptografie. Die Antworten baut die Oberfläche
  mit demselben Code wie „Heute“, Lernplan und Ablage (`studyEvents`, `planFrom` …). Schreiben geht über den
  `Workspace` – Links, Git-Anzeige und Moodle-Zuordnung bleiben stimmig.
- **Offline:** Die App zeigt den letzten Stand. Was du offline änderst (abhaken, ablegen, Seite bearbeiten), wartet
  in einer Warteschlange und wird übertragen, sobald der Mac erreichbar ist. Konflikte (Seite inzwischen am Mac
  geändert) werden angezeigt statt überschrieben.
- **Gerät finden:** Adressen aus dem QR-Code, dazu Bonjour (`_notiva._tcp`) im WLAN, falls sich die Adresse ändert.

## Schnittstelle (v1)

| Anfrage                           | Inhalt                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| `hello`                           | Name des Ordners, Version, ob die Kopplung gilt                       |
| `day` (Datum)                     | Einträge des Tages + „Demnächst“ + Lernplan-Portionen                 |
| `week`                            | Stundenplan der Woche                                                 |
| `tasks` / `task.set` / `task.add` | Aufgaben (mit Modul, Art, Priorität); abhaken, anlegen                |
| `modules`                         | Module (für neue Aufgaben)                                            |
| `shelf.add`                       | Text oder Datei (Foto) in die Ablage                                  |
| `pages` / `page` / `page.put`     | Seitenliste, Seite lesen, Seite schreiben (mit Stand gegen Konflikte) |
| `file`                            | Datei (PDF) in Stücken                                                |
| `notes` / `notes.put`             | Markierungen und Notizen eines PDFs                                   |

## Schritte (je ein Issue)

1. Sync-Dienst in der Desktop-App: Kopplung per QR, verschlüsselte Schnittstelle, Gerät entkoppeln.
2. App-Grundgerüst (iPhone, iPhone Duo, iPad), Koppeln, Offline-Speicher, TestFlight.
3. Heute & Stundenplan.
4. Aufgaben abhaken und anlegen.
5. Schnell ablegen (Foto, Text, Datei).
6. Seiten lesen und bearbeiten.
7. PDFs lesen und markieren.

Nach jedem Schritt: Tests (Desktop: Vitest/Playwright, App: Swift-Tests + UI-Tests im Simulator für iPhone,
iPhone Duo und iPad), dann ein TestFlight-Build zum Ausprobieren. Ab Schritt 2 läuft jeder Build per TestFlight auf
deinem Gerät.
