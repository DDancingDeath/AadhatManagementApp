/**
 * @fileoverview Pure helpers for the History screen filters (#160):
 * bill type (All / Purchase / Retail / Wholesale), date-range presets in
 * local (IST) time, search, and the filter remembered for the session.
 * Nothing here touches the DOM, Firestore or AppState.
 * @module utils/history-filters
 */

import { toJsDate, parseLocalDate, toLocalISODate } from './dates.js';

export const HISTORY_TYPES = ['all', 'purchase', 'retail', 'wholesale'];
export const HISTORY_PRESETS = ['all', 'today', 'yesterday', 'week', 'month', 'lastMonth', 'custom'];

export const HISTORY_TYPE_LABELS = {
    all: 'All / सभी',
    purchase: 'Purchase / खरीद',
    retail: 'Retail / खुदरा',
    wholesale: 'Wholesale / थोक'
};

export const HISTORY_PRESET_LABELS = {
    all: 'All dates / सभी तारीख',
    today: 'Today / आज',
    yesterday: 'Yesterday / कल',
    week: 'This week / इस हफ्ते',
    month: 'This month / इस महीने',
    lastMonth: 'Last month / पिछला महीना',
    custom: 'Custom / चुनें'
};

export const DEFAULT_HISTORY_FILTER = Object.freeze({ type: 'all', preset: 'all', from: '', to: '' });

/** sessionStorage key for the last History filter. */
export const HISTORY_FILTER_KEY = 'aadhat.historyFilter';

/**
 * Bill date as a Date: numeric/Firestore `timestamp` first (what the history
 * window queries on), then `date` (ISO or legacy DD/MM/YYYY), then `createdAt`.
 * @param {Object} bill
 * @returns {Date|null}
 */
export function billDateOf(bill) {
    if (!bill || typeof bill !== 'object') return null;
    for (const value of [bill.timestamp, bill.date, bill.createdAt]) {
        const d = toJsDate(value);
        if (d) return d;
    }
    return null;
}

/**
 * @param {Object} bill
 * @returns {number|null} ms epoch, or null when the bill has no usable date
 */
export function billTimeMs(bill) {
    const d = billDateOf(bill);
    return d ? d.getTime() : null;
}

/**
 * Does a (type-tagged) history bill match the type filter?
 * 'sale' is the old Sale tab (retail + wholesale) and still accepted.
 * @param {{type?: string, isPurchase?: boolean}} bill
 * @param {string} type
 * @returns {boolean}
 */
export function matchesHistoryType(bill, type) {
    if (!bill) return false;
    const billType = bill.type || (bill.isPurchase ? 'purchase' : '');
    switch (type) {
        case 'purchase': return billType === 'purchase';
        case 'retail': return billType === 'retail';
        case 'wholesale': return billType === 'wholesale';
        case 'sale': return billType === 'retail' || billType === 'wholesale';
        default: return true;
    }
}

const dayStart = (d, offsetDays = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays);

/**
 * Resolve a date preset to a half-open local-time range [from, to).
 * Weeks start on Monday. Custom dates are 'YYYY-MM-DD' (inclusive), either
 * side may be empty (open-ended) and reversed dates are swapped.
 * @param {string} preset
 * @param {Date} [now=new Date()]
 * @param {{from?: string, to?: string}} [custom]
 * @returns {{from: number|null, to: number|null}} ms epoch; null = unbounded
 */
