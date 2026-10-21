# `firebase-firestore-in-module` — admin/users bypass FirebaseService

**Finding.** `www/js/modules/users.js` and `admin.js` open Firestore directly:

```js
const db = firebase.firestore();
await db.collection(window.getCollection ? window.getCollection('users') : 'users').doc(userId).update({ ... });
```

The prefix is usually right (it uses `getCollection` when present, but falls back to the unprefixed name), but the call skips the
service layer, so error handling, offline behaviour and future rule changes
have to be fixed in two places and the pattern gets copied. **Fix:** add
the methods to `FirebaseService` and call those; tracked in #123 (billing.js
in #64).
