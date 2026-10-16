// Firestore security rules tests. Run from the repo root with `npm run test:rules`
// (starts the Firestore emulator via firebase-tools and runs this file).
const fs = require('fs');
const path = require('path');
const {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds
} = require('@firebase/rules-unit-testing');
const { setLogLevel } = require('firebase/firestore');

// Expected PERMISSION_DENIED errors would otherwise flood the output.
setLogLevel('silent');

const RULES_PATH = path.join(__dirname, '..', 'firestore.rules');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let env;

// Seed user profiles (bypassing rules) into the given users collection.
async function seedUsers(usersCol) {
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await db.collection(usersCol).doc('pending1').set({ name: 'P', email: 'p@x.com', role: 'staff', status: 'pending' });
        await db.collection(usersCol).doc('rejected1').set({ name: 'R', email: 'r@x.com', role: 'staff', status: 'rejected' });
        await db.collection(usersCol).doc('staff1').set({ name: 'S', email: 's@x.com', role: 'staff', status: 'active' });
        await db.collection(usersCol).doc('manager1').set({ name: 'M', email: 'm@x.com', role: 'manager', status: 'approved' });
        await db.collection(usersCol).doc('legacyOwner').set({ name: 'O', email: 'o@x.com', role: 'owner' });
        await db.collection(usersCol).doc('noRole').set({ name: 'N', email: 'n@x.com', status: 'active' });
    });
}

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function defineSuite(prefix) {
    const users = `${prefix}users`;
    const purchases = `${prefix}purchases`;
    const counters = `${prefix}counters`;
    const t = (name, fn) => test(`[${prefix || 'prod'}] ${name}`, fn);

    t('unauthenticated cannot read purchases', () =>
        assertFails(anon().collection(purchases).doc('b1').get()));

    t('pending user cannot read purchases', () =>
        assertFails(as('pending1').collection(purchases).doc('b1').get()));

    t('pending user cannot write purchases', () =>
        assertFails(as('pending1').collection(purchases).doc('b1').set({ total: 1 })));

    t('rejected user cannot read purchases', () =>
        assertFails(as('rejected1').collection(purchases).get()));

    t('signed-in user without a profile cannot read purchases', () =>
        assertFails(as('ghost').collection(purchases).get()));

    t('user with unknown role cannot read purchases', () =>
        assertFails(as('noRole').collection(purchases).get()));

    t('approved staff can write and read purchases', async () => {
        await assertSucceeds(as('staff1').collection(purchases).doc('b1').set({ total: 10, clientVersion: 3 }));
        await assertSucceeds(as('staff1').collection(purchases).doc('b1').get());
        await assertSucceeds(as('staff1').collection(purchases).orderBy('total').get());
    });

    // ---- bill deletion: owner, or the approved user who created the bill ----

    const seedBill = (coll, id, data) => env.withSecurityRulesDisabled((ctx) =>
        ctx.firestore().collection(coll).doc(id).set(data));
    const bills = ['purchases', 'retailSales', 'wholesaleSales'].map(c => `${prefix}${c}`);

    t('creator can delete own bill; other staff/manager cannot (all bill collections)', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'mine', { userId: 'staff1', total: 5 });
            await seedBill(coll, 'theirs', { userId: 'staff1', total: 5 });
            await assertFails(as('manager1').collection(coll).doc('theirs').delete());
            await assertSucceeds(as('staff1').collection(coll).doc('mine').delete());
        }
    });

    t('owner can delete any bill, including legacy bills without userId', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { userId: 'staff1', total: 5 });
            await seedBill(coll, 'legacy', { total: 5 });
            await assertSucceeds(as('legacyOwner').collection(coll).doc('b').delete());
            await assertSucceeds(as('legacyOwner').collection(coll).doc('legacy').delete());
        }
    });

    t('non-owner cannot delete a legacy bill without userId', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'legacy', { total: 5 });
            await assertFails(as('staff1').collection(coll).doc('legacy').delete());
        }
    });

    t('pending creator cannot delete own bill', async () => {
        await seedBill(purchases, 'p', { userId: 'pending1', total: 5 });
        await assertFails(as('pending1').collection(purchases).doc('p').delete());
    });

    t('staff can still record a payment on another user\'s bill', async () => {
        await seedBill(`${prefix}wholesaleSales`, 'w', { userId: 'manager1', total: 100, payment: { cash: 0, due: 100 }, clientVersion: 3 });
        await assertSucceeds(as('staff1').collection(`${prefix}wholesaleSales`).doc('w')
            .update({ 'payment.cash': 40, 'payment.due': 60, openDue: true, clientVersion: 3 }));
    });

    t('non-bill business docs stay deletable by approved staff', async () => {
        await seedBill(`${prefix}drafts`, 'd', { userId: 'manager1' });
        await assertSucceeds(as('staff1').collection(`${prefix}drafts`).doc('d').delete());
    });

    t('staff cannot change userId on another user\'s bill (update or full set)', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { userId: 'manager1', total: 5, clientVersion: 3 });
            await assertFails(as('staff1').collection(coll).doc('b').update({ userId: 'staff1', clientVersion: 3 }));
            await assertFails(as('staff1').collection(coll).doc('b').set({ total: 5, userId: 'staff1', clientVersion: 3 }));
            await assertFails(as('staff1').collection(coll).doc('b').set({ total: 5, clientVersion: 3 }));
        }
    });

    t('staff cannot claim a legacy bill without userId', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'legacy', { total: 5, clientVersion: 3 });
            await assertFails(as('staff1').collection(coll).doc('legacy').update({ userId: 'staff1', clientVersion: 3 }));
            // full edits of a legacy bill (no userId) are owner/manager only
            await assertFails(as('staff1').collection(coll).doc('legacy').set({ total: 6, clientVersion: 3 }));
            await assertSucceeds(as('manager1').collection(coll).doc('legacy').set({ total: 6, clientVersion: 3 }));
        }
    });

    t('owner can change userId on any bill', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { userId: 'manager1', total: 5, clientVersion: 3 });
            await seedBill(coll, 'legacy', { total: 5, clientVersion: 3 });
            await assertSucceeds(as('legacyOwner').collection(coll).doc('b').update({ userId: 'staff1' }));
            await assertSucceeds(as('legacyOwner').collection(coll).doc('legacy').update({ userId: 'staff1' }));
        }
    });

    // ---- bill edits: full edits by owner/manager/creator; others only payment bookkeeping ----

    const otherBill = { userId: 'manager1', total: 100, items: [{ name: 'Rice', qty: 10 }], timestamp: 1760000000000,
        date: '2026-10-01', payment: { online: 0, cash: 0, due: 100, total: 0 }, openDue: true, clientVersion: 3 };

    t('staff cannot rewrite another user\'s bill (items, total, timestamp, full set)', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', otherBill);
            const ref = as('staff1').collection(coll).doc('b');
            await assertFails(ref.update({ items: [], clientVersion: 3 }));
            await assertFails(ref.update({ total: 0, clientVersion: 3 }));
            await assertFails(ref.update({ timestamp: 0, clientVersion: 3 }));
            await assertFails(ref.update({ date: '1970-01-01', clientVersion: 3 }));
            await assertFails(ref.set({ ...otherBill, total: 7, editedBy: 'staff1' }));
            await assertFails(ref.update({ payment: { due: 0 }, total: 0, clientVersion: 3 }));
        }
    });

    t('staff can record a payment and clear another user\'s bill', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { ...otherBill, dueAmount: 100 });
            const ref = as('staff1').collection(coll).doc('b');
            // outstanding.js applyPaymentTransaction
            await assertSucceeds(ref.update({
                payment: { online: 0, cash: 40, due: 60, total: 40 }, payments: [{ amount: 40, recordedBy: 'S' }],
                dueAmount: 60, openDue: true, clientVersion: 3
            }));
            // outstanding.js markAsCleared
            await assertSucceeds(ref.update({
                cleared: true, openDue: false, clientVersion: 3, clearedAt: 'x', clearedBy: 'staff1', clearedByName: 'S'
            }));
        }
    });

    t('staff can clear a sale via a full set that only flips cleared/openDue (wholesale markSaleAsCleared)', async () => {
        const coll = bills[2];
        await seedBill(coll, 'w', otherBill);
        await assertSucceeds(as('staff1').collection(coll).doc('w').set({ ...otherBill, cleared: true, openDue: false }));
    });

    t('staff legacy backfill: may fill a missing timestamp / id and openDue, never change them', async () => {
        for (const coll of bills) {
            const legacy = { userId: 'manager1', total: 100, date: '01/10/2026', payment: { due: 100 } };
            await seedBill(coll, 'old', legacy);
            const ref = as('staff1').collection(coll).doc('old');
            await assertSucceeds(ref.update({ timestamp: 1759276800000, openDue: true, clientVersion: 3 }));
            await assertFails(ref.update({ timestamp: 1, clientVersion: 3 }));
            await seedBill(coll, 'old2', { ...legacy, timestamp: '2026-10-01' });
            await assertSucceeds(as('staff1').collection(coll).doc('old2').update({ timestamp: 1759276800000, clientVersion: 3 }));
            await seedBill(coll, 'old3', legacy);
            await assertSucceeds(as('staff1').collection(coll).doc('old3').set({ ...legacy, id: 'old3', cleared: true, openDue: false, clientVersion: 3 }));
            await seedBill(coll, 'old4', { ...legacy, id: 'old4' });
            await assertFails(as('staff1').collection(coll).doc('old4').update({ id: 'other', clientVersion: 3 }));
        }
    });

    t('creator, manager and owner can fully edit a bill', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { ...otherBill, userId: 'staff1' });
            await assertSucceeds(as('staff1').collection(coll).doc('b').set({ ...otherBill, userId: 'staff1', total: 7, items: [] }));
            await assertSucceeds(as('manager1').collection(coll).doc('b').update({ total: 8, timestamp: 1, clientVersion: 3 }));
            await assertSucceeds(as('legacyOwner').collection(coll).doc('b').update({ items: [{ name: 'x' }], clientVersion: 3 }));
        }
    });

    // ---- settings/app (minClientVersion): owner only ----

    t('only the owner can write settings/app; other settings docs unchanged', async () => {
        const settings = as('staff1').collection(`${prefix}settings`);
        await assertFails(settings.doc('app').set({ minClientVersion: 99 }));
        await assertFails(as('manager1').collection(`${prefix}settings`).doc('app').set({ minClientVersion: 99 }));
        await assertSucceeds(as('legacyOwner').collection(`${prefix}settings`).doc('app').set({ minClientVersion: 3 }));
        await assertSucceeds(settings.doc('app').get());
        await assertFails(settings.doc('app').update({ minClientVersion: 99 }));
        await assertFails(settings.doc('app').delete());
        await assertSucceeds(settings.doc('other').set({ a: 1 }));
    });

    t('approved manager can write counters', () =>
        assertSucceeds(as('manager1').collection(counters).doc('retail-20261013').set({ next: 2 })));

    t('legacy owner without status field can read purchases', () =>
        assertSucceeds(as('legacyOwner').collection(purchases).get()));

    t('pending user cannot read counters', () =>
        assertFails(as('pending1').collection(counters).doc('x').get()));

    const checkpoints = `${prefix}stockCheckpoints`;
    const seedCheckpoint = () => env.withSecurityRulesDisabled(ctx =>
        ctx.firestore().collection(checkpoints).doc('current').set({ asOf: 1, state: [], stale: false, staleCount: 0 }));

    t('owner and manager can rebuild (write state/lease of) the stock checkpoint', async () => {
        await assertSucceeds(as('manager1').collection(checkpoints).doc('current').set({ asOf: 5, state: [], stale: false }));
        await assertSucceeds(as('legacyOwner').collection(checkpoints).doc('current').set({ rebuildingUntil: 9, rebuildingBy: 'x' }, { merge: true }));
        await assertSucceeds(as('staff1').collection(checkpoints).doc('current').get());
    });

    t('staff cannot write checkpoint state or take the rebuild lease', async () => {
        await seedCheckpoint();
        await assertFails(as('staff1').collection(checkpoints).doc('current').set({ asOf: 1, state: [], stale: false }));
        await assertFails(as('staff1').collection(checkpoints).doc('current').set({ asOf: 2 }, { merge: true }));
        await assertFails(as('staff1').collection(checkpoints).doc('current').set({ rebuildingUntil: 9, rebuildingBy: 'x' }, { merge: true }));
        await assertFails(as('staff1').collection(checkpoints).doc('current').set({ stale: false }, { merge: true }));
        await assertFails(as('staff1').collection(checkpoints).doc('current').delete());
    });

    t('staff can mark the checkpoint stale (only the stale fields)', async () => {
        await seedCheckpoint();
        await assertSucceeds(as('staff1').collection(checkpoints).doc('current').set(
            { stale: true, staleCount: 1, staleAt: 2, staleReason: 'x', staleBy: 'staff1' }, { merge: true }));
        await assertFails(as('staff1').collection(checkpoints).doc('current').set(
            { stale: true, staleCount: 2, state: [{ k: 'x', q: 1, v: 1 }] }, { merge: true }));
        await env.withSecurityRulesDisabled(ctx => ctx.firestore().collection(checkpoints).doc('current').delete());
        await assertSucceeds(as('staff1').collection(checkpoints).doc('current').set({ stale: true, staleCount: 1 }, { merge: true }));
    });

    t('legacy scan state: owner/manager only (staff cannot switch the backfill off)', async () => {
        const doc = (uid) => as(uid).collection(checkpoints).doc('legacyScan');
        await assertFails(doc('staff1').set({ expenses: { v: 2, complete: true, foundAt: 0, at: 1 } }, { merge: true }));
        await assertSucceeds(doc('manager1').set({ expenses: { v: 2, complete: true, foundAt: 0, at: 1 } }, { merge: true }));
        await assertSucceeds(doc('legacyOwner').set({ purchases: { v: 2, complete: true, foundAt: 0, at: 1 } }, { merge: true }));
        await assertFails(doc('staff1').set({ expenses: { v: 2, complete: true } }, { merge: true }));
        await assertSucceeds(doc('staff1').get());
    });

    t('pending/rejected/unauthenticated users cannot touch the stock checkpoint', async () => {
        await assertFails(as('pending1').collection(checkpoints).doc('current').get());
        await assertFails(as('rejected1').collection(checkpoints).doc('current').set({ stale: true }));
        await assertFails(anon().collection(checkpoints).doc('current').get());
    });

    const setClientGate = (on) => env.withSecurityRulesDisabled(ctx =>
        ctx.firestore().collection(`${prefix}settings`).doc('app').set({ enforceClientVersion: on }, { merge: true }));

    t('clientVersion gate is off until the owner enables it (old apps keep working)', async () => {
        await setClientGate(false);
        const coll = as('staff1').collection(`${prefix}purchases`);
        await assertSucceeds(coll.doc('legacyApp1').set({ total: 1, userId: 'staff1' }));
        await assertSucceeds(coll.doc('legacyApp1').update({ total: 2 }));
    });

    t('stock records need clientVersion >= 3 once the gate is on (blocks outdated apps)', async () => {
        await setClientGate(true);
        const db = as('staff1');
        for (const c of ['purchases', 'retailSales', 'wholesaleSales', 'stockAdjustments']) {
            const coll = db.collection(`${prefix}${c}`);
            await assertFails(coll.doc('old1').set({ total: 1 }));
            await assertFails(coll.doc('old2').set({ total: 1, clientVersion: 2 }));
            await assertSucceeds(coll.doc('new1').set({ total: 1, clientVersion: 3 }));
        }
        // Expenses etc. are not restricted.
        await assertSucceeds(db.collection(`${prefix}expenses`).doc('e1').set({ amount: 1 }));
    });

    t('payment updates on current bills pass; overwriting with an old-app full set() fails; deletes pass', async () => {
        await setClientGate(true);
        const coll = as('staff1').collection(purchases);
        await assertSucceeds(coll.doc('pay1').set({ total: 100, payment: { due: 100 }, userId: 'staff1', clientVersion: 3 }));
        await assertSucceeds(coll.doc('pay1').update({ payment: { due: 0, cash: 100 }, payments: [{ amount: 100 }], openDue: false, clientVersion: 3 }));
        await assertSucceeds(coll.doc('pay1').update({ cleared: true, openDue: false }));
        await assertFails(coll.doc('pay1').set({ total: 100, payment: { due: 0 } }));
        await assertSucceeds(coll.doc('pay1').delete());
    });

    // ---- users collection ----

    t('pending user can read own profile', () =>
        assertSucceeds(as('pending1').collection(users).doc('pending1').get()));

    t('signed-in user can read own (missing) profile during registration', () =>
        assertSucceeds(as('newbie').collection(users).doc('newbie').get()));

    t('pending user cannot read other profiles', () =>
        assertFails(as('pending1').collection(users).doc('staff1').get()));

    t('pending user cannot list users', () =>
        assertFails(as('pending1').collection(users).get()));

    t('approved staff can list users', () =>
        assertSucceeds(as('staff1').collection(users).orderBy('createdAt', 'desc').get()));

    t('registration as pending staff succeeds', () =>
        assertSucceeds(as('newbie').collection(users).doc('newbie').set({
            name: 'New', email: 'new@x.com', role: 'staff', status: 'pending', createdAt: new Date()
        })));

    t('registration as owner fails', () =>
        assertFails(as('newbie2').collection(users).doc('newbie2').set({
            name: 'New', email: 'new@x.com', role: 'owner', status: 'pending'
        })));

    t('registration as already-active fails', () =>
        assertFails(as('newbie3').collection(users).doc('newbie3').set({
            name: 'New', email: 'new@x.com', role: 'staff', status: 'active'
        })));

    t('cannot create a profile for another uid', () =>
        assertFails(as('newbie4').collection(users).doc('someoneElse').set({
            name: 'New', email: 'new@x.com', role: 'staff', status: 'pending'
        })));

    t('pending user cannot set own status to active', () =>
        assertFails(as('pending1').collection(users).doc('pending1').update({ status: 'active' })));

    t('staff cannot set own role to owner', () =>
        assertFails(as('staff1').collection(users).doc('staff1').update({ role: 'owner' })));

    t('staff cannot set own approvedBy', () =>
        assertFails(as('staff1').collection(users).doc('staff1').update({ approvedBy: 'staff1' })));

    t('user can update own non-privileged fields', () =>
        assertSucceeds(as('staff1').collection(users).doc('staff1').update({ name: 'Renamed', lastLogin: new Date() })));

    t('staff cannot update another user', () =>
        assertFails(as('staff1').collection(users).doc('pending1').update({ name: 'x' })));

    t('manager cannot approve users', () =>
        assertFails(as('manager1').collection(users).doc('pending1').update({ status: 'approved', role: 'staff' })));

    t('owner can approve another user', () =>
        assertSucceeds(as('legacyOwner').collection(users).doc('pending1').update({
            status: 'approved', role: 'manager', approvedAt: new Date(), approvedBy: 'legacyOwner'
        })));

    t('staff cannot delete a user', () =>
        assertFails(as('staff1').collection(users).doc('rejected1').delete()));

    t('owner can delete a user', () =>
        assertSucceeds(as('legacyOwner').collection(users).doc('rejected1').delete()));

    t('approved user can access own preferences only', async () => {
        await assertSucceeds(as('staff1').collection(users).doc('staff1').collection('preferences').doc('ui').set({ a: 1 }));
        await assertFails(as('staff1').collection(users).doc('manager1').collection('preferences').doc('ui').get());
        await assertFails(as('pending1').collection(users).doc('pending1').collection('preferences').doc('ui').get());
    });

    // ---- audit logs / telemetry ----

    t('approved staff can create audit logs but not read them', async () => {
        await assertSucceeds(as('staff1').collection(`${prefix}auditLogs`).add({ action: 'x' }));
        await assertFails(as('staff1').collection(`${prefix}auditLogs`).get());
    });

    t('pending user cannot create audit logs', () =>
        assertFails(as('pending1').collection(`${prefix}auditLogs`).add({ action: 'x' })));

    t('owner can read audit logs; nobody can delete them', async () => {
        await assertSucceeds(as('legacyOwner').collection(`${prefix}auditLogs`).get());
        await env.withSecurityRulesDisabled((ctx) => ctx.firestore().collection(`${prefix}auditLogs`).doc('l1').set({ a: 1 }));
        await assertFails(as('legacyOwner').collection(`${prefix}auditLogs`).doc('l1').delete());
    });

    t('telemetry: staff can create, only owner can read', async () => {
        await assertSucceeds(as('staff1').collection(`${prefix}telemetry`).doc('fp1').set({ count: 1 }));
        await assertFails(as('staff1').collection(`${prefix}telemetry`).doc('fp1').get());
        await assertSucceeds(as('legacyOwner').collection(`${prefix}telemetry`).doc('fp1').get());
    });
}

defineSuite('');
defineSuite('dev_');

test('[cross-env] prod approval does not grant dev access and vice versa', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await db.collection('users').doc('prodOnly').set({ role: 'staff', status: 'active' });
        await db.collection('dev_users').doc('devOnly').set({ role: 'staff', status: 'active' });
    });
    await assertFails(as('prodOnly').collection('dev_purchases').get());
    await assertFails(as('devOnly').collection('purchases').get());
});

test('[other] unknown collections are denied', () =>
    assertFails(as('staff1').collection('randomCollection').get()));

async function main() {
    env = await initializeTestEnvironment({
        projectId: 'demo-aadhat',
        firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8') }
    });

    let passed = 0;
    let failed = 0;
    for (const { name, fn } of tests) {
        await env.clearFirestore();
        await seedUsers('users');
        await seedUsers('dev_users');
        try {
            await fn();
            passed++;
            console.log(`  ok   ${name}`);
        } catch (e) {
            failed++;
            console.log(`  FAIL ${name}\n       ${e.message}`);
        }
    }

    await env.cleanup();
    console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