export function resolveHistoryRange(preset, now = new Date(), custom = {}) {
    const today = dayStart(now);
    switch (preset) {
        case 'today':
            return { from: today.getTime(), to: dayStart(now, 1).getTime() };
        case 'yesterday':
            return { from: dayStart(now, -1).getTime(), to: today.getTime() };
        case 'week': {
            const sinceMonday = (today.getDay() + 6) % 7;
            return { from: dayStart(now, -sinceMonday).getTime(), to: dayStart(now, 1).getTime() };
        }
        case 'month':
            return {
                from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
                to: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
            };
        case 'lastMonth':
            return {
                from: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
                to: new Date(now.getFullYear(), now.getMonth(), 1).getTime()
            };
        case 'custom': {
            let a = parseLocalDate(custom.from || '');
            let b = parseLocalDate(custom.to || '');
            if (a && b && a > b) [a, b] = [b, a];
            return {
                from: a ? a.getTime() : null,
                to: b ? dayStart(b, 1).getTime() : null
            };
        }
        default:
            return { from: null, to: null };
    }
}

/**
 * Is the bill inside the range? Bills without a date only show for "All dates".
 * @param {Object} bill
 * @param {{from: number|null, to: number|null}} range
 * @returns {boolean}
 */
export function isBillInRange(bill, range) {
    if (!range || (range.from === null && range.to === null)) return true;
    const t = billTimeMs(bill);
    if (t === null) return false;
    if (range.from !== null && t < range.from) return false;
    if (range.to !== null && t >= range.to) return false;
    return true;
}

/**
 * Text search over bill number / customer / item names (case-insensitive).
 * @param {Object} bill
 * @param {string} term
 * @returns {boolean}
 */
export function matchesHistorySearch(bill, term) {
    const q = String(term || '').trim().toLowerCase();
    if (!q) return true;
    const billNumber = bill.billNumber || (typeof bill.id === 'string' ? bill.id.substring(0, 8) : String(bill.id ?? ''));
    if (String(billNumber).toLowerCase().includes(q)) return true;
    if (bill.customerName && String(bill.customerName).toLowerCase().includes(q)) return true;
    return Array.isArray(bill.items) && bill.items.some(item => String(item?.name || '').toLowerCase().includes(q));
}

/**
 * Filter by type, range and search, newest first.
 * @param {Array<Object>} bills - type-tagged bills ({type: 'purchase'|'retail'|'wholesale'})
 * @param {{type?: string, range?: {from: number|null, to: number|null}, search?: string}} filter
 * @returns {Array<Object>} new array
 */
export function filterHistoryBills(bills, { type = 'all', range = null, search = '' } = {}) {
    const timeOf = (b) => billTimeMs(b) ?? 0;
    return (bills || [])
        .filter(b => matchesHistoryType(b, type) && isBillInRange(b, range) && matchesHistorySearch(b, search))
        .sort((a, b) => timeOf(b) - timeOf(a));
}

/**
 * Validate a saved/partial filter into a complete one.
 * @param {*} value - object or JSON string (e.g. from sessionStorage)
 * @returns {{type: string, preset: string, from: string, to: string}}
 */
export function normalizeHistoryFilter(value) {
    let obj = value;
    if (typeof value === 'string') {
        try { obj = JSON.parse(value); } catch { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return { ...DEFAULT_HISTORY_FILTER };
    const isoOrEmpty = (s) => (typeof s === 'string' && parseLocalDate(s) ? s : '');
    return {
        type: HISTORY_TYPES.includes(obj.type) ? obj.type : (obj.type === 'sale' ? 'all' : DEFAULT_HISTORY_FILTER.type),
        preset: HISTORY_PRESETS.includes(obj.preset) ? obj.preset : DEFAULT_HISTORY_FILTER.preset,
        from: isoOrEmpty(obj.from),
        to: isoOrEmpty(obj.to)
    };
}

/**
 * Short label for the active range, e.g. "01/10/2026 – 22/10/2026".
 * @param {{from: number|null, to: number|null}} range
 * @returns {string}
 */
export function formatHistoryRange(range) {
    if (!range || (range.from === null && range.to === null)) return '';
    const fmt = (ms) => toLocalISODate(new Date(ms)).split('-').reverse().join('/');
    const from = range.from !== null ? fmt(range.from) : '…';
    const to = range.to !== null ? fmt(range.to - 1) : '…';
    return from === to ? from : `${from} – ${to}`;
}
