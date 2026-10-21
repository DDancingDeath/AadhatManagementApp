/**
 * Click-every-tab smoke (#127): the owner opens every page; any uncaught page
 * error or console error fails the test.
 */
const { test, expect, login, showTab } = require('./support/app');

const TABS = ['billing', 'day', 'history', 'due', 'stock', 'items', 'expenses', 'wholesale-sales',
    'cash-management', 'finance', 'reports', 'analytics', 'settings', 'admin', 'diagnostics'];

test('every page opens without errors', async ({ page, problems }) => {
    await login(page, 'owner');
    for (const tab of TABS) {
        await test.step(tab, async () => {
            await showTab(page, tab);
            await page.waitForTimeout(400);
        });
    }
    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
});
