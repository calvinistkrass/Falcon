# Changelog

All notable changes to Falcon are documented here.

## [2.7.0] – 2026-11-27

### Added
- **Automatic Game Mode** (Windows): Falcon turns Game Mode on while a game runs in full screen and off again afterwards. Can be switched off under Settings → Performance.
- **Save resources in the background**: when Falcon is minimized or covered, tabs are frozen after 2 minutes – except music, videos, chats and mail.
- **Tab task manager**: the performance panel shows how much memory and CPU each tab uses, with buttons to put tabs to sleep or close them.
- **Faster page loading**: Falcon opens the connection to a link as soon as you hover over it or type an address.

### Changed
- **Up to date with Chromium 156** (Electron 45): faster, more secure and better compatible with websites.
- **Faster start**: the start page appears sooner and free games show up right away from the last list.
- **Faster sign-in on the phone**: unlocking your sync data takes a moment instead of minutes.
- **FalCoins, the shop, daily rewards and missions have been removed.**
- **Required updates** now lock all online features until you update (account, sync, translation, free games, password check, extensions from the web store, problem reports). Websites keep working.

## [2.6.2] – 2026-11-25

### Changed
- **Test release** for the update process. Nothing else has changed.

## [2.6.1] – 2026-11-25

### Changed
- **Internal version**, published together with 2.6.2.

## [2.6.0] – 2026-11-25

### Added
- **Restore your last tabs**: if Falcon didn't shut down correctly, or if it doesn't open your last session by itself, a small pop-up at the top left offers to bring your last tabs back.
- **Copy email address**: right-click an email link to copy the address.
- **Required updates**: if Falcon is two or more versions out of date, your Falcon account and features such as Game Mode, accent colour and page translation are locked until you update. After the update you're signed in again automatically.

### Changed
- **All beta features are now free for everyone**, even without an account: Game Mode, accent colours, RGB mode, deal wishlist and page translation. Beta access can no longer be bought.

### Fixed
- **Linux updates**: Falcon now closes completely before installing an update, instead of showing "Falcon is not responding".
- **Default browser** now works on Linux, and macOS and Linux no longer ask you to open the Windows settings.
- **Linux**: HTML files opened from the file manager now open in Falcon.

## [2.5.9] – 2026-11-24

### Changed
- **"What's new" in the update window**: shows the real changelog of all versions you don't have yet, neatly grouped and easy to read.

### Fixed
- **Update window**: the text was cut off in the middle of a word (and empty on macOS).

## [2.5.8] – 2026-11-24

### Added
- **Address in payment and sign-in windows**: the title bar now always starts with the real address of the page (with "Not secure" for unencrypted pages), so you can tell whether you're really on the right site.

### Fixed
- **macOS and iOS**: 2.5.7 was released without files for these platforms.

## [2.5.7] – 2026-11-24

### Added
- **Custom start page**: under Settings → General → On startup, choose whether Falcon opens your last session, the Falcon start page or a page of your own. New tabs still show the Falcon start page.

### Fixed
- **macOS downloads**: building the Intel and Apple chip disk images at the same time could fail (2.5.6 has no .dmg for Intel Macs).

## [2.5.6] – 2026-11-24

### Added
- **Custom accent colours**: pick any colour you like in the appearance settings.
- **"Visit" button** next to the address of the Falcon web app in the account settings.

### Changed
- **Accent colour is now a beta feature.** Without beta access Falcon uses the default colour; the colour you picked is kept and comes back with beta access.
- **Falcon web app** now lives at falconbrowser.de/app (the old address forwards there).
- **Performance display** in the toolbar is now just an icon; click it to see all values.
- **Extensions** no longer have their own settings page: turn off, configure or remove them with the puzzle button in the toolbar. Loading unpacked extensions was removed.
- **Bigger scrollbars** for free games and deals on the start page.

### Fixed
- **Website**: no more brief flash of German text while a page loads.

## [2.5.5] – 2026-11-23

