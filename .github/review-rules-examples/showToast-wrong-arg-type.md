# `showToast-wrong-arg-type` — a toast option the signature ignores

**Original finding (2026-05-21).** `UIManager.showToast(message, duration = 2000)`
took only a duration, but 26 call sites passed a type string, e.g.
`www/js/modules/admin.js`:

```js
UIManager.showToast('Failed to approve user', 'error');
```

`setTimeout(hide, 'error')` coerced to 0 ms, so the toast vanished at once.

**Now (#51, #176).** `showToast(message, durationOrType[, duration])` accepts
`'error' | 'success' | 'warning' | 'info'` (colour + a sensible duration,
errors stay 5 s) or a number of ms. Type strings are the preferred way to get
the colour, so the rule was relaxed on 2026-10-22: it only flags strings the
signature ignores, e.g.

```js
UIManager.showToast('Saved', 'danger');   // not a type: no colour, 2 s
UIManager.showToast('Saved', '5s');       // not a number: default 2 s
```

**Fix:** use one of the four types, or a number of ms.
