import {
    addBillToAcc, aggregateBills, billMonth, createCatalogueResolver, estimateBackfillReads, explainOutlook,
    finalizeStats, istMonthKey, lineKg, monthSeries, newCursor, parseCursor, planRollForward, rollForwardFromMonth,
    runBackfillReads, seasonalOutlook, trendRows, yearOverlay, addMonths, istMonthStartMs, itemsByUsage
} from '../utils/rate-trends.js';

const items = [
    { id: 'wheat', name: 'Wheat', hindiName: 'गेहूं' },
    { id: 'rice', name: 'Rice', hindiName: 'चावल' }
];
// 2026-10-15 10:00 IST
const OCT15 = Date.UTC(2026, 9, 15, 4, 30);

describe('IST months', () => {
    test('a bill just after midnight IST on the 1st belongs to the new month (UTC says the previous one)', () => {
        const t = Date.UTC(2026, 9, 31, 18, 45); // 2026-11-01 00:15 IST
        expect(istMonthKey(t)).toBe('2026-11');
        expect(billMonth({ timestamp: t })).toBe('2026-11');
    });

    test('month helpers', () => {
        expect(addMonths('2026-01', -1)).toBe('2025-12');
        expect(addMonths('2026-11', 14)).toBe('2028-01');
        expect(istMonthKey(istMonthStartMs('2026-03'))).toBe('2026-03');
        expect(istMonthKey(istMonthStartMs('2026-03') - 1)).toBe('2026-02');
    });

    test('legacy bills: en-IN locale date string without timestamp, Firestore Timestamp, unparseable', () => {
        expect(billMonth({ date: '05/03/2025, 2:15:00 pm' })).toBe('2025-03');
        expect(billMonth({ timestamp: { toMillis: () => OCT15 } })).toBe('2026-10');
        expect(billMonth({ date: 'yesterday' })).toBeNull();
    });
});

describe('aggregation', () => {
    test('kg-weighted average, min/max, bills; wholesale reads `quantity`; Hindi line names map by itemId', () => {
        const acc = aggregateBills({
            purchase: [
                { id: 'p1', timestamp: OCT15, items: [{ itemId: 'wheat', name: 'गेहूं', rate: 20, qty: 100, total: 2000 }] },
                { id: 'p2', timestamp: OCT15 + 1000, items: [{ itemId: 'wheat', name: 'Wheat', rate: 30, qty: 300, total: 9000 }] }
            ],
            retail: [{ id: 'r1', timestamp: OCT15, items: [{ itemId: 'wheat', name: 'गेहूं', rate: 35, qty: 10 }] }],
            wholesale: [{ id: 'w1', date: '15/10/2026, 11:00:00 am', timestamp: OCT15, items: [{ itemId: 'wheat', name: 'Wheat', rate: 32, quantity: 50 }] }]
        }, items);
        const doc = finalizeStats(acc)['wheat_2026-10'];
        // (20×100 + 30×300) / 400 = 27.5, not the simple mean 25
        expect(doc.purchase).toEqual({ kg: 400, amount: 11000, min: 20, max: 30, avg: 27.5, bills: 2 });
        expect(doc.wholesale).toEqual({ kg: 50, amount: 1600, min: 32, max: 32, avg: 32, bills: 1 });
        expect(doc.retail.avg).toBe(35);
        expect(doc.bills).toBe(4);
    });

    test('legacy lines: no itemId (matched by English or Hindi name), rate from total, junk skipped', () => {
        const acc = {};
        const resolve = createCatalogueResolver(items);
        addBillToAcc(acc, {
            timestamp: OCT15,
            items: [
                { name: 'चावल', qty: '20', total: 600 },       // rate = 30 from total / kg
                { name: 'Rice', rate: 40, qty: 20 },
                { name: 'Rice', rate: 40, qty: 20 },          // same bill: counted once
                { name: 'Unknown', rate: 50, qty: 5 },
                { itemId: 'rice', rate: 0, qty: 5 },
                { itemId: 'rice', rate: 10, qty: 0 },
                null
            ]
        }, 'purchase', resolve);
        const doc = finalizeStats(acc)['rice_2026-10'];
        expect(doc.purchase).toEqual({ kg: 60, amount: 2200, min: 30, max: 40, avg: 36.67, bills: 1 });
        expect(Object.keys(acc)).toEqual(['rice_2026-10']);
        expect(lineKg({ qty: '', quantity: 7 })).toBe(7);
    });

    test('kinds without lines get empty sections', () => {
        const doc = finalizeStats(aggregateBills({ purchase: [{ timestamp: OCT15, items: [{ itemId: 'rice', rate: 30, qty: 1 }] }] }, items))['rice_2026-10'];
        expect(doc.retail).toEqual({ kg: 0, amount: 0, min: null, max: null, avg: 0, bills: 0 });
    });

    test('items by usage: most used first', () => {
        const order = itemsByUsage(items, { purchase: [{ items: [{ itemId: 'rice' }, { itemId: 'rice' }, { itemId: 'wheat' }] }] });
        expect(order.map(o => o.item.id)).toEqual(['rice', 'wheat']);
    });
});

