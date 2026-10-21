/**
 * @fileoverview Existing due of the party on the bill being entered (#166):
 * what the customer already owes us (sales) or what we already owe the
 * supplier (purchases), from the open bills already loaded in AppState.
 * Uses the same party grouping and due math as Outstanding (utils/aging.js),
 * so the number always equals that party's Outstanding total.
 * No DOM or Firestore access.
 * @module utils/party-due
 */

import { buildAging, normalizePartyName } from './aging.js';
import { formatINR } from './due-reminder.js';

/**
 * Open bills that make up the Outstanding list for a billing form.
 * Wholesale dues live on the Wholesale page's Outstanding list (sales-tab bills only).
 * @param {Object} state AppState-like
 * @param {'purchase'|'retail'|'wholesale'} kind
 * @returns {Array<Object>}
 */
export function billsForKind(state, kind) {
    if (kind === 'purchase') return state?.purchaseHistory || [];
    if (kind === 'retail') return state?.retailSalesHistory || [];
    if (kind === 'wholesale') return (state?.salesHistory || []).filter(s => s && s.source === 'sales-tab');
    return [];
}

/**
 * Existing due of one party (exact normalized name match).
 * @param {Array<Object>} bills
 * @param {string} name Name typed on the bill
 * @param {{excludeId?: *, today?: Date}} [opts] excludeId: the bill being edited / retried
 * @returns {?{key: string, total: number, count: number, oldestDays: ?number, bucket: number}}
 *   null when the name is blank or nothing is owed
 */
export function partyDue(bills, name, { excludeId = null, today = new Date() } = {}) {
    const key = normalizePartyName(name);
    if (!key) return null;
    const skip = excludeId === null || excludeId === undefined ? null : String(excludeId);
    const mine = (bills || []).filter(b => b && normalizePartyName(b.customerName) === key
        && (skip === null || String(b.id) !== skip));
    const party = buildAging(mine, { today }).parties.find(p => p.key === key);
    if (!party || !(party.total > 0)) return null;
    return { key, total: party.total, count: party.bills.length, oldestDays: party.oldestDays, bucket: party.bucket };
}

/**
 * Bilingual one-liner for the due under the name field.
 * @param {{total: number, count: number, oldestDays: ?number}} due
 * @param {'purchase'|'retail'|'wholesale'} kind purchase = we owe the supplier
 * @returns {string}
 */
export function partyDueText(due, kind) {
    const amount = formatINR(due.total);
    const n = due.count;
    const bills = `${n} ${n === 1 ? 'bill' : 'bills'}`;
    const d = due.oldestDays;
    const oldest = d === null || d === undefined ? 'date unknown'
        : d === 0 ? 'oldest today' : `oldest ${d} ${d === 1 ? 'day' : 'days'}`;
    const en = `${kind === 'purchase' ? 'We owe' : 'Already owes'} ${amount} on ${bills} (${oldest})`;
    const hi = kind === 'purchase' ? `हमें ${amount} देना है (${n} बिल)` : `पहले से ${amount} बकाया (${n} बिल)`;
    return `${en} / ${hi}`;
}
