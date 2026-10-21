/**
 * @fileoverview Pure helpers for the item catalogue: id lookups, duplicate-name
 * checks and usage frequency. No Firebase / DOM access, so they are unit-tested.
 * @module utils/item-catalog
 */

import { createItemKeyResolver } from './stock-replay.js';

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

/**
 * Counts how many bill lines used each catalogue item across the loaded
 * purchase, wholesale and retail histories. Lines resolve to an item id the
 * same way the stock replay does (itemId, else English/Hindi name).
 * @param {{purchases?: Array, wholesaleSales?: Array, retailSales?: Array}} sources
 * @param {Array<{id: string, name?: string, hindiName?: string}>} items
 * @returns {Object.<string, number>} item id -> number of bill lines
 */
export function itemUsageFrequency(sources, items) {
    const getKey = createItemKeyResolver(items);
    const ids = new Set((items || []).map(i => i.id));
    const counts = {};
    [sources?.purchases, sources?.wholesaleSales, sources?.retailSales].forEach(bills => {
        (bills || []).forEach(bill => {
            (Array.isArray(bill?.items) ? bill.items : []).forEach(line => {
                if (!line) return;
                const key = getKey({ itemId: line.itemId, name: line.name || line.itemName });
                if (ids.has(key)) counts[key] = (counts[key] || 0) + 1;
            });
        });
    });
    return counts;
}

/**
 * Sorts items by usage (most used first), then alphabetically by name.
 * @param {Array<Object>} items
 * @param {Object.<string, number>} frequency item id -> count
 * @returns {Array<Object>} a new sorted array
 */
export function sortItemsByUsage(items, frequency) {
    return [...(items || [])].sort((a, b) => {
        const diff = (frequency[b.id] || 0) - (frequency[a.id] || 0);
        if (diff !== 0) return diff;
        return (a.name || '').localeCompare(b.name || '');
    });
}