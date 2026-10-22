/**
 * TIP Health page maths and the auto-bug planner (#217).
 */
import { aggregateHealth, belowTarget, passRate, percentileFromBuckets, lastDays } from '../tip/health-stats.js';

const lib = require('../../../tools/tip/autobugs-lib.js');

const doc = (deviceId, day, tests, ver = '1_6_0') => ({ deviceId, day, platform: 'web', appVersion: ver.replace(/_/g, '.'), v: { [ver]: tests } });

describe('Health page aggregation', () => {
    const docs = [
        doc('dev1', '20261023', { BillSave: { n: { s: 8, f: 2, x: 3 }, r: { f1: 2, w4: 1 }, d: { b0: 5, b1: 4, b6: 1 } } }),
        doc('dev2', '20261023', { BillSave: { n: { s: 10 }, d: { b0: 10 } }, AppStart: { n: { s: 1, a: 1 }, r: { a16385: 1 } } }),
        doc('dev1', '20261022', { BillSave: { n: { s: 5 } } }, '1_5_2')
    ];

    it('pass rate excludes ignore/discard; per day and per version', () => {
        expect(passRate({ s: 8, w: 1, f: 1, x: 50, i: 3 })).toBe(90);
        expect(passRate({ x: 2 })).toBeNull();
        const agg = aggregateHealth(docs);
        expect(passRate(agg.byTestDay.BillSave['20261023'])).toBe(90);
        expect(passRate(agg.byTestVersion.BillSave['1_5_2'])).toBe(100);
        expect(agg.devicesByTest.BillSave).toEqual({ total: 2, failing: 1 });
        expect(agg.devices[0]).toMatchObject({ deviceId: 'dev1', failed: 2, lastDay: '20261023', appVersion: '1.6.0' });
    });

    it('top failure reasons use reason names and skip warnings', () => {
        const agg = aggregateHealth(docs, { reasonsByTest: { BillSave: { totals_mismatch: 1, blocked_valid_bill: 4 } } });
        expect(agg.reasons).toEqual([
            { test: 'BillSave', code: 1, name: 'totals_mismatch', count: 2 },
            { test: 'AppStart', code: 16385, name: 'abandoned', count: 1 }
        ]);
    });

    it('p50/p90 from duration buckets', () => {
        expect(percentileFromBuckets({ b0: 5, b1: 4, b6: 1 }, 50)).toBe(250);
        expect(percentileFromBuckets({ b0: 5, b1: 4, b6: 1 }, 90)).toBe(500);
        expect(percentileFromBuckets({ b0: 5, b1: 4, b6: 1 }, 100)).toBe(30000);
        expect(percentileFromBuckets({}, 50)).toBeNull();
    });

    it('Today banner: below target with enough runs only', () => {
        const low = belowTarget(docs, { day: '20261023', targets: { BillSave: 98 } });
        expect(low).toEqual([{ test: 'BillSave', rate: 90, target: 98, runs: 20 }]);
        expect(belowTarget(docs, { day: '20261023', targets: { BillSave: 90 } })).toEqual([]);
        expect(lastDays('20261101', 3)).toEqual(['20261101', '20261031', '20261030']);
    });
});

describe('Auto bug planner (tools/tip/autobugs-lib.js)', () => {
    const today = '20261023';
    const failing = (day, count, extra = {}) => doc('devA', day, { BillSave: { n: { s: 20, f: count }, r: { [`f1`]: count } } }, extra.ver);
    const samples = [{ test: 'BillSave', reason: 1, reasonName: 'totals_mismatch', appVersion: '1.6.0', result: 'fail', at: 1, flags: { offline: false }, props: { lines: 2 } }];

    it('hash is stable per test + reason + version', () => {
        expect(lib.failureHash('BillSave', 1, '1_6_0')).toBe(lib.failureHash('BillSave', 1, '1_6_0'));
        expect(lib.failureHash('BillSave', 1, '1_6_0')).not.toBe(lib.failureHash('BillSave', 1, '1_6_1'));
        expect(lib.hashFromBody(`x\n${lib.marker('abc123')}\ny`)).toBe('abc123');
    });

    it('creates one deduplicated issue for a top failure, with the agreed title', () => {
        const actions = lib.planIssues({ docs: [failing('20261023', 3), failing('20261022', 2)], samples, issues: [], today });
        const create = actions.filter(a => a.action === 'create');
        expect(create).toHaveLength(1);
        expect(create[0].title).toBe('[Bug] TIP: BillSave failing: totals_mismatch (1.6.0)');
        expect(create[0].body).toContain(lib.marker(lib.failureHash('BillSave', 1, '1_6_0')));
        expect(create[0].body).toContain('"lines":2');
    });

    it('updates an open issue, reopens a closed one, ignores tiny counts', () => {
        const hash = lib.failureHash('BillSave', 1, '1_6_0');
        const open = [{ number: 7, state: 'open', title: 't', body: lib.marker(hash) }];
        expect(lib.planIssues({ docs: [failing(today, 5)], samples, issues: open, today })[0]).toMatchObject({ action: 'update', number: 7 });
        const closed = [{ number: 7, state: 'closed', title: 't', body: lib.marker(hash) }];
        expect(lib.planIssues({ docs: [failing(today, 5)], samples, issues: closed, today })[0]).toMatchObject({ action: 'reopen', number: 7 });
        expect(lib.planIssues({ docs: [failing(today, 2)], samples, issues: [], today })).toEqual([]);
    });

    it('closes an open issue after 7 days without that failure, not before', () => {
        const hash = lib.failureHash('BillSave', 1, '1_6_0');
        const open = [{ number: 9, state: 'open', title: 't', body: lib.marker(hash) }];
        expect(lib.planIssues({ docs: [failing('20261018', 1)], samples, issues: open, today })).toEqual([]);
        expect(lib.planIssues({ docs: [failing('20261015', 4)], samples, issues: open, today }))
            .toEqual([expect.objectContaining({ action: 'close', number: 9 })]);
    });

    it('spike: recent failure rate ≥ 2× baseline and +10 points', () => {
        const base = ['20261020', '20261019', '20261018'].map(d => doc('devA', d, { CashClose: { n: { s: 19, f: 1 } } }));
        const recent = [doc('devA', today, { CashClose: { n: { s: 6, f: 4 } } })];
        const spikes = lib.findSpikes([...base, ...recent], { today });
        expect(spikes).toEqual([expect.objectContaining({ test: 'CashClose', recentRate: 40, baselineRate: 5, version: '1_6_0' })]);
        expect(lib.findSpikes([...base, doc('devA', today, { CashClose: { n: { s: 9, f: 1 } } })], { today })).toEqual([]);
        const plan = lib.planIssues({ docs: [...base, ...recent], samples: [], issues: [], today });
        expect(plan.map(a => a.title)).toContain('[Bug] TIP: CashClose failing: spike 40% (1.6.0)');
    });

    it('recognises Firestore PERMISSION_DENIED (IAM pending, #168)', () => {
        expect(lib.isPermissionDenied({ code: 7, message: '7 PERMISSION_DENIED: Missing or insufficient permissions.' })).toBe(true);
        expect(lib.isPermissionDenied({ code: 14, message: 'UNAVAILABLE' })).toBe(false);
    });
});
