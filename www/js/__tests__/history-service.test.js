/**
 * @fileoverview FirebaseService recent-window + stock checkpoint behaviour
 * against an in-memory Firestore: startup reads, full rebuild + backfill,
 * checkpoint replay equivalence, ensureHistoryFrom/loadOlderHistory merging,
 * invalidation and roll-forward.
 */
import { FirebaseService } from '../firebase/firestore-service.js';
import { AppState } from '../utils/state.js';
import { createFakeFirestore } from './__mocks__/fake-firestore.js';
import { ITEMS, generateHistory } from './__mocks__/history-data.js';
import { defaultWindowStart, monthsBefore, dateDescComparator } from '../utils/history-range.js';
import { computeStock, eventTime, buildCheckpointState, serializeState, itemsSignature } from '../utils/stock-replay.js';
import { outstandingDue } from '../utils/money.js';

const NOW = Date.now();
const W = defaultWindowStart(NOW);
const COLLS = ['purchases', 'wholesaleSales', 'retailSales', 'stockAdjustments', 'expenses', 'withdrawals'];
const STATE_KEY = {
    purchases: 'purchaseHistory', wholesaleSales: 'salesHistory', retailSales: 'retailSalesHistory',
    stockAdjustments: 'stockAdjustments', expenses: 'expensesHistory', withdrawals: 'withdrawalsHistory'
};

let fake;

const settle = async (rounds = 10) => {
    for (let i = 0; i < rounds; i++) await fake.settle();
};

/** Documents of a collection as the app sees them, in orderBy('date','desc') order. */
const docsOf = (name) => [...fake.raw(name).entries()]
    .map(([id, d]) => ({ ...d, id }))
    .filter(d => d.date !== undefined)
    .sort(dateDescComparator(r => r.id));

const fullStock = () => computeStock({
    purchases: docsOf('purchases'),
    wholesaleSales: docsOf('wholesaleSales'),
    retailSales: docsOf('retailSales'),
    stockAdjustments: docsOf('stockAdjustments')
}, ITEMS);

const wholesaleRuleDue = (d) => {
    if (d.cleared) return 0;
    const p = d.payment || {};
    return p.due || ((d.total || 0) - ((p.online || 0) + (p.cash || 0)));
};

function install(seed = 3) {
    fake = createFakeFirestore();
    global.firebase = fake.firebase;
    fake.seed('items', ITEMS);
    const h = generateHistory(seed, NOW);
    COLLS.forEach(c => fake.seed(c, h[c]));
    return h;
}

async function open() {
    FirebaseService.cleanup();
    await FirebaseService.setupRealtimeListeners();
    await FirebaseService.getStock();
    await settle();
}

async function rebuildSettled() {
    let r;
    for (let i = 0; i < 5; i++) {
        await settle();
        r = await FirebaseService.rebuildStockCheckpoint();
        if (r.status === 'fresh') return r;
    }
    return r;
}

const cpDoc = () => fake.raw('stockCheckpoints').get('current');

