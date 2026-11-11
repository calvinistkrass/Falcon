# Changelog

All notable changes to Falcon are documented here.

## [1.9.5] – 2026-11-11

### Added
- **FalCoin shop**: open it from the coin balance in the account menu, under Settings → Account & sync or with Ctrl+K.
  - **Game Mode · 2 months for 150 FalCoins**: active for exactly two calendar months from purchase; buying again extends it.
  - **Beta access · 14 days for 1,000 FalCoins**; buying again extends it by another 14 days. There are no beta features yet – they're coming later.
- **Wallets**: FalCoins, beta access and Game Mode are stored per account. Existing balances are carried over automatically.
- **Admin: manage users' FalCoins** (account menu, developer account only): see every wallet, change balances and give or revoke Game Mode.

### Changed
- **Game Mode now requires an unlock** from the FalCoin shop. Without a valid unlock (or when signed out) it turns off automatically.

### Fixed
- **Falcon didn't appear in Windows Settings → Default apps**, so it couldn't be chosen for https, http or HTML files. The installer now registers Falcon as a browser, and Falcon checks the registration on every start and repairs it if it's missing or points to an old location.
- Updating no longer removes the browser registration.

## [1.9.1] – 2026-11-10

### Changed
- **Reported problems are public**: everyone can see reports on `falcon://reports` (description, type, status, date and version). Email address, page address, screenshot and system details stay visible to the developer only, and only the developer can change the status or delete reports. The report dialog asks not to include personal information, since the description can be seen anonymously by everyone.

## [1.9.0] – 2026-11-10

### Added
- **Split view**: show two tabs side by side, resize them by dragging the divider, swap sides or end the split from the tab menu or the command palette.
- **Volume per tab**: right-click the speaker icon on a tab (or use the tab menu) to turn a single tab down, e.g. a stream next to Discord.
- **Network limiter** (Settings → Performance): caps the bandwidth of websites and downloads so games keep a stable ping – always or only in Game Mode.
- **Free games & deals** on the start page: games that are free right now and good deals from Steam, Epic and GOG (data from GamerPower and CheapShark). Can be turned off under Settings → Appearance.
- **Tabs from other PCs**: see and open the tabs that are open on your other PCs (account menu, main menu or Ctrl+K). End-to-end encrypted like the rest of the sync.
- **Password checkup**: finds passwords that appear in known data breaches (Have I Been Pwned – only the first 5 characters of a hash leave your PC), reused passwords and weak passwords.
- **Chrome extensions**: install extensions from the Chrome Web Store by link or load an unpacked folder. Extensions get a toolbar button with their popup, options and an on/off switch. Electron supports only part of the extension APIs, so not every extension works.
- **Report a problem** (main menu or Ctrl+K): send a description, optionally with the page address and a screenshot. Reports can be viewed on `falcon://reports` by the developer account.
- **FalCoins**: collect one FalCoin for every website you visit while signed in. Rewards like beta features are coming later.

### Fixed
- The extension popup now sizes itself to its content.

## [1.8.3] – 2026-11-10

### Changed
- Test release for the silent update mechanism. No functional changes.

## [1.8.2] – 2026-11-10

### Changed
- **Updates install silently**: after the download, Falcon restarts after a 5-second countdown, installs the update in the background without the installer window and opens again with your tabs. Choose "Later" and the update is installed silently when you close Falcon.

### Fixed
- The buttons in the update window were centered and had an extra line since 1.8.0.
- Open tabs and settings are saved immediately before Falcon quits.

## [1.8.1] – 2026-11-10

### Fixed
- **Signing in or creating an account failed** with "Sync storage isn't set up yet": a missing sync key was mistaken for a missing database. You're now signed in right away, and sync data that was marked as locked can be set up by entering your password.
- The account menu flickered constantly while your email address wasn't confirmed yet.

### Changed
- After creating an account or signing in, the dialog closes and a welcome window confirms that you're signed in.
- If an account already exists for the email address, Falcon offers to sign in instead.
- If the sync key can't be set up during sign-in (e.g. while offline), you stay signed in and Falcon retries automatically.

## [1.8.0] – 2026-11-10

### Added
- **Falcon account & sync**: create an account or sign in from the new profile button next to the menu. Bookmarks, passwords, history and settings sync between your PCs – you choose which. Everything is **end-to-end encrypted** on your PC with a key protected by your password, so the server can't read any of it.
- **Account settings** (Settings → Account & sync): name, profile color, device name, sync status and per-category switches, change password, sign out and delete account. Forgotten passwords can be reset by email; afterwards your sync data is unlocked with your previous password, or you start fresh with the data on this PC.
- **Downloads page** (`falcon://downloads`, Ctrl+J): every download with search, grouped by day, live speed and time left, pause, resume, cancel, retry, show in folder and remove. The list is kept across restarts; incognito downloads are not saved.
- **Default browser**: make Falcon your default browser under Settings → General. Links and HTML files from other apps then open in Falcon.

## [1.7.0] – 2026-11-09

### Added
- **Command palette** (Ctrl+K): search open tabs, bookmarks, history and commands from one box – switch tabs, toggle Game Mode, open any settings page and more, all from the keyboard.
- **Password generator**: on sign-up and change-password forms, Falcon suggests a strong 18-character password below the field. Nothing is filled in until you click **Use suggested password**; you can also generate a new one. Falcon then offers to save it as usual.
- **Memory limit**: set a RAM cap under Settings → Performance. When Falcon goes over it, the tabs you haven't used for the longest time are put to sleep. Tabs playing audio stay active, and the limit is shown in the performance meter.

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

[1.9.5]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.9.5
[1.9.1]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.9.1
[1.9.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.9.0
[1.8.3]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.8.3
[1.8.2]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.8.2
[1.8.1]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.8.1
[1.8.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.8.0
[1.7.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.7.0
[1.6.1]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.6.1
[1.6.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.6.0
[1.5.1]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.5.1
[1.5.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.5.0
[1.4.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.4.0
[1.3.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.3.0
[1.2.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.2.0
[1.1.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.1.0
[1.0.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v1.0.0
