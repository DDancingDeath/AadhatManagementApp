/**
 * @jest-environment node
 */
/**
 * Static guards (#128):
 *  1. Every app script parses — as a classic script or an ES module, depending
 *     on how it is actually loaded (index.html <script> tags, then the import
 *     graph of the module entry points).
 *  2. Classic scripts don't declare top-level `let`/`const`/`class` bindings
 *     named `app`/`db`/`auth` or any name used as the root of an inline
 *     handler (`onclick="foo.bar()"`). Such bindings live in the global
 *     lexical scope and SHADOW `window.<name>` for inline handlers — the old
 *     `let app = firebase.initializeApp()` bug (STG-WALK-5).
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const WWW = path.join(ROOT, 'www');
const DENY = ['app', 'db', 'auth'];

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');

function parse(code, sourceType) {
    return acorn.parse(code, { ecmaVersion: 'latest', sourceType, allowHashBang: true });
}

function listFiles(dir, filter) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === '__tests__' || e.name === 'node_modules') continue;
            out.push(...listFiles(p, filter));
        } else if (filter(e.name)) {
            out.push(p);
        }
    }
    return out;
}

const HTML_FILES = listFiles(WWW, n => n.endsWith('.html'));

/** <script> tags in an HTML file: { src?, module, inline? } (remote src skipped). */
function scriptsIn(htmlPath) {
    const html = read(htmlPath);
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
        const attrs = m[1];
        const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
        if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue;
        const module = /^module$/i.test(type);
        const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
        if (src) {
            if (/^(https?:)?\/\//i.test(src)) continue;
            const clean = src.split(/[?#]/)[0];
            const base = clean.startsWith('/') ? WWW : path.dirname(htmlPath);
            out.push({ file: path.resolve(base, clean.replace(/^\//, '')), module });
        } else if (m[2].trim()) {
            const line = html.slice(0, m.index).split('\n').length;
            out.push({ inline: m[2], label: `${rel(htmlPath)}:${line} <script>`, module });
        }
    }
    return out;
}

/** Relative import specifiers (static, re-export and dynamic with a string literal). */
function importsOf(ast) {
    const specs = [];
    walk.full(ast, (node) => {
        if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
            specs.push(node.source.value);
        } else if (node.type === 'ImportExpression' && node.source.type === 'Literal') {
            specs.push(node.source.value);
        }
    });
    return specs.filter(s => typeof s === 'string' && s.startsWith('.'));
}

/** Classifies every app script by how it is loaded. */
function classify() {
    const classic = new Map(); // label -> code
    const modules = new Map(); // abs path -> code
    const moduleQueue = [];
    for (const html of HTML_FILES) {
        for (const s of scriptsIn(html)) {
            if (s.inline !== undefined) {
                if (s.module) modules.set(s.label, s.inline); else classic.set(s.label, s.inline);
            } else if (fs.existsSync(s.file)) {
                if (s.module) moduleQueue.push(s.file); else classic.set(rel(s.file), read(s.file));
            }
        }
    }
    // The service worker is registered as a classic worker script.
    classic.set('www/service-worker.js', read(path.join(WWW, 'service-worker.js')));

    while (moduleQueue.length) {
        const file = moduleQueue.shift();
        if (modules.has(file)) continue;
        const code = read(file);
        modules.set(file, code);
        let ast;
        try { ast = parse(code, 'module'); } catch { continue; } // reported by the syntax test
        for (const spec of importsOf(ast)) {
            const target = path.resolve(path.dirname(file), spec.split(/[?#]/)[0]);
            if (fs.existsSync(target)) moduleQueue.push(target);
        }
    }
    return { classic, modules };
}

/** Names used as the root identifier of inline handlers, e.g. onclick="foo.bar()" -> foo. */
function inlineHandlerRoots() {
    const roots = new Set();
    const files = [...HTML_FILES, ...listFiles(path.join(WWW, 'js'), n => n.endsWith('.js'))];
    const attr = /\bon[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const f of files) {
        const text = read(f);
        let m;
        while ((m = attr.exec(text))) {
            const body = m[1] ?? m[2];
            const id = body.trim().match(/^([A-Za-z_$][\w$]*)\s*[.(]/);
            if (id) roots.add(id[1]);
        }
    }
    ['window', 'this', 'event', 'document', 'return', 'if', 'typeof', 'void'].forEach(n => roots.delete(n));
    return roots;
}

/** Top-level lexical bindings in a classic script that would shadow window.<name>. */
function shadowingBindings(code, forbidden) {
    const ast = parse(code, 'script');
    const hits = [];
    for (const node of ast.body) {
        const names = [];
        if (node.type === 'VariableDeclaration' && node.kind !== 'var') {
            node.declarations.forEach(d => walk.full(d.id, n => { if (n.type === 'Identifier') names.push(n.name); }));
        } else if (node.type === 'ClassDeclaration' && node.id) {
            names.push(node.id.name);
        }
        names.filter(n => forbidden.has(n)).forEach(n => hits.push(`${node.type === 'ClassDeclaration' ? 'class' : node.kind} ${n}`));
    }
    return hits;
}

const { classic, modules } = classify();
const forbidden = new Set([...DENY, ...inlineHandlerRoots()]);

describe('static guard: every app script parses (#128)', () => {
    test('index.html loads firebaseConfig.js as a classic script and main.js as a module', () => {
        expect(classic.has('www/firebaseConfig.js')).toBe(true);
        expect(modules.has(path.join(WWW, 'js', 'main.js'))).toBe(true);
        // main.js imports (directly or transitively) the feature modules.
        expect(modules.has(path.join(WWW, 'js', 'modules', 'billing.js'))).toBe(true);
    });

    test.each([...classic.keys()])('classic script %s parses', (label) => {
        expect(() => parse(classic.get(label), 'script')).not.toThrow();
    });

    test.each([...modules.keys()].map(k => [path.isAbsolute(k) ? rel(k) : k, k]))('module %s parses', (_label, key) => {
        expect(() => parse(modules.get(key), 'module')).not.toThrow();
    });

    test('every www/js file is reached from index.html (or parses as a module)', () => {
        const all = listFiles(path.join(WWW, 'js'), n => n.endsWith('.js'));
        const unreached = all.filter(f => !modules.has(f));
        unreached.forEach(f => expect(() => parse(read(f), 'module')).not.toThrow());
    });

    test('a syntax error is detected', () => {
        expect(() => parse('const x = ;', 'module')).toThrow();
        expect(() => parse('export const x = 1;', 'script')).toThrow();
    });
});

describe('static guard: no shadowing globals in classic scripts (#128)', () => {
    test.each([...classic.keys()])('%s declares no top-level let/const/class named app/db/auth or an inline-handler root', (label) => {
        expect(shadowingBindings(classic.get(label), forbidden)).toEqual([]);
    });

    test('the guard catches the old firebaseConfig bug class', () => {
        expect(shadowingBindings('let app = firebase.initializeApp({});', forbidden)).toEqual(['let app']);
        expect(shadowingBindings('const db = firebase.firestore();\nconst auth = firebase.auth();', forbidden)).toEqual(['const db', 'const auth']);
        expect(shadowingBindings('var db = 1; function f() { const app = 2; }', forbidden)).toEqual([]);
    });
});
