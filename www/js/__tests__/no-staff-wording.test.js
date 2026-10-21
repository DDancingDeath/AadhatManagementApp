/**
 * Owner request: people who use the app must not be called "staff" in anything they see.
 * The stored role value 'staff' stays (Firestore, rules, code) but is displayed as "Member"
 * via Helpers.roleLabel(). This guard scans user-facing text so the word doesn't come back.
 */
const fs = require('fs');
const path = require('path');
const { Helpers } = require('../utils/helpers.js');

const WWW = path.join(__dirname, '..', '..');
const ROOT = path.join(WWW, '..');
const STAFF_WORD = /staff|स्टाफ|कर्मचारी/i;

const read = (p) => fs.readFileSync(p, 'utf8');
const listFiles = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : listFiles(full, ext);
    return e.name.endsWith(ext) ? [full] : [];
});

// Strip markup/code that is never shown: comments, <style>, CSS selectors, class names and
// the exact role value 'staff' / "staff" (option values, role comparisons).
function stripNonVisibleHtml(html) {
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/\sclass="[^"]*"/g, '')
        .replace(/(['"])staff\1/g, '');
}

function offendingLines(text) {
    return text.split(/\r?\n/).filter(line => STAFF_WORD.test(line)).map(l => l.trim());
}

describe('no "staff" wording in user-facing text', () => {
    it('templates and download page', () => {
        const files = [...listFiles(path.join(WWW, 'templates'), '.html'), path.join(WWW, 'download.html')];
        const hits = files.flatMap(f =>
            offendingLines(stripNonVisibleHtml(read(f))).map(l => `${path.relative(WWW, f)}: ${l}`));
        expect(hits).toEqual([]);
    });

    it('release notes (What\'s new / download page)', () => {
        const { releases } = JSON.parse(read(path.join(WWW, 'changelog.json')));
        const hits = releases.flatMap(r =>
            [...(r.notes.en || []), ...(r.notes.hi || [])].filter(n => STAFF_WORD.test(n)).map(n => `${r.version}: ${n}`));
        expect(hits).toEqual([]);
    });

    it('toast / alert / confirm / modal messages and rendered HTML text in www/js', () => {
        const msgCall = /\b(?:showToast|alert|confirm|showModal)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
        // Text between tags inside JS template strings, e.g. `<button>👤 Staff</button>`
        const tagText = />([^<>{}`;]*)</g;
        const hits = [];
        for (const f of listFiles(path.join(WWW, 'js'), '.js')) {
            const src = read(f);
            for (const re of [msgCall, tagText]) {
                for (const m of src.matchAll(re)) {
                    const text = m[m.length - 1];
                    if (STAFF_WORD.test(text)) hits.push(`${path.relative(WWW, f)}: ${text.trim()}`);
                }
            }
        }
        expect(hits).toEqual([]);
    });

    it('Android strings', () => {
        const strings = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
        expect(offendingLines(read(strings).replace(/<!--[\s\S]*?-->/g, ''))).toEqual([]);
    });

    it('displays the stored role value "staff" as "Member"', () => {
        expect(Helpers.roleLabel('staff')).toBe('Member');
        expect(Helpers.roleLabel('owner')).toBe('Owner');
        expect(Helpers.roleLabel('manager')).toBe('Manager');
    });
});
