#!/usr/bin/env node
/**
 * Verifies the service worker's STATIC_ASSETS precache list against www/.
 *
 *   node scripts/check-sw-assets.js          # check (exit 1 on problems)
 *   node scripts/check-sw-assets.js --print  # print the expected list
 *
 * Fails if any entry does not exist on disk (a 404 during precache used to make
 * cache.addAll reject, silently disabling offline caching) or if an app file
 * (js/css/templates) is missing from the list.
 */
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', 'www');
const SW_PATH = path.join(WWW, 'service-worker.js');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
        return [full];
    });
}

function toUrl(file) {
    return '/' + path.relative(WWW, file).split(path.sep).join('/');
}

function expectedAssets() {
    const files = [
        ...walk(path.join(WWW, 'js')).filter((f) => f.endsWith('.js')),
        ...walk(path.join(WWW, 'css')).filter((f) => f.endsWith('.css')),
        ...walk(path.join(WWW, 'templates')).filter((f) => f.endsWith('.html')),
    ].map(toUrl).sort();
    return ['/', '/index.html', '/firebaseConfig.js', ...files];
}

function readStaticAssets(source = fs.readFileSync(SW_PATH, 'utf8')) {
    const match = source.match(/const STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (!match) throw new Error('STATIC_ASSETS array not found in service-worker.js');
    return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function existsOnDisk(url) {
    if (url === '/') return fs.existsSync(path.join(WWW, 'index.html'));
    const rel = url.split('?')[0].replace(/^\//, '');
    const full = path.join(WWW, rel);
    return fs.existsSync(full) && fs.statSync(full).isFile();
}

function check() {
    const listed = readStaticAssets();
    const missingOnDisk = listed.filter((u) => !existsOnDisk(u));
    const notListed = expectedAssets().filter((u) => !listed.includes(u));
    const duplicates = listed.filter((u, i) => listed.indexOf(u) !== i);
    return { listed, missingOnDisk, notListed, duplicates };
}

module.exports = { expectedAssets, readStaticAssets, existsOnDisk, check };

if (require.main === module) {
    if (process.argv.includes('--print')) {
        console.log(expectedAssets().map((u) => `    '${u}',`).join('\n'));
        process.exit(0);
    }
    const { listed, missingOnDisk, notListed, duplicates } = check();
    let ok = true;
    if (missingOnDisk.length) {
        ok = false;
        console.error('STATIC_ASSETS entries missing on disk (would 404):\n  ' + missingOnDisk.join('\n  '));
    }
    if (notListed.length) {
        ok = false;
        console.error('App files not precached by the service worker:\n  ' + notListed.join('\n  '));
    }
    if (duplicates.length) {
        ok = false;
        console.error('Duplicate STATIC_ASSETS entries:\n  ' + duplicates.join('\n  '));
    }
    if (ok) console.log(`OK: ${listed.length} STATIC_ASSETS entries, all present on disk.`);
    process.exit(ok ? 0 : 1);
}
