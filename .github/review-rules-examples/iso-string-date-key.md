# `iso-string-date-key` — "today" was yesterday before 05:30 IST

**Finding.** Cash sessions, reports and the Day page built date keys with

```js
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
```

`toISOString()` is UTC, so between 00:00 and 05:30 IST it returns the
previous day: a cash session opened at 01:00 was filed under yesterday.
**Fix:** `todayLocalISO()` / `parseLocalDate()` from `www/js/utils/dates.js`
(`4ab6fd8`, used in `f5229a8` and `860e16f`).
