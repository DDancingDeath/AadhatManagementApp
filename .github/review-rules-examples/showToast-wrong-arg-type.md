# `showToast-wrong-arg-type` — error messages vanish instantly

**Finding.** `UIManager.showToast(message, duration = 2000)` takes a
duration, but 26 call sites pass a type string, e.g. `www/js/modules/admin.js`:

```js
UIManager.showToast('Failed to approve user', 'error');
```

`setTimeout(hide, 'error')` coerces to 0 ms, so the toast is hidden on the
next tick and the user never sees the error. **Fix:** pass a duration (or
omit it); tracked in #51.
