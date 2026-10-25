# Happa go-live runbook (26 Oct 2026, ~15:00 IST)

Happa is a **new app**: its own Android package, signing key, Firebase project
(business account, Firestore in `asia-south1`) and website. The old app is
archived and must not change: Android `com.hitesh.aadhat`, Firebase project
`aadhat-management`, site `aadhat-management.web.app`, last release v1.6.1.

Every Happa-specific value lives in **`happa.config.json`**.
`npm run apply:happa-config` copies it into every file that needs it, and
`npm run check:happa-config` fails while any placeholder is left. The release
workflow runs that check on tag builds.

Data moves with the migration tool from the separate PR (branch
`feat/migrate-project-15`). Its `README` is the source of truth for the data
steps. This runbook only says when to run it.

Run the commands in PowerShell from a clone of the repo (e.g. `Q:\aadhat\happa-app`).

---

## 0. Before tomorrow: keep the old site frozen (optional, recommended)

Until the Happa PR merges, `main` still deploys to `aadhat-management`. So every
feature PR merged before it **changes the old site**. If the old app must stay
exactly as it is now, pause that workflow while the feature PRs merge:

```powershell
$env:GH_TOKEN = (gh auth token -u DDancingDeath)
$R = 'DDancingDeath/AadhatManagementApp'
gh workflow disable firebase-hosting-merge.yml -R $R
gh workflow disable firestore-rules-deploy.yml -R $R
```

Re-enable both right before merging the Happa PR (step 7). From then on they
deploy to Happa only.

## 1. Create the Firebase project (console, business account)

1. Create the project (proposed id `happa-shop`). Project ids are global, so
   note the id you actually get.
2. Firestore: **Create database → Production mode → location `asia-south1` (Mumbai)**.
   You cannot change the location later.
3. Authentication: enable **Email/Password**. Check that `<project-id>.web.app`
   and `<project-id>.firebaseapp.com` are listed under *Authorized domains*.
   Add `<hostingSite>.web.app` too if you use a different site name.
4. Project settings → *Your apps* → add a **Web app** (no Hosting setup needed).
   Copy `apiKey`, `messagingSenderId`, `appId` and `measurementId` (if any).
5. Hosting: the default site is `<project-id>`. Leave `hostingSite` empty in the
   config unless you create a site with another name.

## 2. Fill in `happa.config.json`

| Field | Value |
|---|---|
| `firebase.projectId` | the real project id (replaces `__HAPPA_PROJECT_ID__`) |
| `firebase.apiKey` | from the web app config (replaces `__HAPPA_API_KEY__`) |
| `firebase.messagingSenderId` | from the web app config (replaces `__HAPPA_MESSAGING_SENDER_ID__`) |
| `firebase.appId` | from the web app config (replaces `__HAPPA_APP_ID__`) |
| `firebase.measurementId` | optional; leave `""` if none |
| `firebase.hostingSite` | leave `""` (= project id) unless you created another site |
| `androidPackage` | default `com.happa.shop`. **Confirm it.** It can never change after phones install v1.0.0 |
| `appNameHi` | suggested `हप्पा`. Confirm it or change it |
| `ownerConfirmed` | set to `true` after confirming the two rows above |

```powershell
npm ci
npm run apply:happa-config      # also regenerates www/img/download-qr.svg (needs internet for npx qrcode)
npm run check:happa-config      # must print OK
npm test; npm run check:sw; npm run check:release
git add -A; git commit -m "chore(happa): fill in project config"
```

The PR's cache bump (`?v=20261025g`, `BUILD_ID`, `CACHE_NAME = 'happa-v1'`) covers
these `www/` changes. Bump again (AGENTS.md section 4) only if a PR merged
after this one already used those values.

## 3. Create the Happa signing key (never commit it)

```powershell
$dir = 'C:\Users\hik\AadhatManagementApp-apk\signing-happa'
New-Item -ItemType Directory -Force $dir | Out-Null
keytool -genkeypair -v -keystore "$dir\happa-release.keystore" -alias happa `
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Happa, O=Happa, C=IN"
keytool -list -v -keystore "$dir\happa-release.keystore" -alias happa   # copy the "SHA256:" line
```

Save the keystore file and both passwords in the password manager. **If you lose
them, Happa can never be updated on phones again.** For local release builds,
create `android\keystore-happa.properties` (git-ignored) with `storeFile`,
`storePassword`, `keyAlias`, `keyPassword`. The old `keystore.properties` is
not read any more.

## 4. Repository secrets and variable (owner token)

```powershell
$env:GH_TOKEN = (gh auth token -u DDancingDeath)
$R = 'DDancingDeath/AadhatManagementApp'
$ks = 'C:\Users\hik\AadhatManagementApp-apk\signing-happa\happa-release.keystore'

