/**
 * Playwright globalSetup: wait for the emulators, wipe them, then seed users,
 * the item catalogue and a few known bills (dev_ collections, as the app uses
 * on localhost).
 */
const { USERS, ITEMS, waitForEmulators, resetEmulators, signUp, commit } = require('./support/emulator');

const DAY = 86400000;

module.exports = async () => {
    await waitForEmulators();
    await resetEmulators();

    const writes = [];
    for (const u of Object.values(USERS)) {
        const uid = await signUp(u.email);
        writes.push(['dev_users', uid, { name: u.name, email: u.email, role: u.role, status: u.status, createdAt: Date.now() }]);
        if (u.role === 'owner') USERS.owner.uid = uid;
    }
    ITEMS.forEach(i => writes.push(['dev_items', i.id, i]));

    // One purchase per viewport project for the edit spec (projects share the emulator).
    const t = Date.now() - 2 * DAY;
    for (const project of ['phone', 'desktop']) {
        const id = `edit_${project}`;
        writes.push(['dev_purchases', id, {
            id, billNumber: `PEDIT-${project.toUpperCase()}`, timestamp: t, date: new Date(t).toISOString(),
            items: [{ itemId: 'itm_wheat', name: 'Wheat', qty: 50, rate: 22, total: 1100, weights: [50] }],
            billTotal: 1100, laborCharges: 0, grandTotal: 1100, amountPayable: 1100, totalPackets: 1,
            cashPayment: 600, onlinePayment: 0, dueAmount: 500,
            payment: { cash: 600, online: 0, due: 500, total: 1100 },
            customerName: 'Before Edit', type: 'purchase', isPurchase: true,
            userId: USERS.owner.uid, userName: 'Owner', clientVersion: 3, openDue: true
        }]);
    }
    await commit(writes);
};
