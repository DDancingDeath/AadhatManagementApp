/**
 * @fileoverview Money helpers shared by finance/outstanding/reports screens.
 * Bills exist in several schemas:
 *   - payment: { cash, online, due, total }        (current; payment.total may be bill total or amount paid)
 *   - cashPayment / onlinePayment / dueAmount      (top-level, written alongside payment by newer bills)
 *   - amountPaid                                   (legacy, non-online amount paid)
 *   - grandTotal / amountPayable / total / billTotal / saleTotal for the bill total
 * @module utils/money
 */

/**
 * Round to 2 decimals (paise), avoiding 1.005 -> 1.00 style float errors.
 * @param {*} x
 * @returns {number}
 */
export function round2(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parse a stored money value; returns null when absent/unparseable
 * (so an explicit 0 is distinguishable from a missing field).
 * @param {*} v
 * @returns {number|null}
 */
export function toMoney(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

/** First value that is present and numeric (0 counts as present). */
function firstPresent(...values) {
    for (const v of values) {
        const n = toMoney(v);
        if (n !== null) return n;
    }
    return null;
}

/**
 * Sum values (optionally mapped) with paise rounding.
 * @param {Array} items
 * @param {Function} [fn] mapper item -> number
 * @returns {number}
 */
export function sumMoney(items, fn) {
    if (!Array.isArray(items)) return 0;
    let total = 0;
    for (const item of items) {
        total += toMoney(fn ? fn(item) : item) || 0;
    }
    return round2(total);
}

/**
 * Bill total payable/receivable (net of labour for purchases).
 * @param {Object} bill
 * @returns {number}
 */
export function billTotal(bill) {
    if (!bill) return 0;
    return round2(
        toMoney(bill.grandTotal) || toMoney(bill.amountPayable) || toMoney(bill.total) ||
        toMoney(bill.billTotal) || toMoney(bill.saleTotal) || 0
    );
}

/**
 * Normalised payment view of a bill across all known schemas.
 * The payment object wins over top-level fields because outstanding/wholesale
 * payment recording only updates payment.*.
 * @param {Object} bill
 * @returns {{total: number, cash: number, online: number, due: number, paid: number}}
 */
export function readPayment(bill) {
    if (!bill || typeof bill !== 'object') {
        return { total: 0, cash: 0, online: 0, due: 0, paid: 0 };
    }
    const p = bill.payment && typeof bill.payment === 'object' ? bill.payment : {};
    const total = billTotal(bill);
    const cash = firstPresent(p.cash, bill.cashPayment, bill.amountPaid);
    const online = firstPresent(p.online, bill.onlinePayment);
    const paid = round2((cash || 0) + (online || 0));

    let due = firstPresent(p.due, bill.dueAmount, bill.due);
    if (due === null) {
        // Legacy docs with only amountPaid/cash/online: derive due from total.
        due = (cash !== null || online !== null) ? Math.max(0, total - paid) : 0;
    }

    return {
        total,
        cash: round2(cash || 0),
        online: round2(online || 0),
        due: round2(due),
        paid
    };
}

/**
 * Outstanding amount still owed on a bill (0 when cleared or overpaid).
 * @param {Object} bill
 * @returns {number}
 */
export function outstandingDue(bill) {
    if (!bill || bill.cleared) return 0;
    const due = readPayment(bill).due;
    return due > 0 ? due : 0;
}
