/**
 * Production smoke (#127): read-only, no login. Every non-GET request to a
 * Google/Firebase host is aborted so the test can never write to production.
 * Run with `npm run test:smoke` (playwright.prod.config.js).
 */
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com/, (route) =>
        route.request().method() === 'GET' ? route.continue() : route.abort());
});

test('login screen loads without page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loginEmail')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#loginPassword')).toBeVisible();
    expect(errors).toEqual([]);
});

test('download page and changelog are served', async ({ page, request }) => {
    const changelog = await request.get('/changelog.json');
    expect(changelog.ok()).toBe(true);
    const entries = await changelog.json();
    expect(Array.isArray(entries) ? entries.length : Object.keys(entries).length).toBeGreaterThan(0);

    const res = await page.goto('/download', { waitUntil: 'domcontentloaded' });
    expect(res.ok()).toBe(true);
    await expect(page.locator('body')).not.toBeEmpty();
});
