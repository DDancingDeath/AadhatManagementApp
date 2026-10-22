/**
 * @fileoverview Rate trends (#65 phase 1+2): monthly per-item rate statistics
 * built from bill lines, the resumable backfill over all bills, the
 * roll-forward plan for recent months, and the seasonal "usually goes up /
 * down" estimate. Pure functions; Firestore access is injected by the caller.
 *
 * Stats doc `rateStats/{itemId}_{YYYY-MM}` (IST month):
 *   { itemId, month, purchase: Section, retail: Section, wholesale: Section, bills, updatedAt }
 *   Section = { kg, amount, min, max, avg, bills }  — avg = amount / kg (kg-weighted rate)
 *   bills   = bills of any kind with this item in the month
 * @module utils/rate-trends
 */

import { createItemKeyResolver, eventTime } from './stock-replay.js';

export const RATE_KINDS = ['purchase', 'retail', 'wholesale'];

/** Bill collections read by the backfill, in order, with the section they fill. */
export const BACKFILL_SOURCES = [
    { coll: 'purchases', kind: 'purchase' },
    { coll: 'retailSales', kind: 'retail' },
    { coll: 'wholesaleSales', kind: 'wholesale' }
];

export const BACKFILL_PAGE_SIZE = 300;
export const DEFAULT_DAILY_READ_BUDGET = 10000;
export const READ_BUDGET_OPTIONS = [5000, 10000, 20000];
export const CURSOR_VERSION = 1;

