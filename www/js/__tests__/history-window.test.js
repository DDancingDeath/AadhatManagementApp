/**
 * @fileoverview Pure tests for the recent-history window and the stock
 * checkpoint replay: replay from a checkpoint must equal a full replay.
 */
import {
    eventTime,
    computeStock,
    computeStockFrom,
    buildCheckpointState,
    serializeState,
    deserializeState,
    resolutionsStillValid,
    itemsSignature,
    changeInvalidatesCheckpoint
} from '../utils/stock-replay.js';
import { defaultWindowStart, monthsBefore, normalizeFrom, compareFirestoreValues, dateDescComparator } from '../utils/history-window.js';
import { ITEMS, generateHistory, rng } from './__mocks__/history-data.js';

const NOW = new Date(2026, 9, 14, 12, 0, 0).getTime();

const stockSources = (h) => ({
    purchases: h.purchases,
    wholesaleSales: h.wholesaleSales,
    retailSales: h.retailSales,
    stockAdjustments: h.stockAdjustments
});

/** What AppState holds with a window from `from`: every record with t >= from plus some older extras. */
const windowed = (h, from, seed) => {
    const r = rng(seed);
    const keep = (arr) => arr.filter(rec => eventTime(rec) >= from || r() < 0.2);
    return {
        purchases: keep(h.purchases),
        wholesaleSales: keep(h.wholesaleSales),
        retailSales: keep(h.retailSales),
        stockAdjustments: keep(h.stockAdjustments)
    };
};

describe('defaultWindowStart', () => {
    it('is local midnight on the 1st of the previous month', () => {
        expect(defaultWindowStart(new Date(2026, 9, 14, 0, 40))).toBe(new Date(2026, 8, 1).getTime());
        expect(defaultWindowStart(new Date(2026, 2, 31, 23, 59))).toBe(new Date(2026, 1, 1).getTime());
    });

    it('rolls January back to the previous December', () => {
        expect(defaultWindowStart(new Date(2027, 0, 1, 0, 0, 1))).toBe(new Date(2026, 11, 1).getTime());
        expect(defaultWindowStart(new Date(2027, 0, 31, 12))).toBe(new Date(2026, 11, 1).getTime());
    });
});

describe('monthsBefore / normalizeFrom', () => {
    it('returns the 1st of a calendar month at local midnight', () => {
        expect(monthsBefore(new Date(2026, 8, 1).getTime(), 1)).toBe(new Date(2026, 7, 1).getTime());
        expect(monthsBefore(new Date(2026, 0, 1).getTime(), 1)).toBe(new Date(2025, 11, 1).getTime());
        expect(monthsBefore(new Date(2026, 8, 17, 15).getTime(), 1)).toBe(new Date(2026, 7, 1).getTime());
        expect(monthsBefore(new Date(2026, 8, 1).getTime(), 3)).toBe(new Date(2026, 5, 1).getTime());
    });

    it('normalizes ensureHistoryFrom arguments', () => {
        expect(normalizeFrom(null)).toBe(0);
        expect(normalizeFrom(undefined)).toBe(0);
        expect(normalizeFrom(new Date(5000))).toBe(5000);
        expect(normalizeFrom(1234)).toBe(1234);
        expect(normalizeFrom(-5)).toBe(0);
    });
});

describe('date-desc ordering (orderBy("date","desc") emulation)', () => {
    it('orders by Firestore type order, then value, then doc id desc', () => {
        expect(compareFirestoreValues(null, 1)).toBeLessThan(0);
        expect(compareFirestoreValues(5, { seconds: 1, nanoseconds: 0, toMillis: () => 1000 })).toBeLessThan(0);
        expect(compareFirestoreValues({ seconds: 1, nanoseconds: 0, toMillis: () => 1000 }, 'a')).toBeLessThan(0);
        const recs = [
            { id: 'a', date: '2026-01-02' }, { id: 'b', date: '2026-01-02' },
            { id: 'c', date: '14/10/2026, 1:00:00 pm' }, { id: 'd', date: { seconds: 5, nanoseconds: 0, toMillis: () => 5000 } }
        ];
        const sorted = recs.slice().sort(dateDescComparator(r => r.id)).map(r => r.id);
        expect(sorted).toEqual(['b', 'a', 'c', 'd']);
    });
});