### Added
- **Drag a tab out of the window** to open it in a new browser window right where you drop it (incognito tabs open in a new incognito window).

### Fixed
- **Payment and sign-in windows** (PayPal, credit card checks/3-D Secure, "Sign in with Google/Apple/Microsoft") now open as real pop-up windows that stay connected to the page, so payments and logins complete. Normal "open in new tab" links still open as tabs.
- **ChatGPT** no longer shows "Something went wrong": the ad blocker now leaves ChatGPT alone, and never blocks scripts of payment and sign-in services.
- **Falcon Mobile**: the Android build is retried once if it fails (2.5.4 had no APK).

## [2.5.4] – 2026-11-23

### Added
- **Edit shortcuts with a right-click**: right-click a shortcut on the start page to edit or remove it right away.

## [2.5.3] – 2026-11-22

### Added
- **Warning when closing during a download**: if a download is still running (or paused) and you close Falcon, a small window asks whether you want to wait or close anyway. Closing one of several windows doesn't ask, because downloads keep running.

### Changed
- **iOS installation**: the download page now explains installing the .ipa with **iloader** on Windows, macOS or Linux (instead of AltStore or SideStore). The platform menu shows ".ipa" for iOS devices instead of "Web app".

## [2.5.2] – 2026-11-22

### Fixed
- **Falcon Mobile (iPhone & iPad): start page search** – tapping the search bar on the start page no longer loses the focus right away, so you can type again. Other text fields (sign-in, history and password search) benefit too.

## [2.5.1] – 2026-11-22

### Added
- **Falcon Mobile: suggestions while typing** – the search bar on the start page and the address bar now suggest pages from your history and bookmarks plus search suggestions from your search engine, like in Chrome or Brave. The arrow next to a suggestion copies it into the field.
- **Falcon Mobile (Android): set as default browser** – Falcon can now be chosen as the default browser (browser menu → "Set as default browser"). Links from other apps then open in a Falcon tab. On iOS devices, Apple only allows this for App Store browsers.

### Fixed
- **Falcon Mobile: address bar** – tapping the address bar now selects the whole address so you can type right away, and the ✕ clears the field.
- **Falcon Mobile: start page search** – the search bar now has a visible search button and a clear button and closes the keyboard reliably after searching.

## [2.5.0] – 2026-11-21

### Added
- **Falcon Mobile for iPhone & iPad** – every release now includes `Falcon-Mobile-x.y.z.ipa`. It isn't in the App Store: install it with AltStore or SideStore (they sign the app with your own Apple ID). Requires iOS 16.4 or newer.

### Changed
- **Refunds for beta access only within 24 hours** – a refund for beta access can now only be requested within 24 hours of the purchase (PC and Falcon Mobile). The refund form shows how much time is left; after that the purchase can no longer be selected.

## [2.4.1] – 2026-11-21

### Added
- **Falcon Mobile: loading screen** – the app now starts with the same animated Falcon loading screen as on the PC. It disappears once everything has loaded (sign-in, your saved tabs and your account data).

### Changed
- No changes to the PC app – this release is also a good opportunity to try the new automatic updates on Linux and Android.

## [2.4.0] – 2026-11-21

### Added
- **Linux: automatic updates** – Falcon on Linux (.deb and .rpm) now updates itself like on Windows: the update is downloaded in the background and installed when Falcon restarts. Linux asks for your password once to install it. Applies from the next update after 2.4.0.
- **Falcon Mobile (Android): updates inside the app** – Falcon downloads the new version itself and opens the Android installer; you only confirm the installation (the first time, Android asks you to allow Falcon to install apps).
- **Close all tabs** – on the PC in the tab right-click menu and the command palette (Ctrl+K), in Falcon Mobile in the tab overview.

### Fixed
- **Falcon Mobile: tabs are kept** – your open tabs are still there after closing and reopening the app (incognito tabs are never saved).

### Changed
- **Update downloads from falconbrowser.de** – versions that can’t update themselves (macOS, portable) now point to the download page on falconbrowser.de instead of GitHub.