describe('roll-forward', () => {
    test('covered months start at the loaded window when it begins on an IST month start', () => {
        expect(rollForwardFromMonth(istMonthStartMs('2026-09'), OCT15)).toBe('2026-09');
        expect(rollForwardFromMonth(istMonthStartMs('2026-09') + 5, OCT15)).toBe('2026-10');
        expect(rollForwardFromMonth(0, OCT15)).toBe('2026-09');
    });

    test('writes only changed or emptied month docs', () => {
        const computed = finalizeStats(aggregateBills({
            purchase: [
                { timestamp: OCT15, items: [{ itemId: 'wheat', rate: 25, qty: 10 }, { itemId: 'rice', rate: 40, qty: 5 }] }
            ]
        }, items));
        const stored = [
            { id: 'wheat_2026-10', ...computed['wheat_2026-10'], updatedAt: 1 },
            { id: 'rice_2026-10', ...computed['rice_2026-10'], purchase: { ...computed['rice_2026-10'].purchase, kg: 4 } },
            { id: 'wheat_2026-09', itemId: 'wheat', month: '2026-09', bills: 1, purchase: { kg: 5, amount: 100, min: 20, max: 20, avg: 20, bills: 1 } },
            { id: 'wheat_2026-08', itemId: 'wheat', month: '2026-08', bills: 3 }
        ];
        const writes = planRollForward(computed, stored, '2026-09');
        expect(writes.map(w => w.id)).toEqual(['rice_2026-10', 'wheat_2026-09']);
        expect(writes[1].data.bills).toBe(0);
        expect(writes[1].data.purchase.kg).toBe(0);
    });
});

describe('backfill cursor', () => {
    const bills = {
        purchases: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, timestamp: OCT15, items: [{ itemId: 'wheat', rate: 20 + i, qty: 10 }] })),
        retailSales: [{ id: 'r0', timestamp: OCT15, items: [{ itemId: 'wheat', rate: 30, qty: 1 }] }],
        wholesaleSales: []
    };
    const fetchFrom = (failAt = null) => {
        let calls = 0;
        return async (coll, after, limit) => {
            calls++;
            if (failAt && calls === failAt) {
                const e = new Error('Quota exceeded.');
                e.code = 'resource-exhausted';
                throw e;
            }
            const all = bills[coll];
            const start = after ? all.findIndex(b => b.id === after) + 1 : 0;
            const docs = all.slice(start, start + limit);
            return { docs, reads: Math.max(1, docs.length) };
        };
    };
    const quota = (e) => e?.code === 'resource-exhausted';

    test('stops on a quota error and resumes from the stored cursor with the same result as one run', async () => {
        let stored = null;
        const saveCursor = (c) => { stored = JSON.stringify(c); };
        const cursor = newCursor(OCT15);
        const first = await runBackfillReads({ cursor, items, pageSize: 2, fetchPage: fetchFrom(2), saveCursor, isQuotaError: quota, now: () => OCT15 });
        expect(first.status).toBe('quota');
        const resumed = parseCursor(stored);
        expect(resumed.after).toBe('p1');
        expect(resumed.bills).toBe(2);

        const second = await runBackfillReads({ cursor: resumed, items, pageSize: 2, fetchPage: fetchFrom(), saveCursor, isQuotaError: quota, now: () => OCT15 });
        expect(second.status).toBe('read-done');
        expect(resumed.phase).toBe('write');

        const once = newCursor(OCT15);
        await runBackfillReads({ cursor: once, items, pageSize: 2, fetchPage: fetchFrom(), saveCursor: () => {}, isQuotaError: quota, now: () => OCT15 });
        expect(finalizeStats(resumed.acc)).toEqual(finalizeStats(once.acc));
        expect(finalizeStats(once.acc)['wheat_2026-10'].purchase.avg).toBe(22);
        expect(resumed.bills).toBe(6);
    });

    test('stops at the daily read budget and continues the next IST day', async () => {
        const cursor = newCursor(OCT15);
        let now = OCT15;
        const r1 = await runBackfillReads({ cursor, items, pageSize: 2, budget: 3, fetchPage: fetchFrom(), saveCursor: () => {}, isQuotaError: quota, now: () => now });
        expect(r1.status).toBe('budget');
        expect(cursor.readsToday).toBe(3);
        const r2 = await runBackfillReads({ cursor, items, pageSize: 2, budget: 3, fetchPage: fetchFrom(), saveCursor: () => {}, isQuotaError: quota, now: () => now });
        expect(r2.status).toBe('budget');
        now = OCT15 + 86400000;
        let r = r2;
        for (let day = 2; r.status !== 'read-done' && day < 10; day++) {
            r = await runBackfillReads({ cursor, items, pageSize: 2, budget: 3, fetchPage: fetchFrom(), saveCursor: () => {}, isQuotaError: quota, now: () => now });
            now += 86400000;
        }
        expect(r.status).toBe('read-done');
        expect(cursor.bills).toBe(6);
    });

    test('a corrupt or old cursor is ignored', () => {
        expect(parseCursor('{bad')).toBeNull();
        expect(parseCursor(JSON.stringify({ v: 0, phase: 'read', acc: {} }))).toBeNull();
    });

    test('read estimate extrapolates the loaded window back to the oldest bill', () => {
        const day = 86400000;
        const now = OCT15;
        expect(estimateBackfillReads({ loadedBills: 300, loadedFrom: now - 30 * day, oldest: now - 900 * day, now })).toBe(9003);
        expect(estimateBackfillReads({ loadedBills: 300, loadedFrom: 0, oldest: 0, now })).toBe(303);
    });
});

