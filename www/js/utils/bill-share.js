/**
 * @fileoverview Pure builders for reprinting / sharing a saved bill from
 * History (#136): the printer payload (bill's own date + COPY mark) and the
 * bilingual WhatsApp text. No DOM, Firestore or AppState access.
 * @module utils/bill-share
 */

import { readPayment, readLineItem, round2 } from './money.js';
import { billDateOf } from './history-filters.js';

export const COPY_MARK = 'COPY / प्रति';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * "DD/MM/YYYY hh:mm am" in device local time (IST), the receipt format.
 * @param {Date} date
 * @returns {string}
 */
export function formatReceiptDateTime(date) {
    const h = date.getHours();
    const h12 = h % 12 || 12;
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
        `${pad2(h12)}:${pad2(date.getMinutes())} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * Date/time printed on the slip: the bill's own date, `now` only when the
 * bill has no usable date (e.g. a test print).
 * @param {Object} billData
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function receiptDateTime(billData, now = new Date()) {
    return formatReceiptDateTime(billDateOf(billData) || now);
}

/**
 * History bill type of a stored record.
 * @param {Object} bill
 * @param {string} [type] - explicit type from the caller (wins)
 * @returns {'purchase'|'retail'|'wholesale'}
 */
export function reprintType(bill, type) {
    const t = type || bill?.type;
    if (t === 'retail' || t === 'wholesale' || t === 'purchase') return t;
    return bill?.isPurchase === false ? 'retail' : 'purchase';
}

/**
 * Printer payload for reprinting a saved bill. Never mutates `bill`.
 * @param {Object} bill
 * @param {string} [type]
 * @returns {Object}
 */
export function buildReprintPayload(bill, type) {
    const kind = reprintType(bill, type);
    const pay = readPayment(bill);
    const items = (bill?.items || []).map(item => {
        const line = readLineItem(item);
        return { ...item, name: line.name, qty: line.qty, rate: line.rate, total: line.total };
    });
    const payload = {
        ...bill,
        items,
        type: kind,
        isPurchase: kind === 'purchase',
        isCopy: true,
        payment: { ...(bill?.payment || {}), cash: pay.cash, online: pay.online, due: pay.due },
        dueAmount: pay.due
    };
    if (kind === 'wholesale') {
        const total = round2(bill?.total || bill?.saleTotal || bill?.grandTotal || 0);
        Object.assign(payload, { total, saleTotal: total, grandTotal: total, amountPayable: total });
    }
    return payload;
}

const TITLES = {
    purchase: 'Purchase Bill / खरीद बिल',
    retail: 'Sale Bill / बिक्री बिल',
    wholesale: 'Wholesale Bill / थोक बिल'
};

const money = (n) => `₹${Math.round(Number(n) || 0)}`;

/**
 * Bilingual WhatsApp text for a saved bill, dated with the bill's own date.
 * Internal figures (expenses, profit, who created it) are never included.
 * @param {Object} bill
 * @param {string} [type]
 * @param {{copy?: boolean}} [opts]
 * @returns {string}
 */
export function buildBillShareText(bill, type, { copy = true } = {}) {
    const p = buildReprintPayload(bill, type);
    const kind = p.type;
    const date = billDateOf(bill);
    const lines = [`*${TITLES[kind]}*${copy ? ` (${COPY_MARK})` : ''}`, ''];
    if (p.billNumber) lines.push(`Bill / बिल: #${p.billNumber}`);
    if (date) lines.push(`Date / तारीख: ${formatReceiptDateTime(date)}`);
    if (p.customerName) lines.push(`Customer / ग्राहक: ${p.customerName}`);
    if (p.printComments && String(p.comments || '').trim()) lines.push(`Note / नोट: ${String(p.comments).trim()}`);
    lines.push('', '*Items / सामान:*');
    p.items.forEach(item => {
        lines.push(item.name);
        lines.push(`  ${money(item.rate)} × ${Number(item.qty || 0).toFixed(1)}kg = ${money(item.total)}`);
    });
    lines.push('');

    if (kind === 'purchase') {
        const subtotal = p.billTotal || p.grandTotal || p.amountPayable || p.total || 0;
        const labor = Number(p.laborCharges) || 0;
        const payable = p.amountPayable || p.grandTotal || (subtotal - labor);
        lines.push(`*Total / कुल: ${money(subtotal)}*`);
        if (labor > 0) {
            lines.push(`Labour / मजदूरी: ${money(labor)}`);
            lines.push(`*Payable / देय: ${money(payable)}*`);
        }
    } else {
        lines.push(`*Total / कुल: ${money(p.total || p.saleTotal || p.grandTotal)}*`);
    }
    const paid = p.payment.cash + p.payment.online;
    if (paid > 0) lines.push(`${kind === 'purchase' ? 'Paid / भुगतान' : 'Received / प्राप्त'}: ${money(paid)}`);
    if (p.payment.due > 0) lines.push(`Due / बकाया: ${money(p.payment.due)}`);
    return lines.join('\n');
}