describe('recent history window + stock checkpoint', () => {
    beforeEach(() => {
        AppState.currentUser = { uid: 'u1' };
        AppState.stock = {};
        jest.spyOn(console, 'info').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        FirebaseService.cleanup();
        jest.restoreAllMocks();
        delete global.firebase;
        AppState.currentUser = null;
    });

    it('first open without a checkpoint: full replay, then rebuild + backfill; next open reads only the window', async () => {
        install();
        const expected = fullStock();
        await open();
        expect(AppState.stock).toEqual(expected);
        expect(FirebaseService.isFullHistoryLoaded()).toBe(true);

        await rebuildSettled();
        const cp = cpDoc();
        expect(cp).toMatchObject({ stale: false, asOf: W, formatVersion: 1 });
        expect(cp.backfill.complete).toBe(true);
        // Every dated stock document now has a numeric timestamp.
        ['purchases', 'wholesaleSales', 'retailSales', 'stockAdjustments'].forEach(c => {
            docsOf(c).forEach(d => expect(typeof d.timestamp).toBe('number'));
        });
        expect(cp.pinned.wholesaleSales.length + cp.pinned.purchases.length + cp.pinned.retailSales.length).toBeGreaterThan(0);

        // Second open: no .get(), stock identical, window + dues only.
        fake.stats.gets = 0;
        fake.stats.reads = 0;
        await open();
        expect(fake.stats.gets).toBe(0);
        expect(FirebaseService.getStockCheckpointInfo()).toMatchObject({ asOf: W });
        expect(AppState.stock).toEqual(expected);
        expect(AppState.historyLoadedFrom).toBe(W);

        let windowDocs = 0;
        let olderLoaded = 0;
        COLLS.forEach(c => {
            const ids = new Set(AppState[STATE_KEY[c]].map(r => r.id));
            expect(ids.size).toBe(AppState[STATE_KEY[c]].length);
            docsOf(c).forEach(d => {
                if (eventTime(d) >= W && eventTime(d) !== Number.MAX_SAFE_INTEGER) {
                    windowDocs++;
                    expect(ids.has(d.id)).toBe(true);
                } else if (ids.has(d.id)) {
                    olderLoaded++;
                }
                const due = outstandingDue(d) > 0 || (c === 'wholesaleSales' && wholesaleRuleDue(d) > 0);
                if (due) expect(ids.has(d.id)).toBe(true);
            });
            expect(AppState[STATE_KEY[c]]).toEqual(AppState[STATE_KEY[c]].slice().sort(dateDescComparator(r => r.id)));
        });
        const totalDocs = COLLS.reduce((n, c) => n + fake.raw(c).size, 0);
        // items + checkpoint + window + old dues (+ empty-query minimums).
        expect(fake.stats.reads).toBeLessThan(ITEMS.length + 1 + windowDocs * 1.2 + olderLoaded * 2 + 30);
        expect(fake.stats.reads).toBeLessThan(totalDocs / 2);
    });

    it('ensureHistoryFrom merges older ranges (deduped, date desc), shares concurrent calls and updates the window start before resolving', async () => {
        install(5);
        await open();
        await rebuildSettled();
        await open();
        const from = monthsBefore(W, 3);
        const events = [];
        const onExt = (e) => events.push(e.detail.from);
        window.addEventListener('aadhat:historyextended', onExt);
        fake.stats.gets = 0;
        const a = FirebaseService.ensureHistoryFrom(from);
        const b = FirebaseService.ensureHistoryFrom(new Date(from));
        await Promise.all([a, b]);
        expect(FirebaseService.getHistoryWindowStart()).toBe(from);
        expect(fake.stats.gets).toBe(6);
        expect(events).toEqual([from]);

        COLLS.forEach(c => {
            const arr = AppState[STATE_KEY[c]];
            const ids = arr.map(r => r.id);
            expect(new Set(ids).size).toBe(ids.length);
            docsOf(c).filter(d => typeof d.timestamp === 'number' && d.timestamp >= from)
                .forEach(d => expect(ids).toContain(d.id));
            expect(arr).toEqual(arr.slice().sort(dateDescComparator(r => r.id)));
        });

        await FirebaseService.ensureHistoryFrom(from + 1000);
        expect(fake.stats.gets).toBe(6);

        // Infinite scroll to the end: month-aligned steps, then full history.
        let res;
        let guard = 0;
        do {
            const before = FirebaseService.getHistoryWindowStart();
            res = await FirebaseService.loadOlderHistory(1);
            if (!res.reachedEnd) {
                expect(res.loadedFrom).toBe(monthsBefore(before, 1));
                expect(new Date(res.loadedFrom).getDate()).toBe(1);
                expect(new Date(res.loadedFrom).getHours()).toBe(0);
            }
            expect(FirebaseService.getHistoryWindowStart()).toBe(res.loadedFrom);
        } while (!res.reachedEnd && ++guard < 40);
        expect(res).toEqual({ loadedFrom: 0, reachedEnd: true });
        expect(FirebaseService.isFullHistoryLoaded()).toBe(true);
        COLLS.forEach(c => expect(AppState[STATE_KEY[c]].map(r => r.id).sort()).toEqual(docsOf(c).map(d => d.id).sort()));
        window.removeEventListener('aadhat:historyextended', onExt);
    });

    it('editing an old bill invalidates the checkpoint and a rebuild keeps stock exact; payment-only edits do not', async () => {
        install(8);
        await open();
        await rebuildSettled();
        await open();
        await FirebaseService.ensureHistoryFrom(monthsBefore(W, 4));
        const old = AppState.purchaseHistory.find(p => p.timestamp < W - 40 * 86400000 && Array.isArray(p.items) && p.items.length);
        expect(old).toBeTruthy();

        await FirebaseService.updatePurchase({ ...old, payment: { online: 0, cash: 1, due: 0, total: 1 } });
        await settle();
        expect(cpDoc().stale).toBe(false);

        const builtBefore = cpDoc().builtAt;
        const edited = { ...old, items: [...old.items, { itemId: 'gehu', name: 'Gehu', qty: 777, rate: 3 }] };
        await FirebaseService.updatePurchase(edited);
        await settle(3);
        expect(cpDoc().staleCount).toBe(1);

        const r = await rebuildSettled();
        expect(r.status).toBe('fresh');
        expect(cpDoc()).toMatchObject({ stale: false, staleCount: 1 });
        expect(cpDoc().builtAt).not.toBe(builtBefore);
        const stock = await FirebaseService.getStock();
        expect(stock).toEqual(fullStock());
        expect(FirebaseService.getStockCheckpointInfo()).not.toBeNull();

        // A new sale updates stock live through the checkpoint path.
        await FirebaseService.saveRetailSale({ date: new Date().toISOString(), items: [{ itemId: 'gehu', name: 'Gehu', qty: 2, rate: 30 }] });
        await settle();
        expect(await FirebaseService.getStock()).toEqual(fullStock());
        expect(cpDoc().staleCount).toBe(1);
    });

    it('a one-shot history read that never completes is retried instead of hanging startup', async () => {
        install(17);
        await FirebaseService.setupRealtimeListeners();
        jest.useFakeTimers();
        // The next two get() calls (the first collection of the full load) never settle.
        let hang = 2;
        const origCollection = fake.db.collection;
        fake.db.collection = (name) => {
            const c = origCollection(name);
            return { ...c, get: () => (hang-- > 0 ? new Promise(() => {}) : c.get()) };
        };
        let done = false;
        const p = FirebaseService.getStock().then(() => { done = true; });
        for (let i = 0; i < 10 && !done; i++) {
            jest.advanceTimersByTime(20000);
            for (let k = 0; k < 50; k++) await Promise.resolve();
        }
        jest.useRealTimers();
        await p;
        fake.db.collection = origCollection;
        expect(hang).toBeLessThan(2);
        expect(FirebaseService.isFullHistoryLoaded()).toBe(true);
        expect(AppState.stock).toEqual(fullStock());
    });

    it('rolls an old checkpoint forward from in-memory data without changing stock', async () => {
        install(11);
        await open();
        await rebuildSettled();
        const asOf = monthsBefore(W, 2);
        const all = {
            purchases: docsOf('purchases'), wholesaleSales: docsOf('wholesaleSales'),
            retailSales: docsOf('retailSales'), stockAdjustments: docsOf('stockAdjustments')
        };
        const built = buildCheckpointState(all, asOf, ITEMS);
        const cp = cpDoc();
        fake.seed('stockCheckpoints', [{
            ...cp, id: 'current', asOf, state: serializeState(built.state),
            resolutions: built.resolutions.map(r => ({ i: r[0], n: r[1], k: r[2] })),
            itemsSignature: itemsSignature(ITEMS), builtAt: 123
        }]);
        const expected = fullStock();
        fake.stats.gets = 0;
        await open();
        expect(AppState.historyLoadedFrom).toBe(asOf);
        await settle();
        const result = await FirebaseService.maintainStockCheckpoint();
        expect(['rolled', 'current']).toContain(result);
        expect(cpDoc()).toMatchObject({ asOf: W, rolledForwardFrom: asOf, stale: false });
        expect(fake.stats.gets).toBe(0);
        FirebaseService.cleanup();
        await open();
        expect(AppState.historyLoadedFrom).toBe(W);
        expect(AppState.stock).toEqual(expected);
    });

    it('keeps an old due bill after it is paid off elsewhere (fresh copy) and drops it when deleted', async () => {
        install(13);
        await open();
        await rebuildSettled();
        await open();
        const oldDue = AppState.salesHistory.find(s => eventTime(s) < W && typeof s.payment?.due === 'number' && s.payment.due > 0 && !s.cleared);
        expect(oldDue).toBeTruthy();
        await fake.db.collection('wholesaleSales').doc(oldDue.id).update({ 'payment.due': 0, 'payment.cash': oldDue.total });
        await settle();
        const kept = AppState.salesHistory.find(s => s.id === oldDue.id);
        expect(kept.payment.due).toBe(0);

        const another = AppState.purchaseHistory.find(s => eventTime(s) < W && typeof s.payment?.due === 'number' && s.payment.due > 0 && !s.cleared && s.items?.length);
        expect(another).toBeTruthy();
        await fake.db.collection('purchases').doc(another.id).delete();
        await settle();
        expect(AppState.purchaseHistory.find(s => s.id === another.id)).toBeUndefined();
        // A direct delete of an old stock record is detected and invalidates the checkpoint.
        expect(cpDoc().staleCount).toBeGreaterThanOrEqual(1);
    });
});