## [2.3.9] – 2026-11-21

### Changed
- **Translate page is now built into Falcon** – pages are translated right where you are instead of being opened on translate.google.com. Formatting, links and code blocks stay intact, text that loads later (comments, feeds) is translated too, and "Show original" restores the page instantly. A small translate icon appears in the address bar; its popup shows the languages, e.g. "English → German".
- **Translate page is now a beta feature** (PC and Falcon Mobile) – included with beta access from the FalCoin shop.

## [2.3.8] – 2026-11-20

### Fixed
- **Linux: app icon** – Falcon now shows its icon in the app menu, dock and taskbar (the icon is installed in all standard sizes).

### Added
- **Linux: details in the software center** – when installing the .deb or .rpm, the software center (e.g. GNOME Software, KDE Discover) shows a description, screenshots and links to the website.

## [2.3.7] – 2026-11-20

### Added
- **Download window: click and right-click** – click a running download in the download window (top right) to open it automatically once it has finished (click again to turn it off). Right-click a download for more actions: open when done, open, show in folder, pause/resume, download again, copy download link, open downloads folder, show all downloads, cancel or remove from the list.

## [2.3.6] – 2026-11-20

### Fixed
- **Linux: update check** – Falcon on Linux (.deb and .rpm, e.g. Debian 13) now detects new versions again. Previously it always reported that it was up to date. macOS checks for updates the same way.

## [2.3.5] – 2026-11-20

### Changed
- Maintenance release without changes to the app.

## [2.3.4] – 2026-11-20

### Fixed
- **Crash when playing videos** (e.g. YouTube): Falcon no longer forces graphics settings that made the GPU process crash on some graphics drivers. If the graphics process still crashes, Falcon keeps running, and after repeated crashes it switches to a safe video mode.

## [2.3.3] – 2026-11-20

### Fixed
- **Pages without their own background** (e.g. some sign-in and account pages) now load on white like in Chrome instead of showing black text on a dark background.

## [2.3.2] – 2026-11-20

### Added
- **Command palette** (Ctrl+K): open the deal wishlist and turn RGB mode on or off.

### Fixed
- **Falcon Mobile (Android): navigation bar** – the phone's navigation buttons no longer cover the app's tab bar, sub-pages and the browser menu.
- **Falcon Mobile (Android): buttons** – a button becoming available while you type (e.g. "Sign up") no longer takes the focus away from the text field.
- **Falcon Mobile: tab bar** – "Bookmarks" is no longer cut off with large system fonts.

## [2.3.1] – 2026-11-20

### Fixed
- **Falcon Mobile (Android): text fields** – tapping the email or password field no longer makes the focus jump between the fields, so you can type again (sign-in, sign-up and all other forms).

## [2.3.0] – 2026-11-20

### Added
- **Tab preview**: hover over a tab to see a small picture of the page with its title and address.
- **RGB mode** (beta): the accent colour slowly cycles through every colour, and the active tab and buttons glow like a gaming keyboard. Pauses automatically in Game Mode.
- **Deal wishlist** (beta): save games and Falcon checks every 3 hours whether one is free or at least 20% off – with a notification and a direct link to the deal.
- **Ad blocker in Falcon Mobile**: ads and trackers are blocked in the phone browser too, with a counter in the menu. Can be switched off in the browser menu.

 – 2026-11-20

### Added
- **Refunds for shop purchases**: bought something by mistake? Shop → "Request a refund", pick the purchase, enter your email and a reason. The developer approves or declines it in the admin panel; you see the answer as a pop-up the next time you open Falcon. An approved refund returns the FalCoins, removes the unlock and shows up in the FalCoin history (PC and Falcon Mobile).
- **Admin panel**: list of open refund requests with Approve / Decline (optional reason), a counter in the account menu and a notice at startup.

### Fixed
- **macOS build**: the .dmg step is retried when the disk-image tool fails on the build machine (2.1.8 and 2.1.9 were missing some .dmg files).

 – 2026-11-20

