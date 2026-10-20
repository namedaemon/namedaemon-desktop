# NameDaemon Desktop

A small, free desktop app for [NameDaemon](https://namedaemon.com), the .com domain tools. Check up to 50 names at a time, export the results to CSV, keep a watchlist and get a notification when a watched name changes status. Windows and Linux first.

- **Bulk check:** paste or type names (one per line or comma-separated; `Nova.com` and `https://nova.com/x` both become `nova`). Status from the daily snapshot of the .com zone, with the estimated drop date and the registrar when known. "Not in the snapshot" is never shown as "available": confirm with a live check and your registrar.
- **All nine free tools, built in:** name generator, availability checker, domain report, domain score, appraisal, audit, domain health, short domains and the drop calendar. Each has a small form and a clear result; the domain report opens its full page, and every tool can be opened on the website for more detail.
- **Watchlist:** names are saved on your computer and re-checked every few hours (default 6, set in Settings). A native notification tells you when a name moves, for example from taken to dropping.
- **Tray icon:** check the name in the clipboard, open the app, open all the tools, quit. Closing the window keeps the app in the tray (can be turned off).
- **The website window:** "Open all tools" (and the tray menu) opens https://namedaemon.com/app/ in a second window.
- **Private:** no account, no analytics, no telemetry. See [PRIVACY.md](PRIVACY.md).
- English, Spanish, French and German. MIT licensed, no API key needed (an optional Pro+ or Business key is kept in the system keyring).

## Install

Download the installer for your system from the [releases page](https://github.com/namedaemon/namedaemon-desktop/releases) and compare it with `SHA256SUMS.txt`.

| System | File | Notes |
| --- | --- | --- |
| Windows 10/11 | `NameDaemon_<version>_x64-setup.exe` or `.msi` | Needs the Microsoft WebView2 runtime (already on Windows 11 and current Windows 10; the installer downloads it if missing). Releases are not code-signed yet, so Windows SmartScreen may show a warning: choose "More info" > "Run anyway" if the checksum matches. |
| Linux | `namedaemon_<version>_amd64.AppImage` (any distribution), `namedaemon_<version>_amd64.deb` (Debian, Ubuntu) | The `.AppImage` needs `chmod +x`. The `.deb` installs the package `namedaemon` (command `namedaemon-desktop`, menu entry "NameDaemon") and needs `libwebkit2gtk-4.1` and, for the tray icon, `libayatana-appindicator3`. Remove it with `sudo apt remove namedaemon`. |
| macOS | not yet | Planned once the signing question is settled. |

## Build from source

You need Node 18+, [Rust](https://rustup.rs) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your system.

```
npm test                              # the logic tests (names, API client, CSV, watchlist, translations)
npx @tauri-apps/cli@2 dev             # run the app
npx @tauri-apps/cli@2 build           # make the installers for this system
```

The window's code is plain HTML and JavaScript in `ui/` (no framework, no build step); the Rust in `src-tauri/` only does the tray, notifications, file save, keyring and the second window. The window may only call what `src-tauri/capabilities/main.json` allows; the website window has no access to the app.

Releases are built by GitHub Actions when a `v*` tag is pushed (`.github/workflows/release.yml`).

## Links

- Website and free tools: https://namedaemon.com
- Developers (packages and API): https://namedaemon.com/developers/
- Issues: https://github.com/namedaemon/namedaemon-desktop/issues

MIT license.
