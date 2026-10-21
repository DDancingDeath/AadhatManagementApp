# `top-level-app-shadowing` — buttons silently did nothing

**Finding.** `www/firebaseConfig.js` is a classic (non-module) script, and it
declared the Firebase app at the top level:

```js
let app;
app = firebase.initializeApp(firebaseConfig);
```

A top-level `let app` in a classic script shadows `window.app` for every
inline handler, so `onclick="app.items.save()"` resolved to the Firebase app
and threw. **Fix:** renamed to `firebaseApp` (`f154301`);
`firebase-app-shadow.test.js` guards it.