describe('stock checkpoint replay equivalence', () => {
    [1, 7, 42, 20261014].forEach(seed => {
        it(`replay from checkpoint equals full replay over 18 months (seed ${seed})`, () => {
            const h = generateHistory(seed, NOW);
            const all = stockSources(h);
            const expected = computeStock(all, ITEMS);
            expect(Object.keys(expected).length).toBeGreaterThan(3);

            const cuts = [
                defaultWindowStart(NOW),
                new Date(2025, 11, 1).getTime(),
                new Date(2025, 5, 1).getTime(),
                new Date(2024, 0, 1).getTime(),
                NOW + 1
            ];
            cuts.forEach((asOf, i) => {
                const built = buildCheckpointState(all, asOf, ITEMS);
                // Round-trip through the stored representation.
                const stored = JSON.parse(JSON.stringify({ state: serializeState(built.state) }));
                const state = deserializeState(stored.state);
                const actual = computeStockFrom(state, asOf, windowed(h, asOf, seed + i), ITEMS);
                expect(actual).toEqual(expected);
                expect(resolutionsStillValid(built.resolutions, ITEMS)).toBe(true);
            });
        });
    });

    it('rolling a checkpoint forward equals building it at the new date', () => {
        const h = generateHistory(99, NOW);
        const all = stockSources(h);
        const a1 = new Date(2025, 6, 1).getTime();
        const a2 = new Date(2026, 8, 1).getTime();
        const first = buildCheckpointState(all, a1, ITEMS);
        const rolled = buildCheckpointState(windowed(h, a1, 5), a2, ITEMS, { state: first.state, from: a1 });
        const direct = buildCheckpointState(all, a2, ITEMS);
        expect(rolled.state).toEqual(direct.state);
        expect(computeStockFrom(rolled.state, a2, all, ITEMS)).toEqual(computeStock(all, ITEMS));
    });

    it('keeps records without a parseable date at the end of the timeline', () => {
        const sources = {
            purchases: [{ id: 'x', date: '', items: [{ itemId: 'gehu', qty: 10, rate: 5 }] }],
            wholesaleSales: [{ id: 'y', timestamp: 1000, date: 'x', items: [{ itemId: 'gehu', qty: 4 }] }],
            retailSales: [],
            stockAdjustments: [{ id: 'z', timestamp: 2000, date: 'x', itemId: 'gehu', adjustType: 'set', quantity: 1, rate: 0 }]
        };
        const asOf = 1500;
        const cp = buildCheckpointState(sources, asOf, ITEMS);
        expect(computeStockFrom(cp.state, asOf, sources, ITEMS)).toEqual(computeStock(sources, ITEMS));
        expect(computeStock(sources, ITEMS).gehu.quantity).toBe(11);
    });
});

describe('catalogue compatibility of a checkpoint', () => {
    const sources = {
        purchases: [
            { timestamp: 1, items: [{ itemId: 'gehu', name: 'Gehu', qty: 1, rate: 1 }] },
            { timestamp: 2, items: [{ name: ' CHANA DAL ', qty: 1, rate: 1 }] },
            { timestamp: 3, items: [{ name: 'bajra', qty: 1, rate: 1 }] }
        ],
        wholesaleSales: [], retailSales: [], stockAdjustments: []
    };

    it('stays valid when unrelated items are added or rates change', () => {
        const { resolutions } = buildCheckpointState(sources, 10, ITEMS);
        const more = [...ITEMS.map(i => ({ ...i, rate: 99 })), { id: 'til', name: 'Til' }];
        expect(itemsSignature(more)).not.toBe(itemsSignature(ITEMS));
        expect(resolutionsStillValid(resolutions, more)).toBe(true);
    });

    it('becomes invalid when a legacy name now resolves differently', () => {
        const { resolutions } = buildCheckpointState(sources, 10, ITEMS);
        expect(resolutionsStillValid(resolutions, [...ITEMS, { id: 'b1', name: 'Bajra' }])).toBe(false);
        expect(resolutionsStillValid(resolutions, ITEMS.map(i => (i.id === 'chana' ? { ...i, name: 'Chana' } : i)))).toBe(false);
        expect(resolutionsStillValid(resolutions, ITEMS.filter(i => i.id !== 'chana'))).toBe(false);
    });
});

describe('changeInvalidatesCheckpoint', () => {
    const asOf = 10000;
    const old = { id: 'o', timestamp: 5000, date: 'x', items: [{ itemId: 'gehu', qty: 5, rate: 10 }], payment: { due: 50 } };
    const recent = { ...old, id: 'r', timestamp: 20000 };

    it('ignores payment-only edits of old bills', () => {
        expect(changeInvalidatesCheckpoint(old, { ...old, payment: { due: 0, cash: 50 }, cleared: true }, asOf)).toBe(false);
    });

    it('invalidates item or quantity edits of old bills', () => {
        expect(changeInvalidatesCheckpoint(old, { ...old, items: [{ itemId: 'gehu', qty: 6, rate: 10 }] }, asOf)).toBe(true);
    });

    it('ignores edits of records at/after the checkpoint', () => {
        expect(changeInvalidatesCheckpoint(recent, { ...recent, items: [] }, asOf)).toBe(false);
        expect(changeInvalidatesCheckpoint(null, { ...recent, id: 'new' }, asOf)).toBe(false);
    });

    it('invalidates moving a record before the checkpoint, backdated creates and old deletes', () => {
        expect(changeInvalidatesCheckpoint(recent, { ...recent, timestamp: 9000 }, asOf)).toBe(true);
        expect(changeInvalidatesCheckpoint(null, { ...old, id: 'backdated' }, asOf)).toBe(true);
        expect(changeInvalidatesCheckpoint(old, null, asOf)).toBe(true);
        expect(changeInvalidatesCheckpoint(recent, null, asOf)).toBe(false);
    });

    it('invalidates conservatively when the previous version of an edit/delete is unknown', () => {
        expect(changeInvalidatesCheckpoint(null, null, asOf, { oldUnknown: true })).toBe(true);
        expect(changeInvalidatesCheckpoint(null, recent, asOf, { oldUnknown: true })).toBe(true);
    });
});
