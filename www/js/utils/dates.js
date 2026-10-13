/**
 * @fileoverview Local-time date helpers.
 * The business runs in IST, so "today" and day boundaries must use the
 * device's local calendar day, never UTC (toISOString() / new Date('YYYY-MM-DD')
 * are UTC-based and shift the day by 5h30m in India).
 * @module utils/dates
 */

const pad2 = (n) => String(n).padStart(2, '0');

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// DD/MM/YYYY with optional ", h:mm[:ss] [am|pm]" (en-IN toLocaleString output)
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?\s*$/i;

/**
 * Format a Date as YYYY-MM-DD using local calendar fields.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function toLocalISODate(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Today's date as YYYY-MM-DD in device local time.
 * @returns {string}
 */
export function todayLocalISO() {
    return toLocalISODate(new Date());
}

/**
 * Parse 'YYYY-MM-DD' as local midnight (not UTC midnight).
 * @param {string} str
 * @returns {Date|null}
 */
export function parseLocalDate(str) {
    if (typeof str !== 'string') return null;
    const m = ISO_DATE_ONLY.exec(str.trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // Reject overflow like 2024-02-31
    if (d.getMonth() !== Number(m[2]) - 1) return null;
    return d;
}

/**
 * Parse any date shape found on bills/expenses/sessions:
 * Firestore Timestamp, Date, epoch ms, 'YYYY-MM-DD' (local midnight),
 * ISO datetime, and en-IN 'DD/MM/YYYY[, h:mm:ss am]' strings.
 * Aligned with Helpers.parseDate, plus date-only and epoch support.
 * @param {*} value
 * @returns {Date|null}
 */
export function parseAnyBillDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') return value.toDate();
        if (typeof value.seconds === 'number') {
            return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
        }
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? new Date(value) : null;
    }
    if (typeof value !== 'string') return null;

    const str = value.trim();
    if (/^\d{10,}$/.test(str)) return new Date(Number(str));

    const localDay = parseLocalDate(str);
    if (localDay) return localDay;

    const m = DMY.exec(str);
    if (m) {
        let hours = m[4] ? parseInt(m[4], 10) : 0;
        const period = m[7] ? m[7].toLowerCase() : null;
        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        return new Date(
            parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10),
            hours, m[5] ? parseInt(m[5], 10) : 0, m[6] ? parseInt(m[6], 10) : 0
        );
    }

    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Local midnight at the start of the day containing `value`.
 * @param {*} [value=new Date()] Anything parseAnyBillDate accepts
 * @returns {Date|null}
 */
export function startOfLocalDay(value = new Date()) {
    const d = parseAnyBillDate(value);
    if (!d) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Exclusive end of the local day containing `value` (next local midnight).
 * @param {*} [value=new Date()]
 * @returns {Date|null}
 */
export function endOfLocalDayExclusive(value = new Date()) {
    const start = startOfLocalDay(value);
    if (!start) return null;
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

/**
 * Local YYYY-MM-DD for `daysAgo` days before today.
 * @param {number} daysAgo
 * @returns {string}
 */
export function localISODaysAgo(daysAgo) {
    const now = new Date();
    return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo));
}
