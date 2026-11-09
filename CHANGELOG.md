# Changelog

All notable changes to Falcon are documented here.

## [1.6.1] – 2026-11-09

### Fixed
- **Passkeys now work**: Electron doesn't pass WebAuthn requests to Windows, so adding a passkey always failed. Falcon now talks to the Windows passkey API (webauthn.dll) directly – the same one Chrome and Edge use. The Windows dialog offers Windows Hello, security keys and "iPhone, iPad or Android device".
- **Passkey sign-in on websites** (e.g. Google, GitHub, Microsoft) works the same way, after a short prompt in Falcon. Sites can only request passkeys for their own domain.
- **Updates are checked right at startup** instead of after 15 seconds, and the update window opens immediately. A found update is remembered, so the notice appears instantly on the next start.

### Added
- A short hint when entering full screen; Esc now also leaves full screen opened with F11.

## [1.6.0] – 2026-11-09

### Added
- **Real ad blocker**: EasyList, EasyPrivacy and more (over 150,000 rules), updated weekly. Ad slots inside pages are hidden too. An optional filter hides cookie banners and other annoyances.
- **Falcon shield** next to the star in the address bar: shows how many ads and trackers were blocked on the current page, which hosts they came from, and turns the blocker off for a single site.
- **Ad blocker settings**: own section with on/off switch, filter list status and the list of sites where it's off.
- **Bookmark folders**: folders in the bookmarks bar with submenus and "Open all"; folders are kept when importing from Chrome, Edge, Firefox or Opera.
- **History** (Ctrl+H): grouped by day, searchable, remove single entries.
- **Incognito windows** (Ctrl+Shift+N): separate in-memory session; no history, cookies or site data are kept after closing.
- **Overlay window**: open a page in a small window that stays on top, e.g. a stream or guide next to your game.
- **Reader view** (F9): articles without ads and clutter, with dark, sepia and light themes.
- **Custom sidebar apps**: add any web app to the sidebar, reorder or remove apps.
- **Start page options**: custom background image, show or hide shortcuts and clock.
- **Download settings**: choose the download folder or get asked every time.
- **Mouse side buttons** go back and forward (or switch tabs, if you prefer).

### Changed
- **Passwords are filled in only after you choose an account** from the list below the login field.
- **Game Mode** now pauses background tabs after 30 seconds (they stay loaded but use no CPU) before putting them to sleep.

### Fixed
- Adding a passkey failed immediately with "cancelled or timed out" because the passkey window didn't have focus yet.

## [1.5.1] – 2026-11-09

### Fixed
- Turning on Game Mode stretched the performance meter across the whole toolbar.

## [1.5.0] – 2026-11-09

### Changed
- **Passkeys ask first**: when a website or Falcon itself wants to use a passkey, a small prompt appears. The Windows passkey dialog only opens after you click **Use passkey**.
- New logo and app icon, with sharp small sizes for the taskbar and Explorer.

### Fixed
- **Copy image** in the right-click menu didn't put anything on the clipboard. It now works for PNG, JPEG, WebP, GIF, AVIF and SVG images.

## [1.4.0] – 2026-11-09

### Added
- **Falcon Flight**: a small game on the error page when there's no internet connection. Press Space, ↑ or click to fly.
- Tabs that failed to load because of a missing connection reload automatically once you're back online.

## [1.3.0] – 2026-11-09

### Changed
- Test release for the update mechanism. No functional changes.

## [1.2.0] – 2026-11-09

### Added
- **Automatic updates**: Falcon checks GitHub Releases on startup and every four hours. An **Update** button appears in the toolbar when a new version is available. The installed version downloads the update and installs it on restart.
- **Passkeys**: unlock your passwords with an iPhone, an Android phone or a security key.
- **Bookmark overflow menu**: bookmarks that don't fit into the bar are listed behind a » button.
- Releases are built and published automatically by GitHub Actions.

### Fixed
- Google sign-in was blocked with "This browser or app may not be secure".
- Pages without their own title kept the previous tab title.

## [1.1.0] – 2026-11-09

### Added
- Completely redesigned interface: calmer colors, Chrome-style tabs, native Windows 11 window controls with Snap Layouts.
- Address bar with suggestions from history, bookmarks and open tabs, plus inline autocomplete.
- Settings page with sections, main menu with zoom controls, custom right-click menu on web pages.
- Performance meter with a live graph; custom error page for unreachable sites.
- Languages: English, Deutsch, Français, Español, Türkçe.
- Password manager with autofill, CSV import/export and Windows Hello protection.
- Bookmark context menu and HTML/JSON import/export.
- Session, window size and per-site zoom are remembered.

## [1.0.0] – 2026-11-08

- First release.

[1.6.1]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.6.1
[1.6.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.6.0
[1.5.1]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.5.1
[1.5.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.5.0
[1.4.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.4.0
[1.3.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.3.0
[1.2.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.2.0
[1.1.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.1.0
[1.0.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.0.0
