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

    t('approved manager can write counters', () =>
        assertSucceeds(as('manager1').collection(counters).doc('retail-20261013').set({ next: 2 })));

    t('legacy owner without status field can read purchases', () =>
        assertSucceeds(as('legacyOwner').collection(purchases).get()));

    t('pending user cannot read counters', () =>
        assertFails(as('pending1').collection(counters).doc('x').get()));

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
