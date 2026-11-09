<div align="center">

<img src="docs/logo.png" width="112" alt="Falcon logo" />

# Falcon

**A fast, focused Chromium browser built for gamers.**

Game Mode frees up RAM and CPU while you play. Discord, Twitch and Spotify stay one click away in the sidebar.

[![Latest release](https://img.shields.io/github/v/release/calvinistkrass/Falcon?style=flat-square&color=7c6cff&label=release)](https://github.com/calvinistkrass/Falcon/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/calvinistkrass/Falcon/total?style=flat-square&color=3b9eff)](https://github.com/calvinistkrass/Falcon/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-2ec4b6?style=flat-square)](#installation)
[![License](https://img.shields.io/github/license/calvinistkrass/Falcon?style=flat-square&color=3dd68c)](LICENSE)

[**Download**](https://github.com/calvinistkrass/Falcon/releases/latest) · [Features](#features) · [Screenshots](#screenshots) · [Building from source](#building-from-source) · [Changelog](CHANGELOG.md)

<br />

<img src="docs/screenshots/new-tab.png" alt="Falcon start page" width="860" />

</div>

<br />

## Features

### 🎮 Made for gaming
- **Game Mode**: puts background tabs to sleep and turns off animations, so your game gets the memory and CPU. Tabs playing audio stay awake.
- **Performance meter**: live CPU and memory usage in the toolbar, with a 60-second graph.
- **Sidebar apps**: Discord, Twitch, Spotify, YouTube Music and WhatsApp next to the page. They keep running in the background, and the panel is resizable.
- **Picture-in-picture**: pop any video out into a floating window with one click.

### 🧭 A browser that stays out of your way
- **Tabs that behave like Chrome's**: drag to reorder, middle-click to close, duplicate, mute, put to sleep, reopen closed tabs. Your session is restored on startup.
- **Smart address bar**: suggestions from history, bookmarks and open tabs, inline autocomplete and domain highlighting.
- **Per-site zoom**, find in page, downloads with progress, and a custom right-click menu with spell-check suggestions.
- **Built-in ad and tracker blocker**.

### 🔐 Passwords & security
- **Password manager**: saves logins encrypted with your Windows account (DPAPI) and fills them in automatically.
- **Unlock with passkeys**: confirm with your **iPhone, Android phone or a security key** before passwords are shown, copied, imported or exported. Falcon asks with a small prompt first and falls back to Windows Hello.
- **Import & export** passwords as CSV from Chrome, Edge, Opera, Brave, Firefox or Bitwarden.
- **Google sign-in works**, unlike in most Electron-based browsers.

### ✨ Everything else
- **5 languages**: English, Deutsch, Français, Español, Türkçe. Falcon follows your system language by default.
- **Bookmarks bar** with an overflow menu and HTML/JSON import and export.
- **7 accent colors**, native Windows 11 window controls with Snap Layouts.
- **Automatic updates** from GitHub Releases.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/menu.png" alt="Main menu" /><p align="center"><sub>Main menu with zoom controls</sub></p></td>
    <td width="50%"><img src="docs/screenshots/performance.png" alt="Performance and Game Mode" /><p align="center"><sub>Performance meter and Game Mode</sub></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/address-bar.png" alt="Address bar suggestions" /><p align="center"><sub>Address bar suggestions</sub></p></td>
    <td width="50%"><img src="docs/screenshots/passwords.png" alt="Passwords and passkeys" /><p align="center"><sub>Passwords protected by passkeys</sub></p></td>
  </tr>
</table>

## Installation

1. Download **`Falcon-Setup-x.y.z.exe`** from the [releases page](https://github.com/calvinistkrass/Falcon/releases/latest) and run it. After that, Falcon keeps itself up to date.
2. Windows SmartScreen may warn you because the app isn't code-signed yet. Click **More info → Run anyway**.

### Unlocking passwords with your iPhone or Android phone

1. Open **Settings → Passwords** and click **Add passkey**.
2. In the Windows dialog, choose **iPhone, iPad or Android device** and scan the QR code with your phone's camera.
3. From now on, Falcon asks for your phone before passwords are shown, copied, imported or exported.

Bluetooth must be turned on on your PC; Windows uses it to check that your phone is nearby.

## Building from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/calvinistkrass/Falcon.git
cd Falcon
npm install
npm start          # run in development
npm run dist       # build the installer into dist/
```

### Project structure

| Path | Purpose |
| --- | --- |
| `src/main.js` | Main process: window, settings, downloads, ad blocker, IPC |
| `src/preload.js` | Secure bridge between the main process and the UI |
| `src/ui/` | Browser UI (`index.html`, `styles.css`, modules in `js/`, translations in `locales/`) |
| `src/ui/newtab.html` | Start page |
| `src/passwords.js` | Encrypted password store, CSV import/export |
| `src/passkeys.js`, `src/auth-window/` | Passkey (WebAuthn) registration and verification |
| `src/auth.js` | Windows Hello / Touch ID |
| `src/webview-preload.js` | Autofill and login detection inside web pages |
| `src/updater.js` | Update checks against GitHub Releases |
| `src/google-signin.js` | Makes Google sign-in work |
| `.github/workflows/release.yml` | Builds and publishes a release for every version tag |

### Publishing a release

1. Bump `version` in `package.json` and add an entry to [`CHANGELOG.md`](CHANGELOG.md).
2. Commit, then tag and push:
   ```bash
   git tag v1.3.0
   git push && git push --tags
   ```
3. GitHub Actions builds Falcon and publishes the release with the installer and `latest.yml`. Every installed copy of Falcon picks it up automatically.

### Adding a language

1. Copy `src/ui/locales/en.js` (e.g. to `it.js`) and translate the values.
2. Load it in `src/ui/index.html` and add it to `LANGUAGES` in `src/ui/js/i18n.js`.
3. Add the system dialog strings in `src/i18n-main.js` and the start page strings in `src/ui/newtab.html`.

## Known limitations

- **Netflix, Disney+ and other DRM-protected streaming** don't play, because Electron ships without Widevine.
- **macOS and Linux** builds are prepared (`npm run dist:all`) but not tested yet.

## License

[MIT](LICENSE) © Calvin Bandle
