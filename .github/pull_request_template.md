## What and why

<!-- One short paragraph per issue. -->

Closes #
<!-- or "Part of #N" when the issue is only partly done -->

## Release note (for the owner)

<!-- One line in plain words for shop staff, or "none" (internal change).
     The owner copies it into www/changelog.json (en + hi) at release time. -->
Release note: 

## Checks

- [ ] `npm test` green (count: )
- [ ] `npm run check:review` — no blocking findings
- [ ] Shipped `www/` files changed → cache bump (`?v=` in index.html, `BUILD_ID`, `CACHE_NAME`), `npm run check:sw` + `npm run check:release`
- [ ] `firestore.rules` changed → `npm run test:rules` (rules are deployed by hand)
- [ ] Phone layout unchanged (or the change is intended and described)
