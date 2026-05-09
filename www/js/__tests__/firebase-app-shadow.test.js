/**
 * Regression test for STG-WALK-5 — pinned 2026-01-08.
 *
 * `firebaseConfig.js` is loaded as a *classic* (non-module) `<script>`. In
 * that context, `let app` or `const app` at the top level creates a binding
 * in the **global lexical environment** that lives "above" `window` in the
 * scope chain seen by inline event handlers (`onclick="app.x()"`).
 *
 * That binding then SHADOWS `window.app` — even though it is *not* exposed
 * as `window.app` to JavaScript code. So `typeof window.app === 'object'`
 * and `window.app.chat.sendFromInput` is a function, but inline handlers
 * resolve `app` to the Firebase App instance instead. Result: every
 * `onclick="app.chat.X()"` button silently throws "Cannot read properties
 * of undefined (reading 'X')" because the Firebase App has no `.chat`.
 *
 * This bug took out the entire AI Assistant feature without anyone
 * noticing because `chat-render.test.js` only string-matches the HTML —
 * it doesn't actually click anything.
 *
 * To prevent recurrence:
 *   - Don't name any top-level binding in any `<script>` tag `app`.
 *   - chat.html (and any future inline handlers) must use `window.app.*`.
 */
const fs = require('fs');
const path = require('path');

const STAGING_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('firebaseConfig.js — STG-WALK-5 regression', () => {
    let src;
    beforeAll(() => {
        src = fs.readFileSync(
            path.join(STAGING_ROOT, 'www/firebaseConfig.js'),
            'utf8'
        );
    });

    test('does NOT use `let app` or `const app` at top level (would shadow window.app for inline handlers)', () => {
        // Match `let app` / `const app` / `var app` *only when followed by
        // = / ; / EOL* — i.e. the declaration form. Excludes accidental
        // matches inside strings or comments via simple heuristics.
        const lines = src.split(/\r?\n/);
        const offenders = [];
        lines.forEach((line, i) => {
            // Strip line comments.
            const code = line.replace(/\/\/.*$/, '');
            if (/^\s*(?:let|const|var)\s+app\s*[;=]/.test(code)) {
                offenders.push((i + 1) + ': ' + line.trim());
            }
        });
        if (offenders.length) {
            throw new Error(
                'firebaseConfig.js declares a top-level `app` binding. This shadows ' +
                '`window.app` for inline event handlers (`onclick="app.x()"`) and ' +
                'breaks the AI Assistant Send button. Rename to `firebaseApp` or ' +
                'similar. Offenders:\n' + offenders.join('\n')
            );
        }
    });

    test('Firebase init result is bound to a name OTHER than `app`', () => {
        // Sanity: the file does still call initializeApp(), and assigns its
        // result to *some* variable.
        expect(src).toMatch(/firebase\.initializeApp\s*\(/);
        // A common safe name; this test just pins our convention.
        expect(src).toMatch(/(?:let|const|var)\s+(?:firebaseApp|fbApp|_app)\b/);
    });
});
