/**
 * One-time login helper. Opens a real Chromium window, you log in by hand,
 * press Enter in the terminal, and your auth state is saved to
 * scripts/auth-state.json so future inspect-app.js runs are headless.
 *
 * Run with:
 *   node scripts/save-login.js
 */
const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

const APP_URL = process.env.APP_URL || 'https://aadhat-management.web.app';
const STATE_PATH = path.resolve(__dirname, 'auth-state.json');

async function main() {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    console.log(`[save-login] opening ${APP_URL}`);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

    console.log('[save-login] ▶ Log in in the opened window.');
    console.log('[save-login] ▶ When you are fully signed in and the dashboard is visible,');
    console.log('[save-login] ▶ come back here and press Enter to save the session.');

    await new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('Press Enter when logged in… ', () => {
            rl.close();
            resolve();
        });
    });

    await ctx.storageState({ path: STATE_PATH });
    console.log(`[save-login] saved auth state to ${STATE_PATH}`);

    await browser.close();
}

main().catch((err) => {
    console.error('[save-login] failed:', err);
    process.exit(1);
});
