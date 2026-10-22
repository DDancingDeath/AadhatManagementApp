/**
 * TIP scenarios (#217): each reports success on the happy path and the right
 * reason on its known failures.
 */
import { createTip, dayKeyOf } from '../tip/tip.js';
import { AppStartTest, APP_START_FAIL_MS } from '../tip/scenarios/app-start.js';
import { BillSaveTest, billSaveProps } from '../tip/scenarios/bill-save.js';
import { PaymentRecordTest, paymentRecordProps, paymentErrorOutcome } from '../tip/scenarios/payment-record.js';
import { CashCloseTest, cashCloseProps } from '../tip/scenarios/cash-close.js';

const T0 = new Date(2026, 9, 23, 11, 0, 0).getTime();

function harness({ online = true } = {}) {
    let now = T0;
    const tip = createTip({ now: () => now, isOnline: () => online, appVersion: '1.6.0' });
    [AppStartTest, BillSaveTest, PaymentRecordTest, CashCloseTest].forEach(d => tip.declareTest(d));
    const outcome = (test) => {
        const c = tip.takeDelta()[dayKeyOf(now)]['1_6_0'][test];
        return { result: Object.keys(c.n)[0], reason: c.r ? Number(Object.keys(c.r)[0].replace(/^[a-z]+/, '')) : 0 };
    };
    return { tip, outcome, advance: (ms) => { now += ms; } };
}

describe('AppStart', () => {
    it('succeeds when the app shows quickly', () => {
        const h = harness();
        const run = h.tip.start('AppStart');
        h.advance(2000);
        run.complete();
        expect(h.outcome('AppStart')).toEqual({ result: 's', reason: 0 });
    });

    it('fails slow_start above the limit and load_failed when data did not load (online)', () => {
        const h = harness();
        const slow = h.tip.start('AppStart');
        h.advance(APP_START_FAIL_MS + 1);
        slow.complete();
        expect(h.outcome('AppStart')).toEqual({ result: 'f', reason: AppStartTest.reasons.slow_start });
        h.tip.start('AppStart').complete({ loadFailed: true });
        expect(h.outcome('AppStart')).toEqual({ result: 'f', reason: AppStartTest.reasons.load_failed });
    });

    it('is discarded when no app screen is expected (pending / outdated)', () => {
        const h = harness();
        const run = h.tip.start('AppStart');
        run.setFlag('blocked');
        run.complete();
        expect(h.outcome('AppStart').result).toBe('x');
    });
});

describe('BillSave', () => {
    const bill = (extra = {}) => ({
        items: [{ total: 1000 }, { total: 500 }], grandTotal: 1500,
        payment: { cash: 1000, online: 0, due: 500 }, customerName: 'Ramesh', ...extra
    });

    it('props carry no party name; happy path succeeds', () => {
        const props = billSaveProps('retailSales', bill(), T0);
        expect(props).toEqual({ kind: 'retailSales', lines: 2, total100: 1500, totalsOk: true, overridden: false });
        const h = harness();
        h.tip.start('BillSave', { props }).complete();
        expect(h.outcome('BillSave')).toEqual({ result: 's', reason: 0 });
    });

    it('totals_mismatch when cash + online + due ≠ total', () => {
        const h = harness();
        h.tip.start('BillSave', { props: billSaveProps('purchases', bill({ payment: { cash: 1000, online: 0, due: 0 } }), T0) }).complete();
        expect(h.outcome('BillSave')).toEqual({ result: 'f', reason: BillSaveTest.reasons.totals_mismatch });
    });

    it('write_rejected when the server refuses the write', () => {
        const h = harness();
        h.tip.start('BillSave', { props: billSaveProps('purchases', bill(), T0) }).completeAndFail('write_rejected', { code: 'permission-denied' });
        expect(h.outcome('BillSave')).toEqual({ result: 'f', reason: BillSaveTest.reasons.write_rejected });
    });

    it('blocked_valid_bill (warn) when the owner overrode a block for this bill', () => {
        const h = harness();
        const props = billSaveProps('wholesaleSales', bill({ overrides: [{ rule: 'oversell', at: T0 - 1000 }] }), T0);
        expect(props.overridden).toBe(true);
        expect(billSaveProps('wholesaleSales', bill({ overrides: [{ rule: 'oversell', at: T0 - 86400000 }] }), T0).overridden).toBe(false);
        h.tip.start('BillSave', { props }).complete();
        expect(h.outcome('BillSave')).toEqual({ result: 'w', reason: BillSaveTest.reasons.blocked_valid_bill });
    });

    it('not acknowledged online → fail; offline save → discarded', () => {
        const online = harness();
        online.tip.start('BillSave', { props: billSaveProps('purchases', bill(), T0) });
        online.advance(BillSaveTest.timeoutMs + 1);
        online.tip.sweep();
        expect(online.outcome('BillSave')).toEqual({ result: 'f', reason: BillSaveTest.reasons.not_acknowledged });
        const offline = harness({ online: false });
        offline.tip.start('BillSave', { flags: { offline: true }, props: billSaveProps('purchases', bill(), T0) });
        offline.advance(BillSaveTest.timeoutMs + 1);
        offline.tip.sweep();
        expect(offline.outcome('BillSave').result).toBe('x');
    });
});

