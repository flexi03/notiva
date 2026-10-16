# macOS-App signieren und notarisieren

Mit einem Apple-Developer-Konto baut der Release-Workflow ([.github/workflows/release.yml](../.github/workflows/release.yml))
eine **signierte und von Apple notarisierte** App: Sie öffnet sich ohne „Apple konnte nicht überprüfen …“. Ohne die
Secrets bekommt die App wie bisher nur eine Ad-hoc-Signatur – der Build schlägt nicht fehl, er warnt nur.

Einmal einzurichten (ca. 15 Minuten, nur der Kontoinhaber kann das Zertifikat anlegen):

## 1. Zertifikat „Developer ID Application“

Am einfachsten über Xcode: _Xcode → Settings → Accounts_ → Apple-ID wählen → **Manage Certificates…** → **+** →
**Developer ID Application**. Das Zertifikat liegt danach samt privatem Schlüssel im Schlüsselbund.

(Alternativ auf [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/list)
mit einer Zertifikatsanfrage aus der Schlüsselbundverwaltung.)

Prüfen: `security find-identity -v -p codesigning` zeigt `Developer ID Application: <Name> (<Team-ID>)`.

## 2. Als .p12 exportieren

_Schlüsselbundverwaltung → Meine Zertifikate_ → Rechtsklick auf „Developer ID Application: …“ → **Exportieren** →
`notiva.p12`, mit einem neuen Passwort.

## 3. Schlüssel für die Notarisierung

[App Store Connect → Benutzer und Zugriff → Integrationen → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
→ **Team-Schlüssel** → **+** → Name „Notiva Notarisierung“, Zugriff **Developer**. Die `.p8`-Datei lässt sich nur
**einmal** herunterladen. Notieren: **Schlüssel-ID** und **Issuer-ID** (oben auf der Seite).

## 4. Als GitHub-Secrets hinterlegen

Im Terminal im Notiva-Ordner (die Werte landen verschlüsselt bei GitHub, nicht im Repository):

```sh
base64 -i notiva.p12 | gh secret set MAC_CERTIFICATE
gh secret set MAC_CERTIFICATE_PASSWORD          # Passwort aus Schritt 2
gh secret set APPLE_API_KEY < AuthKey_XXXXXXXXXX.p8
gh secret set APPLE_API_KEY_ID                  # Schlüssel-ID
gh secret set APPLE_API_ISSUER                  # Issuer-ID
```

Danach `notiva.p12` und die `.p8`-Datei sicher aufbewahren (z. B. Passwortmanager) und vom Schreibtisch löschen.

## 5. Prüfen

Beim nächsten Release steht im Log des macOS-Builds „notarization successful“. Nach der Installation:

```sh
spctl -a -vv /Applications/Notiva.app   # → accepted, source=Notarized Developer ID
```

Das Zertifikat gilt 5 Jahre; danach Schritt 1, 2 und `MAC_CERTIFICATE*` erneuern.

## Lokal

`npm run dist:mac` signiert mit dem Zertifikat aus dem Schlüsselbund, wenn eins da ist. Notarisiert wird lokal
nur, wenn `APPLE_API_KEY` (Pfad zur .p8), `APPLE_API_KEY_ID` und `APPLE_API_ISSUER` gesetzt sind.
