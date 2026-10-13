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
        await assertSucceeds(as('staff1').collection(purchases).doc('b1').set({ total: 10 }));
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
        await seedBill(`${prefix}wholesaleSales`, 'w', { userId: 'manager1', total: 100, payment: { cash: 0, due: 100 } });
        await assertSucceeds(as('staff1').collection(`${prefix}wholesaleSales`).doc('w')
            .update({ 'payment.cash': 40, 'payment.due': 60 }));
    });

    t('non-bill business docs stay deletable by approved staff', async () => {
        await seedBill(`${prefix}drafts`, 'd', { userId: 'manager1' });
        await assertSucceeds(as('staff1').collection(`${prefix}drafts`).doc('d').delete());
    });

    t('staff cannot change userId on another user\'s bill (update or full set)', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { userId: 'manager1', total: 5 });
            await assertFails(as('staff1').collection(coll).doc('b').update({ userId: 'staff1' }));
            await assertFails(as('staff1').collection(coll).doc('b').set({ total: 5, userId: 'staff1' }));
            await assertFails(as('staff1').collection(coll).doc('b').set({ total: 5 }));
        }
    });

    t('staff cannot claim a legacy bill without userId', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'legacy', { total: 5 });
            await assertFails(as('staff1').collection(coll).doc('legacy').update({ userId: 'staff1' }));
            // a full rewrite that still has no userId is fine (both null)
            await assertSucceeds(as('staff1').collection(coll).doc('legacy').set({ total: 6 }));
        }
    });

    t('owner can change userId on any bill', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { userId: 'manager1', total: 5 });
            await seedBill(coll, 'legacy', { total: 5 });
            await assertSucceeds(as('legacyOwner').collection(coll).doc('b').update({ userId: 'staff1' }));
            await assertSucceeds(as('legacyOwner').collection(coll).doc('legacy').update({ userId: 'staff1' }));
        }
    });

    t('staff edit that keeps userId (full set) is allowed on another user\'s bill', async () => {
        for (const coll of bills) {
            await seedBill(coll, 'b', { userId: 'manager1', total: 5 });
            await assertSucceeds(as('staff1').collection(coll).doc('b').set({ userId: 'manager1', total: 7, editedBy: 'staff1' }));
            await assertSucceeds(as('staff1').collection(coll).doc('b').update({ payments: [{ amount: 1 }], 'payment.cash': 1 }));
        }
    });

    t('approved manager can write counters', () =>
        assertSucceeds(as('manager1').collection(counters).doc('retail-20261013').set({ next: 2 })));

    t('legacy owner without status field can read purchases', () =>
        assertSucceeds(as('legacyOwner').collection(purchases).get()));

    t('pending user cannot read counters', () =>
        assertFails(as('pending1').collection(counters).doc('x').get()));

    const checkpoints = `${prefix}stockCheckpoints`;

    t('approved staff can write and read the stock checkpoint', async () => {
        await assertSucceeds(as('staff1').collection(checkpoints).doc('current').set({ asOf: 1, stale: false }));
        await assertSucceeds(as('manager1').collection(checkpoints).doc('current').set({ stale: true }, { merge: true }));
        await assertSucceeds(as('legacyOwner').collection(checkpoints).doc('current').get());
    });

    t('pending/rejected/unauthenticated users cannot touch the stock checkpoint', async () => {
        await assertFails(as('pending1').collection(checkpoints).doc('current').get());
        await assertFails(as('rejected1').collection(checkpoints).doc('current').set({ stale: true }));
        await assertFails(anon().collection(checkpoints).doc('current').get());
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
