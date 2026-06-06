# Inspection scripts

Tiny Playwright helpers so we (or any future debugger) can confirm in seconds
whether the latest deploy is actually running in a real browser and what
`calculateStock()` returns on live Firestore data — without round-tripping
"reload and paste the console" with the user.

## One-time setup

```bash
npx playwright install chromium   # ~110 MB, one time
node scripts/save-login.js        # opens a real Chrome window; sign in, then press Enter
```

`scripts/save-login.js` writes `scripts/auth-state.json` (gitignored) with
your Firebase Auth cookies + localStorage. That file lets every subsequent
run launch headlessly without re-logging in.

## Daily use

```bash
node scripts/inspect-app.js                 # defaults to "Gehu"
node scripts/inspect-app.js Gehu "Gehu dagi"
APP_URL=https://staging.example node scripts/inspect-app.js Sugar
```

You'll see:

1. **BUILD_ID** — the value printed by `main.js` on startup (e.g.
   `20260606c-automation`). If this doesn't match what's in
   `www/js/main.js`, the browser is loading stale JS and we need to bump
   the cache-buster query string in `www/index.html` and the
   `CACHE_NAME` in `www/service-worker.js`.
2. **`window.calculateStock()` output** filtered to items whose name
   contains your query — quantity, rate, totalValue per matched key.
3. **`window.debugStock()` console output** — the full event timeline
   with running quantity & running rate for each step, so any rate
   distortion is obvious at a glance.

## When the inspector says "no items matched"

Either the saved auth state expired (re-run `save-login.js`) or your
typed name doesn't appear in the catalogue. The script matches by
`includes()` case-insensitively, so partial names are fine.

## Why this exists

The app was repeatedly reported as "still wrong" after server-side
fixes were verifiably deployed. Root cause: cache-first service worker
+ stale `?v=` query strings + browser HTTP cache layered on top of each
other. With these scripts, the *answer* to "is the user on the latest
code?" is one command, not an exchange of console screenshots.
