/**
 * #102: the saved dark-mode preference must be applied at boot, before first
 * paint, by the inline #themeBoot script at the top of <body> in index.html.
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const bootScript = /<script id="themeBoot">([\s\S]*?)<\/script>/.exec(html);

describe('theme boot script (#102)', () => {
    afterEach(() => {
        document.body.className = '';
        localStorage.clear();
    });

    test('is the first thing in <body>, so it runs before the app paints', () => {
        expect(bootScript).not.toBeNull();
        const afterBody = html.slice(html.indexOf('<body>') + '<body>'.length);
        expect(afterBody.replace(/<!--[\s\S]*?-->/g, '').trim().startsWith('<script id="themeBoot">')).toBe(true);
    });

    test('darkMode=true adds body.dark-mode; otherwise the body stays light', () => {
        localStorage.setItem('darkMode', 'true');
        new Function(bootScript[1])();
        expect(document.body.classList.contains('dark-mode')).toBe(true);

        document.body.className = '';
        localStorage.setItem('darkMode', 'false');
        new Function(bootScript[1])();
        expect(document.body.classList.contains('dark-mode')).toBe(false);
    });
});