describe('seasonal estimate', () => {
    const doc = (month, purchase) => ({ month, purchase: { kg: 100, amount: purchase * 100 }, retail: { kg: 50, amount: (purchase + 5) * 50 } });
    // October → November change in past years; "now" = mid-Oct 2026, 4 weeks ahead ends in November.
    const docs = [doc('2023-10', 20), doc('2023-11', 21), doc('2024-10', 22), doc('2024-11', 22.66), doc('2025-10', 24), doc('2025-11', 25.2)];

    test('UP with high confidence when 3 years agree', () => {
        const o = seasonalOutlook(monthSeries(docs, 'purchase'), { now: OCT15, weeks: 4 });
        expect(o.status).toBe('ok');
        expect(o.fromMonth).toBe('2026-10');
        expect(o.toMonth).toBe('2026-11');
        expect(o.perYear.map(y => y.pct)).toEqual([5, 3, 5]);
        expect(o.direction).toBe('up');
        expect(o.pct).toBe(4.33);
        expect(o.confidence).toBe('high');
        expect(explainOutlook(o).en).toMatch(/UP about 4%; 3 of 3 years agree/);
    });

    test('mixed years lower the confidence; small changes are "about the same"', () => {
        const mixed = monthSeries([doc('2024-10', 20), doc('2024-11', 22), doc('2025-10', 20), doc('2025-11', 19)], 'purchase');
        const o = seasonalOutlook(mixed, { now: OCT15, weeks: 4 });
        expect(o.direction).toBe('up');
        expect(o.confidence).toBe('low');
        const flat = seasonalOutlook(monthSeries([doc('2024-10', 20), doc('2024-11', 20.2), doc('2025-10', 20), doc('2025-11', 19.9)], 'purchase'), { now: OCT15 });
        expect(flat.direction).toBe('flat');
        expect(flat.confidence).toBe('medium');
    });

    test('not enough history with fewer than 2 seasons', () => {
        const o = seasonalOutlook(monthSeries([doc('2025-10', 20), doc('2025-11', 22), doc('2024-10', 20)], 'purchase'), { now: OCT15 });
        expect(o.status).toBe('not-enough');
        expect(o.seasons).toBe(1);
        expect(explainOutlook(o).en).toMatch(/Not enough history/);
    });

    test('8 weeks ahead from late November compares with January across the year end', () => {
        const nov25 = Date.UTC(2026, 10, 25, 6);
        const s = monthSeries([doc('2024-11', 20), doc('2025-01', 22), doc('2025-11', 20), doc('2026-01', 23)], 'purchase');
        const o = seasonalOutlook(s, { now: nov25, weeks: 8 });
        expect(o.toMonth).toBe('2027-01');
        expect(o.perYear.map(y => y.pct)).toEqual([15, 10]);
    });

    test('sale series is kg-weighted across retail and wholesale; table rows carry margin per kg', () => {
        const d = { month: '2026-10', purchase: { kg: 100, amount: 2000 }, retail: { kg: 10, amount: 300 }, wholesale: { kg: 90, amount: 2250 }, bills: 3 };
        expect(monthSeries([d], 'sale')['2026-10']).toBe(25.5);
        const [row] = trendRows([d]);
        expect(row.margin).toBe(5.5);
        expect(row.kgSold).toBe(100);
        expect(yearOverlay({ '2026-10': 20 }, [2026])[2026][9]).toBe(20);
    });
});
