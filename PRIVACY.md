# Privacy: what leaves your computer

NameDaemon Desktop has no accounts, no analytics, no telemetry and no crash reporting.

- **Names you check.** When you press Check, or when the watchlist is re-checked (every few hours while the app runs, set in Settings), the names are sent over HTTPS to `https://namedaemon.com/wp-json/nd/v1/check`. That is the same public API the website uses. The request carries the names, your IP address (as for any web request) and a `User-Agent` of `namedaemon-desktop/<version>`.
- **Your watchlist and settings** are stored only on your computer (the app's local storage). Nothing is uploaded.
- **API key (optional).** If you enter a Pro+ or Business key it is kept in the operating system's keyring and sent as `X-ND-API-Key` with requests. It is never written to a file by the app.
- **"Open all tools"** opens a second window on `https://namedaemon.com/app/`, the website's installable web app. That window is the website: its own privacy policy applies (https://namedaemon.com/privacy-policy/), and it has no access to the app's files, keyring or watchlist.
- **Notifications** are shown by your operating system and are generated on your computer.

Nothing is sent when the app is idle and the watchlist is empty.
