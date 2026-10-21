/**
 * Installability guard: the web app manifest must stay valid, its icons must
 * exist with the declared pixel sizes, and index.html must link it.
 */
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(WWW, 'manifest.webmanifest'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');

function pngSize(file) {
    const buf = fs.readFileSync(file);
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const webPath = (src) => path.join(WWW, src.replace(/^\//, ''));

describe('manifest.webmanifest', () => {
    test('has the fields Chromium requires for installability', () => {
        expect(manifest.name).toBeTruthy();
        expect(manifest.short_name).toBeTruthy();
        expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
        expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
        expect(manifest.icons.some((i) => i.sizes === '192x192' && (i.purpose || 'any').includes('any'))).toBe(true);
        expect(manifest.icons.some((i) => i.sizes === '512x512' && (i.purpose || 'any').includes('any'))).toBe(true);
        expect(manifest.icons.some((i) => (i.purpose || '').includes('maskable'))).toBe(true);
    });

    test.each(manifest.icons.map((i) => [i.src, i.sizes]))('%s exists and is %s', (src, sizes) => {
        const [w, h] = sizes.split('x').map(Number);
        expect(pngSize(webPath(src))).toEqual({ width: w, height: h });
    });
});

describe('index.html', () => {
    test('links the manifest, theme colour and icons', () => {
        expect(indexHtml).toMatch(/<link rel="manifest" href="manifest\.webmanifest">/);
        expect(indexHtml).toMatch(new RegExp(`<meta name="theme-color" content="${manifest.theme_color}">`));
        const apple = indexHtml.match(/<link rel="apple-touch-icon" href="([^"]+)">/);
        expect(apple).not.toBeNull();
        expect(pngSize(webPath(apple[1]))).toEqual({ width: 180, height: 180 });
        const fav = indexHtml.match(/<link rel="icon" type="image\/png" sizes="32x32" href="([^"]+)">/);
        expect(fav).not.toBeNull();
        expect(pngSize(webPath(fav[1]))).toEqual({ width: 32, height: 32 });
    });
});
