/**
 * @fileoverview Item rate / name change history (#82, phase 1 of #65).
 * Pure helpers: snapshot an item when editing starts, diff it against the
 * saved values once on save (so typing 4 → 45 is recorded as one change from
 * the value at edit start, not per keystroke), build append-only history
 * entries and decide which changes need a confirmation.
 * @module utils/rate-history
 */

/** Rate types in history entries -> item array field. */
export const RATE_FIELDS = { purchase: 'rates', wholesale: 'wholesaleRates', retail: 'saleRates' };

/** Every `field` value a history entry may have (mirrored in firestore.rules). */
export const HISTORY_FIELDS = ['purchase', 'wholesale', 'retail', 'name', 'hindiName'];

/** A rate more than this many times (or less than 1/this) the old rate needs a confirm. */
export const RATE_SANITY_FACTOR = 2;

/** Two changes of the same item field within this window get a review flag. */
export const QUICK_REPEAT_MS = 60 * 1000;

export const FIELD_LABELS = {
    purchase: 'Purchase rate / खरीद रेट',
    wholesale: 'Wholesale rate / थोक रेट',
    retail: 'Retail rate / खुदरा रेट',
    name: 'Name / नाम',
    hindiName: 'Hindi name / हिंदी नाम'
};

const cleanRates = (list) => (Array.isArray(list) ? list : [])
    .map(Number)
    .filter(r => Number.isFinite(r) && r > 0);

/**
 * Values the history tracks, taken at edit start or from the data to save.
 * @param {Object|null} item
 * @returns {{name: string, hindiName: string, purchase: number[], wholesale: number[], retail: number[]}}
 */
export function snapshotItem(item) {
    const src = item || {};
    return {
        name: String(src.name || '').trim(),
        hindiName: String(src.hindiName || '').trim(),
        purchase: cleanRates(src[RATE_FIELDS.purchase]),
        wholesale: cleanRates(src[RATE_FIELDS.wholesale]),
        retail: cleanRates(src[RATE_FIELDS.retail])
    };
}

/**
 * Changes between two rate lists. Values present in both are unchanged
 * (position doesn't matter); the rest are paired in order as old → new,
 * leftovers are removals (new = null) or additions (old = null).
 * @param {number[]} oldList
 * @param {number[]} newList
 * @returns {Array<{old: ?number, new: ?number}>}
 */
export function diffRateList(oldList, newList) {
    const removed = [...oldList];
    const added = [];
    newList.forEach(v => {
        const i = removed.indexOf(v);
        if (i !== -1) removed.splice(i, 1);
        else added.push(v);
    });
    const out = [];
    const n = Math.max(removed.length, added.length);
    for (let i = 0; i < n; i++) {
        out.push({ old: i < removed.length ? removed[i] : null, new: i < added.length ? added[i] : null });
    }
    return out;
}

/**
 * Every tracked change between two snapshots.
 * @param {ReturnType<typeof snapshotItem>} before
 * @param {ReturnType<typeof snapshotItem>} after
 * @returns {Array<{field: string, old: *, new: *}>}
 */
export function diffItemSnapshots(before, after) {
    const changes = [];
    ['name', 'hindiName'].forEach(field => {
        if (before[field] !== after[field]) changes.push({ field, old: before[field] || null, new: after[field] || null });
    });
    Object.keys(RATE_FIELDS).forEach(field => {
        diffRateList(before[field], after[field]).forEach(c => changes.push({ field, old: c.old, new: c.new }));
    });
    return changes;
}

/**
 * True when a rate moved by more than `factor`× either way.
 * @param {?number} oldRate
 * @param {?number} newRate
 * @param {number} [factor]
 * @returns {boolean}
 */
export function isRateOutOfBand(oldRate, newRate, factor = RATE_SANITY_FACTOR) {
    const o = Number(oldRate);
    const n = Number(newRate);
    if (!(o > 0) || !(n > 0)) return false;
    return n > o * factor || n < o / factor;
}

/**
 * Warnings to confirm before saving.
 * @param {Array<{field: string, old: *, new: *}>} changes
 * @param {{isNew?: boolean}} [opts] renames of a new item need no warning
 * @returns {{rename: Array, outOfBand: Array}}
 */
export function changeWarnings(changes, { isNew = false } = {}) {
    return {
        rename: isNew ? [] : changes.filter(c => (c.field === 'name' || c.field === 'hindiName') && c.old),
        outOfBand: changes.filter(c => RATE_FIELDS[c.field] && isRateOutOfBand(c.old, c.new))
    };
}

/**
 * Append-only history entries for one save.
 * @param {Array<{field: string, old: *, new: *}>} changes
 * @param {Object} meta
 * @param {string} meta.itemId
 * @param {string} meta.itemName
 * @param {string} meta.by display name
 * @param {string} meta.byUserId
 * @param {number} meta.at ms
 * @param {string} [meta.source] 'modal' | 'inline'
 * @param {Object.<string, number>} [meta.lastChangeAt] `${itemId}:${field}` -> ms of the previous change
 * @returns {Array<Object>}
 */
export function buildHistoryEntries(changes, { itemId, itemName, by, byUserId, at, source = 'modal', lastChangeAt = {} }) {
    return changes.map(c => {
        const flags = [];
        if (RATE_FIELDS[c.field] && isRateOutOfBand(c.old, c.new)) flags.push('out-of-band');
        const prev = lastChangeAt[`${itemId}:${c.field}`];
        if (typeof prev === 'number' && at - prev >= 0 && at - prev < QUICK_REPEAT_MS) flags.push('quick-repeat');
        return {
            itemId,
            itemName: itemName || '',
            field: c.field,
            old: c.old === undefined ? null : c.old,
            new: c.new === undefined ? null : c.new,
            by: by || '',
            byUserId,
            at,
            source,
            flags
        };
    });
}

/**
 * Document id that sorts newest first within an item, so the history can be
 * read with a document-id range (no composite index needed).
 * @param {string} itemId
 * @param {number} at ms
 * @param {number} seq position within one save
 * @returns {string}
 */
export function historyDocId(itemId, at, seq = 0) {
    const inverted = String(9999999999999 - Math.floor(at)).padStart(13, '0');
    return `${itemId}_${inverted}_${String(seq).padStart(2, '0')}`;
}

/**
 * Human text for a value in the history list.
 * @param {string} field
 * @param {*} value
 * @returns {string}
 */
export function formatHistoryValue(field, value) {
    if (value === null || value === undefined || value === '') return '—';
    return RATE_FIELDS[field] ? `₹${value}` : String(value);
}
