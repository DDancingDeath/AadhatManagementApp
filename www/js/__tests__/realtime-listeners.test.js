/**
 * @fileoverview Tests for FirebaseService.setupRealtimeListeners: initial
 * state comes from the listeners' first snapshots (no duplicate .get()),
 * later snapshots are applied incrementally via docChanges(), and expensive
 * work (stock recalculation + re-render) is debounced and limited to the
 * visible tab, with hidden tabs refreshed when shown.
 */

import { FirebaseService } from '../firebase/firestore-service.js';
import { AppState } from '../utils/state.js';

const doc = (id, data = {}) => ({ id, data: () => ({ ...data }) });
const snap = (docs, changes = [], fromCache = false) => ({
    docs,
    size: docs.length,
    metadata: { fromCache },
    docChanges: () => changes
});

const DATA_COLLECTIONS = ['items', 'purchases', 'retailSales', 'wholesaleSales', 'expenses', 'stockAdjustments', 'withdrawals'];

let listeners;
let getCalls;

function installFakeFirestore() {
    listeners = {};
    getCalls = 0;
    const query = (name) => {
        const q = {
            orderBy: () => q,
            where: () => q,
            limit: () => q,
            get: async () => { getCalls++; return snap([]); },
            onSnapshot: (...args) => {
                const fns = args.filter(a => typeof a === 'function');
                listeners[name] = { next: fns[0], error: fns[1] };
                return () => { delete listeners[name]; };
            },
            doc: () => ({ onSnapshot: () => () => {} })
        };
        return q;
    };
    global.firebase = { firestore: () => ({ collection: (name) => query(name) }) };
}

function emitInitial(overrides = {}) {
    DATA_COLLECTIONS.forEach(name => {
        listeners[name].next(snap(overrides[name] || []));
    });
}

const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('FirebaseService.setupRealtimeListeners', () => {
    beforeEach(() => {
        installFakeFirestore();
        AppState.currentUser = null;
        AppState.items = [];
        AppState.purchaseHistory = [];
        AppState.salesHistory = [];
        AppState.retailSalesHistory = [];
        AppState.stockAdjustments = [];
        AppState.stock = {};
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        FirebaseService.cleanup();
        jest.useRealTimers();
        delete global.firebase;
        delete window.app;
        document.body.innerHTML = '';
    });

    it('populates AppState from first snapshots without any .get()', async () => {
        const ready = FirebaseService.setupRealtimeListeners();
        emitInitial({
            items: [doc('i1', { name: 'Gehu' })],
            purchases: [doc('p2', { date: 'b' }), doc('p1', { date: 'a' })]
        });
        await ready;

        expect(getCalls).toBe(0);
        expect(AppState.items).toEqual([{ id: 'i1', name: 'Gehu' }]);
        expect(AppState.purchaseHistory.map(p => p.id)).toEqual(['p2', 'p1']);
    });

    it('waits for server data when the first snapshot comes from cache', async () => {
        let resolved = false;
        const ready = FirebaseService.setupRealtimeListeners().then(() => { resolved = true; });
        DATA_COLLECTIONS.forEach(name => listeners[name].next(snap([], [], true)));
        await flushMicrotasks();
        expect(resolved).toBe(false);

        DATA_COLLECTIONS.forEach(name => listeners[name].next(snap([], [], false)));
        await ready;
        expect(resolved).toBe(true);
    });

    it('rejects when a required listener fails first, but tolerates withdrawals failing', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const ready = FirebaseService.setupRealtimeListeners();
        listeners.withdrawals.error(new Error('withdrawals down'));
        listeners.purchases.error(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
        await expect(ready).rejects.toThrow('Quota exceeded.');
    });

    it('applies docChanges incrementally in query order', async () => {
        const ready = FirebaseService.setupRealtimeListeners();
        const a = doc('a', { v: 1 });
        const b = doc('b', { v: 1 });
        const c = doc('c', { v: 1 });
        emitInitial({ purchases: [a, b, c] });
        await ready;

        const d = doc('d', { v: 1 });
        const b2 = doc('b', { v: 2 });
        // [a,b,c] -> add d@0 -> [d,a,b,c] -> move b 2->0 -> [b,d,a,c] -> remove c@3 -> [b,d,a]
        listeners.purchases.next(snap([b2, d, a], [
            { type: 'added', oldIndex: -1, newIndex: 0, doc: d },
            { type: 'modified', oldIndex: 2, newIndex: 0, doc: b2 },
            { type: 'removed', oldIndex: 3, newIndex: -1, doc: c }
        ]));

        expect(AppState.purchaseHistory).toEqual([
            { id: 'b', v: 2 }, { id: 'd', v: 1 }, { id: 'a', v: 1 }
        ]);
    });

    it('debounces stock recalculation and renders only the visible tab, deferring hidden tabs until shown', async () => {
        jest.useFakeTimers();
        document.body.innerHTML = '<div id="stock" class="tab active"></div><div id="history" class="tab"></div>';
        window.app = {
            stock: { render: jest.fn() },
            history: { refresh: jest.fn() }
        };
        const calcSpy = jest.spyOn(FirebaseService, 'calculateStock');

        const ready = FirebaseService.setupRealtimeListeners();
        emitInitial();
        await ready;

        const p1 = doc('p1', { items: [{ name: 'Gehu', qty: 5, rate: 10 }] });
        const p2 = doc('p2', { items: [{ name: 'Gehu', qty: 3, rate: 10 }] });
        listeners.purchases.next(snap([p1], [{ type: 'added', oldIndex: -1, newIndex: 0, doc: p1 }]));
        listeners.wholesaleSales.next(snap([p2], [{ type: 'added', oldIndex: -1, newIndex: 0, doc: p2 }]));

        expect(calcSpy).not.toHaveBeenCalled();
        jest.advanceTimersByTime(200);
        await flushMicrotasks();

        expect(calcSpy).toHaveBeenCalledTimes(1);
        expect(AppState.stock.gehu.quantity).toBe(2);
        expect(window.app.stock.render).toHaveBeenCalledTimes(1);
        expect(window.app.history.refresh).not.toHaveBeenCalled();

        document.getElementById('stock').classList.remove('active');
        document.getElementById('history').classList.add('active');
        window.dispatchEvent(new CustomEvent('aadhat:tabshown', { detail: { tabId: 'history' } }));
        await flushMicrotasks();

        expect(window.app.history.refresh).toHaveBeenCalledTimes(1);
        expect(calcSpy).toHaveBeenCalledTimes(1);
    });

    it('getStock reuses the listener-computed stock until data changes', async () => {
        const ready = FirebaseService.setupRealtimeListeners();
        const p1 = doc('p1', { items: [{ name: 'Gehu', qty: 5, rate: 10 }] });
        emitInitial({ purchases: [p1] });
        await ready;
        const calcSpy = jest.spyOn(FirebaseService, 'calculateStock');

        const first = await FirebaseService.getStock();
        const second = await FirebaseService.getStock();
        expect(second).toBe(first);
        expect(calcSpy).toHaveBeenCalledTimes(1);

        const p2 = doc('p2', { items: [{ name: 'Gehu', qty: 1, rate: 10 }] });
        listeners.purchases.next(snap([p2, p1], [{ type: 'added', oldIndex: -1, newIndex: 0, doc: p2 }]));
        const third = await FirebaseService.getStock();
        expect(calcSpy).toHaveBeenCalledTimes(2);
        expect(third.gehu.quantity).toBe(6);
    });
});
