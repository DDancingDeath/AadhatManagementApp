# Review-rule examples

Real findings from this repo, one per file, showing what each rule in
[`../review-rules.yml`](../review-rules.yml) is for. Add one when the owner
accepts a review finding that a rule now catches.

| Example | Rule | Status |
|---|---|---|
| [top-level-app-shadowing.md](top-level-app-shadowing.md) | `top-level-app-shadowing` | fixed in `f154301` |
| [iso-string-date-key.md](iso-string-date-key.md) | `iso-string-date-key` | fixed in `f5229a8` / `860e16f` |
| [showToast-wrong-arg-type.md](showToast-wrong-arg-type.md) | `showToast-wrong-arg-type` | open, #51 |
| [firebase-firestore-in-module.md](firebase-firestore-in-module.md) | `firebase-firestore-in-module` | open, #123 / #64 |

## Known existing violations (allowed until their issue is fixed)

The CI check only looks at lines a PR **adds**, so these don't block other
PRs. `node scripts/check-review-rules.js --all` lists them; as of 2026-10-21:

| Rule | Count | Where | Tracked in |
|---|---|---|---|
| `showToast-wrong-arg-type` (block) | 26 | admin.js, diagnostics.js, finance.js, services/printer.js | #51 |
| `firebase-firestore-in-module` (block) | 12 | admin.js, users.js | #123 |
| `inline-onclick-without-window-app` (warn) | 6 | templates | — |
| `raw-date-construction`, `iso-string-date-key`, `due-amount-vs-payment-due-drift` (warn) | 1 each | — | review when touched |
| `hardcoded-ui-text-in-module` (info) | 7 | modules | #63 |

Touching one of these lines in a PR re-adds it to the diff, so fix it (or
move it) in that PR.
