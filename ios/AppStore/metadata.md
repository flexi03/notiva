# App Store und TestFlight – Texte

Zum Einfügen in App Store Connect (App „Notiva“, `io.github.flexi03.notiva.ios`). Screenshots: `screenshots/`
(iPhone 6,9": `iPhone18ProMax`, iPad 13": `iPadPro13inchM5`) – neu erzeugt mit `ios/scripts/test.sh`.

## Allgemein

| Feld | Wert |
| --- | --- |
| Kategorie | Produktivität (zweite: Bildung) |
| Altersfreigabe | 4+ |
| Support-URL | https://github.com/flexi03/notiva/issues |
| Marketing-URL | https://github.com/flexi03/notiva |
| Datenschutz-URL | https://github.com/flexi03/notiva/blob/main/docs/PRIVACY.md |
| Datenschutz-Angaben („App-Datenschutz“) | **Keine Daten erfasst** |
| Copyright | © 2026 flexi03 |

## Deutsch

**Name (30):** Notiva

**Untertitel (30):** Studium vom Mac aufs iPhone

**Werbetext (170):** Heute, Stundenplan, Aufgaben und dein Lernplan – direkt aus deinem Notiva-Ordner auf dem Mac. Verschlüsselt über dein WLAN, ganz ohne Cloud.

**Beschreibung:**

Notiva bringt dein Studium aus der Notiva-App auf deinem Mac aufs iPhone und iPad.

HEUTE AUF EINEN BLICK
Vorlesungen mit Raum (die laufende hervorgehoben), Prüfungen, Praktika, Fristen mit Abgabestatus aus Moodle, überfällige Aufgaben und „Demnächst“.

DEIN LERNPLAN
Die Portion für heute aus deinen Lernplänen – abhaken, auch offline. Notiva am Mac verteilt den Rest neu.

STUNDENPLAN
Deine Woche mit Zeiten und Räumen; auf dem iPad alle Tage nebeneinander.

PRIVAT
Dein iPhone verbindet sich direkt mit deinem Mac – im WLAN oder über Tailscale. Jede Verbindung ist verschlüsselt, mit einem eigenen Schlüssel pro Gerät. Keine Cloud, kein Konto, keine Werbung, keine Analyse.

OFFLINE
Unterwegs ohne Mac? Notiva zeigt den letzten Stand; was du abhakst, wird übertragen, sobald der Mac wieder erreichbar ist.

Voraussetzung: die kostenlose Notiva-Desktop-App auf deinem Mac (github.com/flexi03/notiva).

**Schlüsselwörter (100):** Studium,Stundenplan,Moodle,Uni,Hochschule,Lernplan,Prüfung,Vorlesung,Notizen,Markdown,Semester

**Neu in dieser Version:** Heute und Stundenplan – mit Lernplan zum Abhaken.

## English

**Name (30):** Notiva

**Subtitle (30):** Your studies, Mac to iPhone

**Promotional text (170):** Today, timetable, tasks and your study plan – straight from your Notiva folder on the Mac. Encrypted over your Wi-Fi, no cloud at all.

**Description:**

Notiva brings your studies from the Notiva app on your Mac to your iPhone and iPad.

TODAY AT A GLANCE
Lectures with their room (the current one highlighted), exams, labs, deadlines with their Moodle submission state, overdue tasks and "Coming up".

YOUR STUDY PLAN
Today's portion of your study plans – tick it off, offline too. Notiva on the Mac spreads the rest again.

TIMETABLE
Your week with times and rooms; on the iPad all days side by side.

PRIVATE
Your iPhone connects straight to your Mac – on your Wi-Fi or via Tailscale. Every connection is encrypted, with its own key per device. No cloud, no account, no ads, no analytics.

OFFLINE
Away from the Mac? Notiva shows the last state; what you tick off is sent as soon as the Mac is reachable again.

Requires the free Notiva desktop app on your Mac (github.com/flexi03/notiva).

**Keywords (100):** studies,timetable,Moodle,university,college,study plan,exam,lecture,notes,markdown,semester

**What's new:** Today and timetable – with your study plan to tick off.

## TestFlight

**Beta-App-Beschreibung:** Notiva fürs iPhone und iPad: dein Studium aus der Notiva-Desktop-App – Heute, Stundenplan, Lernplan. Verbindung verschlüsselt über WLAN oder Tailscale.

**Was testen (Build mit Heute & Stundenplan):**
1. Am Mac Notiva öffnen → Einstellungen → Speicher & Daten → iPhone & iPad → „iPhone oder iPad koppeln“, QR-Code scannen.
2. „Heute“: stimmen Vorlesungen, Räume, Fristen und „Demnächst“ mit dem Mac überein? Lernplan-Thema abhaken – am Mac erscheint der Haken.
3. Mit den Pfeilen andere Tage ansehen; „Stundenplan“ zeigt die Woche (iPad: nebeneinander).
4. Mac zuklappen: die App zeigt den letzten Stand und unten den Hinweis; Abgehaktes wird später übertragen.

**Feedback-E-Mail:** (deine Apple-ID-Adresse)

## Hinweis für die App-Prüfung (später, vor dem öffentlichen Release)

Apple prüft Apps ohne den Mac des Nutzers. Vor dem App-Store-Release braucht die App deshalb einen Demo-Modus („Ohne Mac ausprobieren“ mit Beispieldaten), sonst lehnt die Prüfung sie ab. Für interne TestFlight-Tests ist das nicht nötig.
