/**
 * @fileoverview Pure cash-session helpers (#66, #69, #101).
 * @module utils/cash-session
 */

import { round2 } from './money.js';
import { parseLocalDate } from './dates.js';

/**
 * Reads a cash amount typed by the user. 0 is a valid amount (empty drawer);
 * empty, negative or non-numeric input returns null.
 * @param {*} raw
 * @returns {number|null}
 */
export function parseCashAmount(raw) {
    if (raw === null || raw === undefined) return null;
    const str = String(raw).trim();
    if (str === '') return null;
    const n = Number(str);
    if (!Number.isFinite(n) || n < 0) return null;
    return round2(n);
}

/**
 * Cash in / out / expected for a session from its saved `transactions`
 * snapshot (or the live totals passed in). Same field names everywhere:
 * cashSales, cashPurchases, businessExpenses, personalExpenses, dueReceived,
 * duePaid, cashDeposits.
 * @param {Object} session
 * @param {Object} [transactions=session.transactions]
 * @returns {{opening: number, cashIn: number, cashOut: number, expected: number}}
 *   cashIn excludes the opening balance; expected = opening + cashIn − cashOut.
 */
export function sessionTotals(session, transactions = session?.transactions) {
    const t = transactions || {};
    const n = (v) => Number(v) || 0;
    const opening = n(session?.openingBalance);
    const cashIn = round2(n(t.cashDeposits) + n(t.cashSales) + n(t.dueReceived));
    const cashOut = round2(n(t.cashPurchases) + n(t.duePaid) + n(t.businessExpenses) + n(t.personalExpenses));
    return { opening, cashIn, cashOut, expected: round2(opening + cashIn - cashOut) };
}

/**
 * A closed session whose cash was never counted: auto-closed by the app
 * (`counted: false`), or auto-closed by an older app version that stored a
 * fake ₹0 count (`autoSignedOut` without a later count).
 * @param {Object} session
 * @returns {boolean}
 */
export function isNotCounted(session) {
    if (!session || !session.signedOut) return false;
    if (session.counted === false) return true;
    return session.counted === undefined && session.autoSignedOut === true;
}

/**
 * The most recent closed session with a real count, or null.
 * @param {Object[]} sessions
 * @returns {?Object}
 */
export function lastCountedSession(sessions) {
    const closed = (sessions || [])
        .filter(s => s && s.signedOut && !isNotCounted(s) && Number.isFinite(Number(s.closingBalance)) && s.closingBalance !== null)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.signOutTime || '').localeCompare(String(a.signOutTime || '')));
    return closed[0] || null;
}

/**
 * Fields written when the app closes a session nobody closed (#101): the
 * expected balance is kept, but nothing was counted, so there is no closing
 * balance and no difference (no fake shortage).
 * @param {Object} session Fresh session data (needs `date`, `openingBalance`)
 * @param {Object} transactions Totals for that day
 * @returns {Object}
 */
export function autoCloseFields(session, transactions) {
    const { expected } = sessionTotals(session, transactions);
    const day = parseLocalDate(session.date);
    const endOfDay = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59) : new Date();
    return {
        closingBalance: null,
        expectedBalance: expected,
        difference: null,
        counted: false,
        signOutTime: endOfDay.toISOString(),
        signedOut: true,
        autoSignedOut: true,
        autoClosed: true,
        autoSignOutReason: 'Session not closed by end of day',
        transactions: { ...transactions }
    };
}