### Changed
- **Beta access now lasts exactly 30 days** (350 FalCoins). While it's active, the shop shows **"Already purchased"** instead of the price; you can buy it again after it expires.
- **Admin panel**: only beta access can be given or revoked – Game Mode is part of it (PC and Falcon Mobile).

### Fixed
- **Linux .rpm package**: built on Ubuntu 22.04 now – the packaging tool failed with newer rpmbuild versions (Fedora 41, Ubuntu 24.04).

## [2.1.8] – 2026-11-20

Falcon Mobile: **Falcon-Mobile-2.1.8.apk**.

### Changed
- **Game Mode is now a beta feature**: it's no longer sold on its own in the FalCoin shop but included in **beta access**. Game Mode unlocks bought or gifted earlier stay valid until they expire.
- **Beta access can be bought again – now for 350 FalCoins** (14 days, buying again extends it), on the PC and in Falcon Mobile.

### Fixed
- **Linux .rpm package**: built in a Fedora container now, because rpmbuild failed on Ubuntu (2.1.6 and 2.1.7 only had the .deb).

## [2.1.7] – 2026-11-19

### Fixed
- **Linux .rpm package** (Fedora, openSUSE) is built again – in 2.1.6 only the .deb package was published.

### Changed
- The download page shows for every platform (Windows, macOS, Linux, Android) whether its new version is still being prepared.

## [2.1.6] – 2026-11-19

Falcon Mobile: **Falcon-Mobile-2.1.6.apk** (no changes to the app).

### Added
- **Falcon for macOS and Linux**: every release now also contains
  - macOS: `Falcon-x.y.z-mac-arm64.dmg` (Apple silicon) and `Falcon-x.y.z-mac-x64.dmg` (Intel). The app isn't signed by Apple yet – right-click → Open on first launch.
  - Linux: `Falcon-x.y.z-linux-amd64.deb` (Ubuntu, Debian, Mint) and `Falcon-x.y.z-linux-x86_64.rpm` (Fedora, openSUSE).
- macOS app menu (Cmd+C/V/X/A/Q work), links and HTML files from other macOS apps open in Falcon, and "Make default browser" works on macOS and Linux.

