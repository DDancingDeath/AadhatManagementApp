/**
 * @fileoverview TIP scenario CashClose (#217): closing the drawer saves a
 * count whose expected cash is a real, non-negative number and whose
 * difference equals counted − expected. Instrumented in
 * CashManagementManager.signOut. Reason codes are stable.
 * @module tip/scenarios/cash-close
 */

import { round2 } from '../../utils/money.js';

/** Bigger drawer differences are reported as a warning (not an app bug). */
export const CASH_CLOSE_WARN_DIFF = 1000;

export const CashCloseTest = {
    id: 'CashClose',
    reasons: { negative_expected: 1, expected_not_number: 2, write_failed: 3, no_session: 4, large_difference: 5, difference_mismatch: 6 },
    timeoutMs: 5 * 60 * 1000,
    target: 98,
    evaluate(props, flags, ctx) {
        if (props.noSession) return { result: 'fail', reason: 'no_session' };
        if (props.expectedIsNumber === false) return { result: 'fail', reason: 'expected_not_number' };
        if (props.differenceOk === false) return { result: 'fail', reason: 'difference_mismatch' };
        if (props.expectedNegative) return { result: 'fail', reason: 'negative_expected' };
        if (ctx.expired) return ctx.online ? { result: 'fail', reason: 'write_failed' } : 'discard';
        if (props.largeDifference) return { result: 'warn', reason: 'large_difference' };
        return 'succeed';
    }
};

/**
 * PII-free properties of the close: no amounts, only whether they add up.
 * @param {{session: Object|null, expected: number, counted: number, difference: number}} args
 * @returns {Object}
 */
export function cashCloseProps({ session, expected, counted, difference }) {
    if (!session) return { noSession: true };
    const isNum = typeof expected === 'number' && Number.isFinite(expected);
    return {
        noSession: false,
        expectedIsNumber: isNum,
        expectedNegative: isNum && expected < 0,
        differenceOk: isNum && Math.abs(round2(counted - expected) - difference) <= 0.01,
        largeDifference: isNum && Math.abs(difference) > CASH_CLOSE_WARN_DIFF,
        dueLegs: Array.isArray(session.duePayments) ? session.duePayments.length : 0
    };
}