[Convert]::ToBase64String([IO.File]::ReadAllBytes($ks)) | gh secret set HAPPA_KEYSTORE_BASE64 -R $R
gh secret set HAPPA_KEYSTORE_PASSWORD -R $R       # prompts; paste the store password
gh secret set HAPPA_KEY_ALIAS -R $R --body happa
gh secret set HAPPA_KEY_PASSWORD -R $R            # prompts; paste the key password
gh variable set HAPPA_CERT_SHA256 -R $R --body '<SHA256 from keytool, colons are fine>'
```

Service account for the GitHub workflows (Google Cloud console → IAM & Admin →
Service accounts, in the **new** project). Create `github-deploy` with these roles:
Firebase Hosting Admin, API Keys Viewer, Firebase Rules Admin,
Cloud Datastore Index Admin, Service Usage Consumer and Cloud Datastore Viewer
(the last one is for the backup and TIP). Then create a JSON key:

```powershell
Get-Content .\happa-sa.json -Raw | gh secret set FIREBASE_SERVICE_ACCOUNT_HAPPA -R $R
Remove-Item .\happa-sa.json
# optional: a read-only account (Cloud Datastore Viewer only) just for the backup/TIP
# Get-Content .\happa-backup-sa.json -Raw | gh secret set FIREBASE_BACKUP_SERVICE_ACCOUNT_HAPPA -R $R
```

`BACKUP_PASSPHRASE` is reused. The old secrets (`ANDROID_KEYSTORE_*`,
`ANDROID_CERT_SHA256`, `FIREBASE_SERVICE_ACCOUNT_AADHAT_MANAGEMENT`,
`FIREBASE_BACKUP_SERVICE_ACCOUNT`) stay as they are for the archived app. Nothing reads them any more.

## 5. Deploy Firestore rules and indexes to the new project

Do this before the migration so the data is protected from the start.

```powershell
npx --yes firebase-tools@latest login      # the business account
npx --yes firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project <project-id>
```

## 6. Stop billing in the old app and run the migration

1. Pick a cut-off time. After it, nobody bills in the old app. Every phone
   opens the old app once while online, so queued offline bills get uploaded.
2. Take a final backup of the old project: Actions → *Firestore backup* →
   Run workflow (on `main`, **before** the Happa PR merges, so it still backs
   up `aadhat-management`).
3. Run the migration tool exactly as its README in the `feat/migrate-project-15`
   PR says: dry run first, check the counts, then apply into `<project-id>`.

## 7. Merge order

1. Merge the open feature PRs first.
2. Rebase this PR on `main`. Re-check the cache bump (`?v=`, `BUILD_ID`,
   `CACHE_NAME`) and run `npm run check:happa-config`. Wait for CI to pass.
3. Re-enable the workflows from step 0 (`gh workflow enable firebase-hosting-merge.yml -R $R`,
   `gh workflow enable firestore-rules-deploy.yml -R $R`).

## 8. Deploy hosting (= merge the Happa PR)

Merging deploys `www/` to `https://<site>.web.app` (*Deploy to Firebase Hosting
on merge*), and, because `happa.config.json` changed, also re-deploys rules
and indexes to the new project. Check that:

- both runs passed, and the guard step printed `project=<project-id>`;
- `https://<site>.web.app` and `/download` open;
- `https://aadhat-management.web.app` still shows the old app, unchanged.

Do **not** revert the merge commit to roll back. That would bring back the
workflows that deploy to `aadhat-management`. Fix forward instead; the old app
keeps working on its own.

## 9. Tag v1.0.0 (Android release)

```powershell
git fetch origin
git tag v1.0.0 origin/main
git push origin v1.0.0
```

The *Android release* workflow checks `check:happa-config`, builds and signs
with the Happa key, checks the certificate against `HAPPA_CERT_SHA256` and the
package against `happa.config.json`, then publishes **"Happa v1.0.0"** with
`Happa.apk` and `Happa-v1.0.0.apk`.

Side effect: Happa v1.0.0 becomes the repo's *latest* release. The old app's
download page link (`releases/latest/download/AadhatManagement.apk`) then stops
working. The old APK stays available at `releases/tag/v1.6.1`. Old phones get
no update banner, because 1.0.0 is lower than 1.6.1. Once Happa reaches a
version above 1.6.1, old installs would offer a broken update, so remove the
old app from the phones before that.

## 10. Install on the phones

On each phone, open `https://<site>.web.app/download`, download `Happa.apk`
and install it. It installs **next to** the old app; nothing is replaced. Sign in.
Accounts and roles work as the migration README describes. Any user it did not
carry over registers again, and the owner approves them in Admin.

## 11. Opening stock

In Happa, count each item and enter the opening quantity with a stock
adjustment. Do this once, before the first bill.

## 12. Start billing in Happa

All new bills go into Happa from now on. Keep the old app only to look things up.
Afterwards, run *Firestore backup* and *TIP auto bugs* once by hand (Actions →
Run workflow) to confirm they read the new project.

---

## Where the app/project identity lives

Written by `npm run apply:happa-config` from `happa.config.json`:

- `.firebaserc` (default project), `firebase.json` (`hosting.site`)
- `capacitor.config.json` (`appId`, `appName`)
- `android/app/build.gradle` (`applicationId`; `namespace` stays `com.hitesh.aadhat`, which is internal Java code only)
- `android/app/src/main/res/values/strings.xml` (`app_name`, `title_activity_main`, `package_name`, `custom_url_scheme`)
- `www/manifest.webmanifest` (`name`, `short_name`)
- `www/firebaseConfig.js` (the `<happa-config>` block)
- `www/js/config/app-identity.js` (name, site, download/APK/release URLs). It is used by the update banner, share text, What's new, password-reset link, reports and notifications
- `www/index.html` (`<title>`), `www/js/i18n/en.js` + `hi.js` (`ui.app.name`, used by the login screen, side menu and About)
- `www/download.html` (`data-happa*` markers), `www/img/download-qr.svg`

These read it at run time: `scripts/release-notes.js`, `playwright*.config.js`,
`tests/e2e/support/emulator.js`, `scripts/inspect-app.js`,
`scripts/save-login.js`, `tools/tip/autobugs.js`, and every workflow
(`scripts/happa-config.js guard` / `get`).
