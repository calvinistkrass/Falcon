# Falcon

Ein schlanker Chromium-Browser für Gamer, gebaut mit Electron. Läuft auf Windows; macOS und Linux sind vorbereitet.

## Entwicklung

```
npm install
npm start
```

## Build

```
npm run dist        # Windows: Installer + portable .exe in dist/
npm run dist:all    # zusätzlich macOS/Linux (macOS nur auf einem Mac)
```

## Funktionen

- **Tabs** – ziehen zum Sortieren, Mittelklick schließt, Kontextmenü (Duplizieren, Stummschalten, Schlafen legen, Andere schließen …), Sitzung wird wiederhergestellt
- **Adressleiste** – Vorschläge aus Verlauf, Lesezeichen und offenen Tabs, Inline-Vervollständigung, Domain-Hervorhebung, Zoom pro Website
- **Game Mode** – legt Hintergrund-Tabs schlafen und schaltet Animationen ab
- **Leistungsanzeige** – CPU und Arbeitsspeicher live, mit Verlaufsgrafik
- **Werbe- und Trackerblocker**
- **Seitenleiste** – Discord, Twitch, Spotify, YouTube Music, WhatsApp neben der Seite, Breite verstellbar
- **Lesezeichen** – Leiste mit Kontextmenü, Import/Export als HTML (Chrome, Edge, Firefox, Opera) oder JSON
- **Passwörter** – verschlüsselt gespeichert (Windows DPAPI), automatisches Ausfüllen, Import/Export als CSV; Anzeigen, Kopieren, Import und Export werden mit Windows Hello (bzw. Touch ID) bestätigt
- **Sprachen** – Deutsch, English, Français, Español, Türkçe (oder Systemsprache)
- Downloads, Suche in Seite, Bild-in-Bild, eigenes Kontextmenü mit Rechtschreibvorschlägen, Fehlerseiten

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/main.js` | Hauptprozess: Fenster, Einstellungen, Downloads, Werbeblocker, IPC |
| `src/preload.js` | Sichere Brücke zwischen Hauptprozess und Oberfläche |
| `src/passwords.js` | Verschlüsselter Passwortspeicher, CSV-Import/-Export |
| `src/auth.js` | Bestätigung per Windows Hello / Touch ID |
| `src/webview-preload.js` | Autofill und Login-Erkennung in Webseiten |
| `src/bookmarks-io.js` | Lesezeichen-Import/-Export |
| `src/i18n-main.js` | Übersetzungen für Systemdialoge |
| `src/updater.js` | Update-Prüfung über GitHub Releases |
| `src/passkeys.js`, `src/auth-window/` | Passkeys (iPhone, Android, Sicherheitsschlüssel) |
| `src/google-signin.js` | Ermöglicht die Google-Anmeldung |
| `src/ui/index.html`, `styles.css` | Oberfläche |
| `src/ui/js/` | Module der Oberfläche (Tabs, Adressleiste, Lesezeichen, Panels, Einstellungen …) |
| `src/ui/locales/` | Übersetzungen der Oberfläche |
| `src/ui/newtab.html` | Startseite |
| `assets/` | `falcon.ico`, `falcon.png` |

## Mit GitHub verbinden (Updates)

Falcon sucht beim Start und alle vier Stunden auf GitHub nach einer neueren Version und zeigt dann oben rechts einen **Update**-Knopf. Die installierte Version lädt das Update herunter und installiert es beim Neustart; die portable `.exe` verweist auf die Release-Seite.

Einmalig einrichten:

1. Repository auf GitHub anlegen (öffentlich), z. B. `falcon`.
2. In `package.json` den Platzhalter ersetzen:
   ```json
   "repository": "github:DEIN-GITHUB-NAME/falcon"
   ```
3. Projekt hochladen:
   ```
   git init
   git add .
   git commit -m "Falcon 1.2.0"
   git branch -M main
   git remote add origin https://github.com/DEIN-GITHUB-NAME/falcon.git
   git push -u origin main
   ```

## Update veröffentlichen

1. Version in `package.json` erhöhen (z. B. `1.2.0` → `1.3.0`) und in `CHANGELOG.md` eintragen.
2. Committen und einen passenden Tag pushen:
   ```
   git commit -am "Version 1.3.0"
   git tag v1.3.0
   git push && git push --tags
   ```
3. Die GitHub Action (`.github/workflows/release.yml`) baut Falcon und legt das Release mit Installer, portabler `.exe` und `latest.yml` an. Alle installierten Falcon-Versionen erkennen es automatisch.

## Neue Sprache hinzufügen

1. `src/ui/locales/en.js` kopieren, z. B. nach `it.js`, und `I18N.add('it', …)` übersetzen
2. In `src/ui/index.html` einbinden und in `src/ui/js/i18n.js` unter `LANGUAGES` eintragen
3. Systemdialoge in `src/i18n-main.js` und die Startseite in `src/ui/newtab.html` ergänzen
