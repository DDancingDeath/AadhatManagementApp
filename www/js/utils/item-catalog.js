/**
 * @fileoverview Pure helpers for the item catalogue: id lookups, duplicate-name
 * checks and usage frequency. No Firebase / DOM access, so they are unit-tested.
 * @module utils/item-catalog
 */

/**
 * Normalises an item name for comparisons: Unicode NFC, trimmed, inner
 * whitespace collapsed, lower-cased. Works for English and Hindi names.
 * @param {*} s
 * @returns {string}
 */
export function normalizeItemName(s) {
    if (s == null) return '';
    let str = String(s);
    if (typeof str.normalize === 'function') str = str.normalize('NFC');
    return str.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Finds an item by id.
 * @param {Array<{id: string}>} items
 * @param {string} id
 * @returns {Object|null}
 */
export function findItemById(items, id) {
    if (!id) return null;
    return (items || []).find(i => i && i.id === id) || null;
}

/**
 * Returns the existing item whose English or Hindi name collides with either
 * of the candidate names (case/space-insensitive). English and Hindi names
 * share one namespace because the stock replay resolves bill lines by either.
 * @param {Array<{id: string, name?: string, hindiName?: string}>} items
 * @param {{name?: string, hindiName?: string}} candidate
 * @param {string|null} [excludeId] id of the item being edited
 * @returns {{item: Object, name: string}|null} the clashing item and the clashing name
 */
export function findDuplicateItem(items, candidate, excludeId = null) {
    const wanted = [candidate?.name, candidate?.hindiName]
        .map(normalizeItemName)
        .filter(Boolean);
    if (wanted.length === 0) return null;
    for (const item of items || []) {
        if (!item || (excludeId && item.id === excludeId)) continue;
        for (const existing of [item.name, item.hindiName]) {
            const n = normalizeItemName(existing);
            if (n && wanted.includes(n)) return { item, name: existing };
        }
    }
    return null;
}

/**
 * Bilingual "name already exists" message.
 * @param {string} name
 * @returns {string}
 */
export function duplicateItemMessage(name) {
    return `"${name}" already exists — use a different name. / "${name}" नाम का आइटम पहले से है — दूसरा नाम रखें।`;
}