describe('PaymentRecord', () => {
    const fresh = { grandTotal: 1000, payment: { cash: 0, online: 0, due: 1000 } };
    const written = { payment: { cash: 400, online: 0, due: 600, total: 400 } };

    it('succeeds when the bill adds up and the open drawer got the leg', () => {
        const h = harness();
        h.tip.start('PaymentRecord').complete(paymentRecordProps(fresh, written, { sessionOpen: true, legWritten: true }));
        expect(h.outcome('PaymentRecord')).toEqual({ result: 's', reason: 0 });
    });

    it('cash_leg_missing when the session was open but no leg was written (#201)', () => {
        const h = harness();
        h.tip.start('PaymentRecord').complete(paymentRecordProps(fresh, written, { sessionOpen: true, legWritten: false }));
        expect(h.outcome('PaymentRecord')).toEqual({ result: 'f', reason: PaymentRecordTest.reasons.cash_leg_missing });
    });

    it('totals_mismatch, bill_missing, and a retried payment is ignored', () => {
        const h = harness();
        h.tip.start('PaymentRecord').complete(paymentRecordProps(fresh, { payment: { cash: 400, online: 0, due: 900 } }, {}));
        expect(h.outcome('PaymentRecord')).toEqual({ result: 'f', reason: PaymentRecordTest.reasons.totals_mismatch });
        h.tip.start('PaymentRecord').complete(paymentRecordProps(null, null, {}));
        expect(h.outcome('PaymentRecord')).toEqual({ result: 'f', reason: PaymentRecordTest.reasons.bill_missing });
        h.tip.start('PaymentRecord').complete(paymentRecordProps(fresh, written, { retried: true }));
        expect(h.outcome('PaymentRecord').result).toBe('i');
    });

    it('errors: offline / over-due are not app failures', () => {
        expect(paymentErrorOutcome({ code: 'unavailable' }, false)).toBe('discard');
        expect(paymentErrorOutcome({}, true)).toBe('discard');
        expect(paymentErrorOutcome({ code: 'exceeds-due' }, false)).toBe('ignore');
        expect(paymentErrorOutcome({ code: 'permission-denied' }, false)).toBe('fail');
    });
});

describe('CashClose', () => {
    const session = { id: 's1', duePayments: [{}, {}] };

    it('succeeds for a normal close and warns on a large difference', () => {
        const h = harness();
        h.tip.start('CashClose', { props: cashCloseProps({ session, expected: 5000, counted: 4990, difference: -10 }) }).complete();
        expect(h.outcome('CashClose')).toEqual({ result: 's', reason: 0 });
        h.tip.start('CashClose', { props: cashCloseProps({ session, expected: 5000, counted: 2000, difference: -3000 }) }).complete();
        expect(h.outcome('CashClose')).toEqual({ result: 'w', reason: CashCloseTest.reasons.large_difference });
    });

    it('fails on a negative or non-number expected cash and a wrong difference', () => {
        const h = harness();
        h.tip.start('CashClose', { props: cashCloseProps({ session, expected: -50, counted: 0, difference: 50 }) }).complete();
        expect(h.outcome('CashClose')).toEqual({ result: 'f', reason: CashCloseTest.reasons.negative_expected });
        h.tip.start('CashClose', { props: cashCloseProps({ session, expected: NaN, counted: 0, difference: 0 }) }).complete();
        expect(h.outcome('CashClose')).toEqual({ result: 'f', reason: CashCloseTest.reasons.expected_not_number });
        h.tip.start('CashClose', { props: cashCloseProps({ session, expected: 100, counted: 100, difference: 5 }) }).complete();
        expect(h.outcome('CashClose')).toEqual({ result: 'f', reason: CashCloseTest.reasons.difference_mismatch });
        h.tip.start('CashClose', { props: cashCloseProps({ session: null }) }).complete();
        expect(h.outcome('CashClose')).toEqual({ result: 'f', reason: CashCloseTest.reasons.no_session });
    });

    it('write_failed when the save errors', () => {
        const h = harness();
        h.tip.start('CashClose', { props: cashCloseProps({ session, expected: 1, counted: 1, difference: 0 }) }).completeAndFail('write_failed');
        expect(h.outcome('CashClose')).toEqual({ result: 'f', reason: CashCloseTest.reasons.write_failed });
    });
});