/** Month-over-month changes within ±this % count as "about the same". */
export const FLAT_PCT = 2;
export const MIN_SEASONS = 2;

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86400000;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const pad2 = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** IST calendar month 'YYYY-MM' of an instant (ms). */
export function istMonthKey(ms) {
    const d = new Date(Number(ms) + IST_OFFSET_MS);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** IST calendar day 'YYYY-MM-DD' of an instant (ms). */
export function istDayKey(ms) {
    const d = new Date(Number(ms) + IST_OFFSET_MS);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Start (ms) of an IST month 'YYYY-MM'. */
export function istMonthStartMs(month) {
    const m = MONTH_RE.exec(month || '');
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) - IST_OFFSET_MS;
}

/** 'YYYY-MM' shifted by n months. */
export function addMonths(month, n) {
    const m = MONTH_RE.exec(month || '');
    if (!m) return null;
    const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
    return `${Math.floor(total / 12)}-${pad2((total % 12 + 12) % 12 + 1)}`;
}

/** IST month of a bill (numeric timestamp, Firestore Timestamp, ISO or en-IN date string), or null. */
export function billMonth(bill) {
    const t = eventTime(bill);
    if (!Number.isFinite(t) || t === Number.MAX_SAFE_INTEGER) return null;
    return istMonthKey(t);
}

/** kg on a bill line: purchase/retail store `qty`, wholesale stores `quantity`. */
export function lineKg(line) {
    if (!line) return 0;
    const raw = line.qty !== undefined && line.qty !== null && line.qty !== '' ? line.qty : line.quantity;
    const kg = parseFloat(raw);
    return Number.isFinite(kg) && kg > 0 ? kg : 0;
}

/** ₹/kg on a bill line; falls back to total / kg for legacy lines without `rate`. */
export function lineRate(line, kg = lineKg(line)) {
    const rate = parseFloat(line?.rate);
    if (Number.isFinite(rate) && rate > 0) return rate;
    const total = parseFloat(line?.total);
    return kg > 0 && Number.isFinite(total) && total > 0 ? total / kg : 0;
}

export function emptySection() {
    return { kg: 0, amount: 0, min: null, max: null, avg: 0, bills: 0 };
}

export const statsDocId = (itemId, month) => `${itemId}_${month}`;

/**
 * Item-key resolver limited to catalogue ids: lines are grouped by `itemId`,
 * legacy lines without one (or with a deleted id) by English/Hindi name.
 * Lines that match no catalogue item are skipped (returns null).
 */
export function createCatalogueResolver(items) {
    const ids = new Set((items || []).map(i => i.id));
    const resolve = createItemKeyResolver(items);
    return (line) => {
        const key = resolve({ itemId: line.itemId, name: line.name || line.itemName });
        return ids.has(key) ? key : null;
    };
}

/**
 * Adds one bill to a plain-object accumulator (serialisable, so the backfill
 * can keep it in its cursor). Each bill counts once per item and kind.
 * @param {Object} acc { [docId]: {itemId, month, purchase?, retail?, wholesale?, billIds?} }
 * @param {Object} bill
 * @param {'purchase'|'retail'|'wholesale'} kind
 * @param {Function} resolve createCatalogueResolver(items)
 * @param {{fromMonth?: string}} [opts] skip bills before this month
 * @returns {boolean} whether the bill was used
 */
export function addBillToAcc(acc, bill, kind, resolve, { fromMonth = null } = {}) {
    if (!bill || !Array.isArray(bill.items)) return false;
    const month = billMonth(bill);
    if (!month || (fromMonth && month < fromMonth)) return false;
    const seen = new Set();
    let used = false;
    bill.items.forEach(line => {
        if (!line) return;
        const kg = lineKg(line);
        const rate = lineRate(line, kg);
        if (!(kg > 0) || !(rate > 0)) return;
        const itemId = resolve(line);
        if (!itemId) return;
        const id = statsDocId(itemId, month);
        const doc = acc[id] || (acc[id] = { itemId, month });
        const s = doc[kind] || (doc[kind] = emptySection());
        s.kg += kg;
        s.amount += kg * rate;
        s.min = s.min === null ? rate : Math.min(s.min, rate);
        s.max = s.max === null ? rate : Math.max(s.max, rate);
        if (!seen.has(id)) {
            seen.add(id);
            s.bills += 1;
            doc.bills = (doc.bills || 0) + 1;
        }
        used = true;
    });
    return used;
}

/**
 * Accumulates loaded bills of every kind.
 * @param {{purchase?: Array, retail?: Array, wholesale?: Array}} sources
 * @param {Array} items catalogue
 * @param {{fromMonth?: string}} [opts]
 */
export function aggregateBills(sources, items, opts = {}) {
    const acc = {};
    const resolve = createCatalogueResolver(items);
    RATE_KINDS.forEach(kind => (sources?.[kind] || []).forEach(bill => addBillToAcc(acc, bill, kind, resolve, opts)));
    return acc;
}

function finalizeSection(s) {
    if (!s || !(s.kg > 0)) return emptySection();
    const kg = round2(s.kg);
    const amount = round2(s.amount);
    return { kg, amount, min: round2(s.min), max: round2(s.max), avg: round2(s.amount / s.kg), bills: s.bills || 0 };
}

/**
 * Stats documents from an accumulator: every kind present (empty sections
 * for kinds with no lines), rounded, avg = amount / kg.
 * @returns {Object.<string, Object>} docId -> data (without updatedAt)
 */
export function finalizeStats(acc) {
    const out = {};
    Object.keys(acc || {}).forEach(id => {
        const d = acc[id];
        const doc = { itemId: d.itemId, month: d.month, bills: d.bills || 0 };
        RATE_KINDS.forEach(k => { doc[k] = finalizeSection(d[k]); });
        out[id] = doc;
    });
    return out;
}

const sameSection = (a, b) => {
    const x = a || emptySection();
    const y = b || emptySection();
    return ['kg', 'amount', 'min', 'max', 'avg', 'bills'].every(f => (x[f] ?? null) === (y[f] ?? null));
};

/** True when two stats docs carry the same numbers (updatedAt ignored). */
export function sameStats(a, b) {
    if (!a || !b) return false;
    return (a.bills || 0) === (b.bills || 0) && RATE_KINDS.every(k => sameSection(a[k], b[k]));
}

/**
 * First IST month fully covered by the loaded history (ms; 0 = all loaded),
 * capped to `maxMonths` back from `now` so a roll-forward (and its server
 * read of those months) stays small.
 */
export function rollForwardFromMonth(loadedFrom, now, maxMonths = 2) {
    const current = istMonthKey(now);
    const floor = addMonths(current, -(maxMonths - 1));
    if (!(loadedFrom > 0)) return floor;
    const m = istMonthKey(loadedFrom);
    const covered = istMonthStartMs(m) === loadedFrom ? m : addMonths(m, 1);
    return covered > floor ? covered : floor;
}

/**
 * Writes that bring the stored stats of months >= fromMonth in line with the
 * stats computed from loaded bills: changed or new docs, and stored docs
 * whose bills were all deleted or edited away (written empty).
 * @param {Object.<string, Object>} computed finalizeStats() of loaded bills from fromMonth
 * @param {Array<Object>} stored stored docs ({id, ...data}) with month >= fromMonth
 * @param {string} fromMonth
 * @returns {Array<{id: string, data: Object}>}
 */
export function planRollForward(computed, stored, fromMonth) {
    const storedById = new Map((stored || []).filter(d => d && d.month >= fromMonth).map(d => [d.id, d]));
    const writes = [];
    Object.keys(computed || {}).forEach(id => {
        if (computed[id].month < fromMonth) return;
        if (!sameStats(computed[id], storedById.get(id))) writes.push({ id, data: computed[id] });
    });
    storedById.forEach((d, id) => {
        if (computed?.[id]) return;
        const empty = { itemId: d.itemId, month: d.month, bills: 0, purchase: emptySection(), retail: emptySection(), wholesale: emptySection() };
        if (!sameStats(empty, d)) writes.push({ id, data: empty });
    });
    return writes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Backfill (owner-triggered, resumable)
// ---------------------------------------------------------------------------

/** A fresh backfill cursor. */
export function newCursor(now) {
    return { v: CURSOR_VERSION, startedAt: now, phase: 'read', source: 0, after: null, acc: {}, bills: 0, reads: 0, day: istDayKey(now), readsToday: 0 };
}

/** Parses a stored cursor; null when missing, corrupt or from another format. */
export function parseCursor(text) {
    if (!text) return null;
    try {
        const c = JSON.parse(text);
        if (!c || c.v !== CURSOR_VERSION || !['read', 'write'].includes(c.phase) || typeof c.acc !== 'object') return null;
        return c;
    } catch (_) {
        return null;
    }
}

/**
 * Reads bill pages until every bill collection is done, today's read budget
 * is used up, or an error stops it. The cursor is saved after every page, so
 * a closed app, quota error or budget stop continues from the next page.
 * @param {Object} args
 * @param {Object} args.cursor mutated
 * @param {(coll: string, after: ?string, limit: number) => Promise<{docs: Array<{id: string}>, reads: number}>} args.fetchPage
 * @param {Array} args.items catalogue
 * @param {(cursor: Object) => void} args.saveCursor
 * @param {(err: *) => boolean} args.isQuotaError
 * @param {number} [args.budget] reads per IST day
 * @param {number} [args.pageSize]
 * @param {() => number} [args.now]
 * @param {(cursor: Object) => void} [args.onProgress]
 * @returns {Promise<{status: 'read-done'|'budget'|'quota'|'error', error?: *}>}
 */
export async function runBackfillReads({
    cursor, fetchPage, items, saveCursor, isQuotaError,
    budget = DEFAULT_DAILY_READ_BUDGET, pageSize = BACKFILL_PAGE_SIZE, now = () => Date.now(), onProgress = null
}) {
    const resolve = createCatalogueResolver(items);
    while (cursor.source < BACKFILL_SOURCES.length) {
        const today = istDayKey(now());
        if (cursor.day !== today) {
            cursor.day = today;
            cursor.readsToday = 0;
        }
        if (cursor.readsToday >= budget) {
            saveCursor(cursor);
            return { status: 'budget' };
        }
        const { coll, kind } = BACKFILL_SOURCES[cursor.source];
        const limit = Math.min(pageSize, Math.max(1, budget - cursor.readsToday));
        let page;
        try {
            page = await fetchPage(coll, cursor.after, limit);
        } catch (error) {
            saveCursor(cursor);
            return { status: isQuotaError(error) ? 'quota' : 'error', error };
        }
        const docs = page?.docs || [];
        const reads = Number.isFinite(page?.reads) ? page.reads : Math.max(1, docs.length);
        cursor.reads += reads;
        cursor.readsToday += reads;
        docs.forEach(bill => { if (addBillToAcc(cursor.acc, bill, kind, resolve)) cursor.bills += 1; });
        if (docs.length < limit) {
            cursor.source += 1;
            cursor.after = null;
        } else {
            cursor.after = docs[docs.length - 1].id;
        }
        saveCursor(cursor);
        if (onProgress) onProgress(cursor);
    }
    cursor.phase = 'write';
    saveCursor(cursor);
    return { status: 'read-done' };
}

/**
 * Rough read cost of a full backfill: bills loaded per day in the current
 * window, extrapolated back to the oldest bill (exact when all history is loaded).
 * @param {{loadedBills: number, loadedFrom: number, oldest: number, now: number}} args
 * @returns {number}
 */
export function estimateBackfillReads({ loadedBills, loadedFrom, oldest, now }) {
    const n = Math.max(0, Number(loadedBills) || 0);
    const pages = BACKFILL_SOURCES.length;
    if (!(loadedFrom > 0)) return n + pages;
    const span = now - loadedFrom;
    if (!(span > DAY_MS) || !Number.isFinite(oldest) || oldest >= loadedFrom) return n + pages;
    return Math.ceil(n * ((now - oldest) / span)) + pages;
}

/** Days the backfill will take at `budget` reads per day. */
export function backfillDays(estimate, budget = DEFAULT_DAILY_READ_BUDGET) {
    return Math.max(1, Math.ceil((Number(estimate) || 0) / Math.max(1, budget)));
}

// ---------------------------------------------------------------------------
// Series, table rows and the seasonal estimate
// ---------------------------------------------------------------------------

/** kg-weighted average of one kind, or of 'sale' (retail + wholesale together). */
export function sectionAvg(doc, kind) {
    if (!doc) return null;
    const kinds = kind === 'sale' ? ['retail', 'wholesale'] : [kind];
    let kg = 0;
    let amount = 0;
    kinds.forEach(k => {
        kg += Number(doc[k]?.kg) || 0;
        amount += Number(doc[k]?.amount) || 0;
    });
    return kg > 0 ? round2(amount / kg) : null;
}

/** { 'YYYY-MM': avg } for one kind ('purchase' | 'retail' | 'wholesale' | 'sale'). */
export function monthSeries(docs, kind) {
    const out = {};
    (docs || []).forEach(d => {
        const v = sectionAvg(d, kind);
        if (v !== null && d.month) out[d.month] = v;
    });
    return out;
}

/** Table rows per month (oldest first) with sale average and margin per kg. */
export function trendRows(docs) {
    return (docs || [])
        .filter(d => d && MONTH_RE.test(d.month || ''))
        .slice()
        .sort((a, b) => (a.month < b.month ? -1 : 1))
        .map(d => {
            const purchase = sectionAvg(d, 'purchase');
            const sale = sectionAvg(d, 'sale');
            return {
                month: d.month,
                purchase,
                retail: sectionAvg(d, 'retail'),
                wholesale: sectionAvg(d, 'wholesale'),
                sale,
                margin: purchase !== null && sale !== null ? round2(sale - purchase) : null,
                kgBought: round2(d.purchase?.kg),
                kgSold: round2((Number(d.retail?.kg) || 0) + (Number(d.wholesale?.kg) || 0)),
                bills: Number(d.bills) || 0
            };
        })
        .filter(r => r.purchase !== null || r.sale !== null);
}

/** Same calendar months per year: { year: [12 values or null] } (Jan..Dec). */
export function yearOverlay(series, years) {
    const out = {};
    (years || []).forEach(y => {
        out[y] = Array.from({ length: 12 }, (_, i) => {
            const v = series[`${y}-${pad2(i + 1)}`];
            return v === undefined ? null : v;
        });
    });
    return out;
}

const directionOf = (pct, flat = FLAT_PCT) => (pct > flat ? 'up' : pct < -flat ? 'down' : 'flat');

/**
 * Seasonal estimate for the next `weeks` weeks: in every past year with data
 * for both months, the change from this calendar month to the month the
 * horizon ends in. Average change → direction; agreement across years and
 * the number of years → confidence.
 * @param {Object.<string, number>} series monthSeries()
 * @param {{now: number, weeks?: number, flatPct?: number, maxYears?: number}} opts
 * @returns {{status: 'ok'|'not-enough', fromMonth: string, toMonth: string, seasons: number,
 *   perYear: Array<{year: number, from: number, to: number, pct: number}>, pct?: number,
 *   direction?: 'up'|'down'|'flat', agree?: number, confidence?: 'high'|'medium'|'low'}}
 */
export function seasonalOutlook(series, { now, weeks = 6, flatPct = FLAT_PCT, maxYears = 10 } = {}) {
    const fromMonth = istMonthKey(now);
    let toMonth = istMonthKey(now + weeks * 7 * DAY_MS);
    if (toMonth <= fromMonth) toMonth = addMonths(fromMonth, 1);
    const perYear = [];
    for (let k = 1; k <= maxYears; k++) {
        const f = addMonths(fromMonth, -12 * k);
        const t = addMonths(toMonth, -12 * k);
        const a = series?.[f];
        const b = series?.[t];
        if (a > 0 && b > 0) perYear.push({ year: Number(f.slice(0, 4)), from: a, to: b, pct: round2((b / a - 1) * 100) });
    }
    const base = { fromMonth, toMonth, seasons: perYear.length, perYear };
    if (perYear.length < MIN_SEASONS) return { ...base, status: 'not-enough' };
    const pct = round2(perYear.reduce((s, y) => s + y.pct, 0) / perYear.length);
    const direction = directionOf(pct, flatPct);
    const agree = perYear.filter(y => directionOf(y.pct, flatPct) === direction).length;
    let confidence = 'low';
    if (perYear.length >= 3 && agree === perYear.length) confidence = 'high';
    else if (agree * 3 >= perYear.length * 2) confidence = 'medium';
    return { ...base, status: 'ok', pct, direction, agree, confidence };
}

const MONTH_NAMES = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']
};

/** 'Oct 2026' / 'अक्टूबर 2026'; `withYear` false gives just the month. */
export function monthLabel(month, lang = 'en', withYear = true) {
    const m = MONTH_RE.exec(month || '');
    if (!m) return String(month || '');
    const name = MONTH_NAMES[lang === 'hi' ? 'hi' : 'en'][Number(m[2]) - 1];
    return withYear ? `${name} ${m[1]}` : name;
}

export const DIRECTION_TEXT = {
    up: { en: 'Usually goes UP at this time of year', hi: 'साल के इस समय रेट आमतौर पर बढ़ता है' },
    down: { en: 'Usually goes DOWN at this time of year', hi: 'साल के इस समय रेट आमतौर पर घटता है' },
    flat: { en: 'Usually stays about the same at this time of year', hi: 'साल के इस समय रेट आमतौर पर लगभग वैसा ही रहता है' }
};

export const CONFIDENCE_TEXT = {
    high: { en: 'High confidence', hi: 'भरोसा ज़्यादा' },
    medium: { en: 'Medium confidence', hi: 'भरोसा मध्यम' },
    low: { en: 'Low confidence', hi: 'भरोसा कम' }
};

const signed = (n) => `${n > 0 ? '+' : ''}${n}%`;

/**
 * Plain bilingual explanation of an outlook.
 * @returns {{en: string, hi: string}}
 */
export function explainOutlook(o) {
    const fromEn = monthLabel(o.fromMonth, 'en', false);
    const toEn = monthLabel(o.toMonth, 'en', false);
    const fromHi = monthLabel(o.fromMonth, 'hi', false);
    const toHi = monthLabel(o.toMonth, 'hi', false);
    if (o.status !== 'ok') {
        return {
            en: `Not enough history yet: needs ${fromEn} and ${toEn} rates from at least ${MIN_SEASONS} past years (have ${o.seasons}).`,
            hi: `अभी पूरा इतिहास नहीं है: कम से कम ${MIN_SEASONS} पिछले सालों के ${fromHi} और ${toHi} के रेट चाहिए (अभी ${o.seasons})।`
        };
    }
    const list = o.perYear.map(y => `${y.year}: ${signed(y.pct)}`).join(', ');
    const about = Math.abs(Math.round(o.pct));
    const dirEn = o.direction === 'up' ? `UP about ${about}%` : o.direction === 'down' ? `DOWN about ${about}%` : 'about the same';
    const dirHi = o.direction === 'up' ? `लगभग ${about}% बढ़ता है` : o.direction === 'down' ? `लगभग ${about}% घटता है` : 'लगभग वैसा ही रहता है';
    return {
        en: `${toEn} vs ${fromEn} in past years — ${list}. On average it went ${dirEn}; ${o.agree} of ${o.seasons} years agree.`,
        hi: `पिछले सालों में ${fromHi} से ${toHi} — ${list}। औसतन रेट ${dirHi}; ${o.seasons} में से ${o.agree} साल यही रहा।`
    };
}

/**
 * Catalogue items ordered by how many loaded bill lines use them (most used
 * first), then by name.
 */
export function itemsByUsage(items, sources) {
    const resolve = createCatalogueResolver(items);
    const uses = {};
    RATE_KINDS.forEach(kind => (sources?.[kind] || []).forEach(bill => {
        (bill?.items || []).forEach(line => {
            if (!line) return;
            const id = resolve(line);
            if (id) uses[id] = (uses[id] || 0) + 1;
        });
    }));
    return (items || [])
        .map(i => ({ item: i, uses: uses[i.id] || 0 }))
        .sort((a, b) => (b.uses - a.uses) || String(a.item.name || '').localeCompare(String(b.item.name || '')));
}