### Changed
- On macOS and Linux, a new version is offered as a download from GitHub (the app can't replace itself there yet).

## [2.1.5] – 2026-11-19

Falcon Mobile: **Falcon-Mobile-2.1.5.apk**.

### Changed
- **New look for buttons, text fields, switches and checkboxes** on the PC, in Falcon Mobile and on the website (inspired by uiverse.io): gradient buttons with a light sweep and a glow, springy press animation, glowing focus ring on fields, animated switches and checkboxes.

### Added
- **Loading screen when Falcon starts**: an animated server illustration (Uiverse.io by Juanes200122) until the browser is ready.

## [2.1.4] – 2026-11-18

Falcon Mobile now uses the same version number as Falcon for Windows: **Falcon-Mobile-2.1.4.apk**.

### Changed
- **Translate page is no longer a beta feature** – it works for everyone on the PC (right-click, Ctrl+K) and in Falcon Mobile (browser menu), without beta access or an account.
- **Beta access can't be bought right now**: there are no beta features at the moment, so the buy button in the FalCoin shop is disabled ("Not available right now") on the PC and in the app. Existing beta access stays valid; the admin can still grant it.

### Added
- **New tabs load first**: while a tab you just opened is loading, Falcon throttles all other tabs and sidebar apps and briefly pauses running downloads, so the new page gets the full bandwidth. Tabs playing audio keep enough bandwidth for music and streams. Everything goes back to normal as soon as the tab has loaded (at most after 8 seconds). Tabs opened in the background don't trigger this.

## [2.1.3] – 2026-11-18

### Changed
- Test release for the update mechanisms of Falcon for Windows and Falcon Mobile (Falcon-Mobile-1.1.2.apk, update notice in the app). No functional changes.

## [2.1.2] – 2026-11-18

### Fixed
- **Falcon Mobile hung on the logo in BlueStacks and other PC emulators.** They run on x86 processors, but the APK only contained ARM code; the translated React Native library failed to load (`dl_unwind_find_exidx` missing) and the app restarted in a loop. The APK (Falcon-Mobile-1.1.1.apk) now also includes x86 and x86_64 code.

### Added
- **Update notice in Falcon Mobile 1.1.1**: when a newer APK is attached to a GitHub release, the start screen shows "New version available" with a download button. "Later" hides it until the next version. Checked at startup and every 6 hours.

No changes to the Windows app.

## [2.1.1] – 2026-11-15

### Fixed
- **Right-clicking the address bar did nothing**, so a selected link could not be copied. The address bar and all other text fields of the Falcon interface now have a context menu with Undo, Cut, Copy, Paste and Select all; the address bar also offers **Paste and go**.

## [2.1.0] – 2026-11-15

### Added
- **Admin panel: grant and revoke beta access**, not only Game Mode. Each user row has a button per unlock (Game Mode for 2 months, beta access for 14 days) that gives it or takes it away again.
- **Phones in "Tabs from other PCs"**: Falcon Mobile shares its open tabs like a PC; phones are shown with a phone icon.
- **Falcon Mobile 1.1.0 for Android** is attached to this release as an APK (Falcon-Mobile-1.1.0.apk). The app now covers almost everything the desktop account does:
  - Create an account on the phone (compatible with Falcon for Windows) and switch between tabs with a tab overview, including incognito tabs.
  - **FalCoin shop** with the same items and prices as on the PC, daily reward with the 7-day streak, daily missions and the FalCoin history.
  - **Passwords**: view, copy, add, edit and delete (locked with fingerprint/Face ID); fill them into login forms and get asked to save new logins. "Never for this site" is shared with the PC.
  - **History** from all devices, bookmarks can be added and removed from the browser menu.
  - **Translate page** (beta), share, copy link, report a problem, account settings (name, password, delete account) and the admin tools.
  - The address bar uses the search engine from your Falcon settings.

## [2.0.2] – 2026-11-12

### Added
- **Install extensions right from the Chrome Web Store**: the store disables its own "Add" button outside Chrome, so Falcon shows an **Add to Falcon** button on every extension page. After a confirmation, Falcon installs the extension – or updates it if it's already installed.

### Changed
- The beta access in the FalCoin shop lists what it includes: Translate page and all further beta features.

## [2.0.1] – 2026-11-12

### Fixed
- **The saved-password list below login fields flickered** and made the password field flash while typing a username. Opening the list briefly took focus away from the page; when the focus came back, the page asked for the list again, hundreds of times per second. The list now opens once per click into a field and closes while you type.

## [2.0.0] – 2026-11-11

### Added
- **Daily reward**: claim 10 FalCoins every day from the account menu; on the 7th day in a row you get 50 extra. Falcon reminds you at startup.
- **Daily missions**: visit 20 pages, visit 5 different websites and use Game Mode for 30 minutes – each pays out FalCoins. Missions restart at midnight.
- **FalCoin history**: every website-visit day, reward, mission and purchase with date and amount.
- **First beta feature – Translate page**: right-click a page (or Ctrl+K) to translate it with Google Translate; "Show original" switches back. Requires beta access from the FalCoin shop.
- **Screenshot tool** (Ctrl+Shift+S, right-click menu, main menu): select an area, the visible part or the full page. The screenshot goes to the clipboard and can be saved as PNG.
- **Bookmarks on your phone**: a web app at calvinistkrass.github.io/Falcon/app shows your bookmarks and the open tabs of your PCs. It signs in with your Falcon account and decrypts your data only on the phone. It can be added to the home screen.

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

[2.0.2]: https://github.com/calvinistkrass/Falcon/releases/tag/v2.0.2
[2.0.1]: https://github.com/calvinistkrass/Falcon/releases/tag/v2.0.1
[2.0.0]: https://github.com/calvinistkrass/Falcon/releases/tag/v2.0.0
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
