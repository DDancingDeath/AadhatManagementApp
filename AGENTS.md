# AGENTS.md — Guide for AI agents working in this repo

> If you are an AI coding agent landing in this repository, **read this file
> before doing anything else**. It will save you (and the human) a lot of
> wasted turns.

---

## 1. What this repo is

`AadhatManagementApp` — a Hindi/English wholesale-retail business app for
small-scale grain/produce traders. It runs on **Firebase Hosting + Firestore +
Auth**, is built as **vanilla ES module-style JS** (no bundler, no framework),
and is wrapped in **Capacitor** for Android distribution.

- **Owner**: `DDancingDeath` (https://github.com/DDancingDeath/AadhatManagementApp)
- **Live URL**: `https://aadhat-management.web.app`
- **A read-only staging clone exists** at
  `https://github.com/DDancingDeath/AadhatManagementApp-staging` (private).
  All risky improvements are tried there first; verified fixes are
  cherry-picked / PR'd back here. See section 6.

---

## 2. The unbreakable rules

1. **This repo is production.** Real users in the field are using the live
   site and the Android build. Treat every change like a security patch:
   small, reviewed, reversible.
2. **Never bypass `FirebaseService`.** All Firestore reads/writes must go
   through the wrapper so collection prefixing (`prod_*` / `staging_*`)
   stays correct. Several existing modules bypass it — those are bugs, not
   patterns to copy.
3. **Don't add a build step or framework.** No webpack, no Vite, no React.
   Inline `<script>` tags + `window.app` globals are a deliberate choice and
   the staging clone depends on cherry-pick parity.
4. **Don't rename existing files casually.** Inline `onclick="window.app.x.y()"`
   handlers and `template-loader.js` reference paths and method names by
   exact string.
5. **Always run `npm install --legacy-peer-deps`.** `canvas@^3.2.0` peer-
   conflicts with `jest-environment-jsdom`. The dependency itself is unused
   and slated for removal — until then, the legacy-peer-deps flag is
   mandatory.
6. **Money-related changes get extra care.** Bills mix top-level
   `dueAmount` with nested `payment.due`. Both can drift; both must be
   read/written. Cash-management adjustments hit balance + audit log; both
   must succeed atomically.
7. **No secrets in the repo.** API keys belong in Firebase Functions config
   (`firebase functions:config:set`), not in any source file.

---

## 3. Where to start reading

In order:

1. `README.md` — original setup / install / deploy instructions.
2. `firestore.rules` — the authoritative permission model.
3. `www/index.html` — script load order; this is the SPA shell.
4. `www/js/main.js` — wires every module onto `window.app.*`.
5. `www/firebaseConfig.js` — initializes Firebase, exposes `firebase.*`
   compat globals.
6. `www/js/firebase/firestore-service.js` — every read/write should go
   through here.

---

## 4. Codebase orientation (the bits you'll get wrong)

### Naming surprises

| You'd guess | Actual file |
|---|---|
| `expenses.js` | `www/js/modules/miscellaneous.js` |
| `printer.js` (modules) | `www/js/services/printer.js` |
| `wholesaleSalesHistory` | `AppState.salesHistory` (just "salesHistory" means **wholesale** here) |
| `retailSalesHistory` | `AppState.retailSalesHistory` (this one's normal) |
| `chat.js` | does not exist in prod — the AI Assistant tab is wired but not implemented (a real chat module ships from the staging clone) |
| `bottom-nav.html` | doesn't exist — the "bottom" tabs are the bottom of the side nav in `navigation.html` |

### Conventions

- **All UI updates run inline `onclick` handlers** that call
  `window.app.*`. To expose a new module method to the UI, register it in
  `main.js` — never assume `app` (without `window.`) resolves correctly
  from an inline handler. (`firebaseConfig.js` used to declare
  `let app = firebase.initializeApp(...)` at module top-level which
  shadowed `window.app` for inline handlers; the staging clone fixed this
  by renaming to `firebaseApp`.)
- **All Firestore access goes through `FirebaseService`** so collection
  names get the env prefix.
- **Templates live in `www/templates/`**. They are loaded by
  `template-loader.js` on demand and inserted into the SPA shell.
- **Date strings**: bills mix ISO-8601 and `DD/MM/YYYY`. Use
  `Helpers.parseDate()` — never raw `new Date(string)`.
- **Money fields**: bills sometimes store `dueAmount` at top level *and*
  `payment.due` inside a nested object. Both can exist; both can drift.
  Read both, write both, treat the nested one as canonical when present.
- **State**: a single `AppState` object lives in `state.js`. Never invent
  a parallel cache.

### Things that look wrong but aren't

- The `xlsx` global pollution warning in tests is expected (SheetJS).
- `firebase` global is the compat-SDK style — modular SDK is intentionally
  not used.
- Many functions are async but don't await — that's a real bug, but
  documented; don't "fix" them silently.

---

## 5. Standard workflows

### "I want to fix a bug"

1. Confirm the bug is also tracked in the staging clone's
   `docs/REVIEW_ISSUES.md` (most known bugs already are). If it isn't,
   add it there *first* — that file is the running master list.
2. Make the change in `www/js/...`.
3. Run `npm install --legacy-peer-deps && npm test`. Baseline must stay
   green.
4. Commit with a message like
   `fix(stock): refresh current-stock pane after adjustment (REVIEW_ISSUES WALK-25)`.
5. Open a PR. Don't merge to `main` directly — Firebase Hosting auto-deploys
   on merge to `main`.

### "I want to add a new capability"

1. Strongly consider doing it in the staging clone first. The staging
   clone is the place for greenfield work; prod is for stabilised fixes.
2. If it must land directly in prod: update tests, update README if user-
   facing, ship behind a config flag if behaviour-changing.

### "The CSS / a single template needs a tweak"

These are usually safe to do directly in prod. Use a Playwright probe in
`tools/` to verify before pushing if the visual impact is non-trivial. The
staging clone has examples (`tools/_verify-bottom-buttons.js`).

---

## 6. The staging clone

A separate private repo (`AadhatManagementApp-staging`) exists as a
read-only safety mirror. It:

- Connects to the same Firebase project (`aadhat-management`).
- Cannot write to Firestore — three layers of write-blocking enforce this:
  (1) a JS guard that monkey-patches the SDK, (2) a service worker that
  403s every non-GET request to Firebase hosts, (3) an additive Firestore
  rule that denies writes from a single dedicated `staging-readonly` user.
- Hosts at `https://aadhat-staging.web.app`.
- Is where the AI Assistant is being designed (see staging
  `docs/CHAT_DESIGN.md`).
- Is where every behavioural fix is verified before it's PR'd here.

When a fix lands here that originated in staging, the commit message
should reference the staging commit SHA so the audit trail is preserved.

---

## 7. Firestore rules — reminder

`firestore.rules` in this repo is the source of truth for Firebase's
deployed rules. **Editing these without updating Rules Playground tests
can break every user immediately**. Always:

1. Edit the file.
2. Run `firebase emulators:start --only firestore` and exercise the
   Playground for: owner-creates-bill, staff-creates-bill,
   staging-readonly-blocked.
3. Only then `firebase deploy --only firestore:rules`.

---

## 8. Common pitfalls

- **`firebase.firestore()` calls outside `FirebaseService`** — bypass the
  collection-prefix wrapper. Will write to the wrong collection in
  staging. Always use `FirebaseService.getCollection(name)` instead.
- **`new Date(billDate)` where `billDate` is `DD/MM/YYYY`** — JS parses
  this as `MM/DD/YYYY` on most browsers and silently produces a wrong
  date. Use `Helpers.parseDate()`.
- **`alert(`...${userInput}...`)` and `innerHTML = ...userInput...`** —
  XSS. Use `Helpers.escapeHtml()` on every concatenated user value before
  it touches the DOM.
- **Non-batched per-recipient `for await { add() }` loops** — slow and
  partial-failure-prone. Use a `WriteBatch`.
- **Bill numbering with `count + 1`** — race condition. Use a Firestore
  transaction on a daily counter document.

---

## 9. When in doubt

Stop and ask. The cost of a wrong production change is paid by the owner
in customer-facing breakage; the cost of one extra clarifying question is
zero.
