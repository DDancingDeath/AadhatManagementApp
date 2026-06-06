/**
 * @fileoverview Stock availability check used before completing a sale.
 *
 * The check is intentionally informational rather than a hard block — an
 * aadhat will occasionally legitimately sell stock that has not yet
 * physically arrived (broker scenario), and we don't want to surprise the
 * user with a blocking error in that case. Instead we surface the shortfall
 * in a confirmation dialog so the user can decide explicitly.
 *
 * Aggregating by the same key-resolution rules used in calculateStock()
 * matters because a bill may have multiple line items for the same item
 * (e.g. two weight groups). Otherwise we would miss the case where each
 * individual line fits within stock but the sum does not.
 */
import { AppState } from '../utils/state.js';

const normalize = (s) => (s == null ? '' : String(s).trim().toLowerCase());

/**
 * Resolve a sale-line item to its canonical catalogue id, mirroring the
 * resolution used inside calculateStock(). Falls back to the normalized
 * name when nothing matches, so unknown items still bucket together.
 *
 * @param {Object} item - sale line item ({ itemId?, name? })
 * @returns {string} canonical key for stock lookup
 */
function resolveKey(item) {
    if (item.itemId) {
        const found = AppState.items.find((i) => i.id === item.itemId);
        if (found) return found.id;
    }
    const target = normalize(item.name);
    if (target) {
        const found = AppState.items.find(
            (i) => normalize(i.name) === target || normalize(i.hindiName) === target
        );
        if (found) return found.id;
    }
    return target || (item.itemId || '__unknown__');
}

/**
 * Look up the on-hand quantity for an item across legacy keys (itemId,
 * name, hindiName) so we don't miss stock that's still bucketed under an
 * old key.
 *
 * @param {Object} catalogueEntry - resolved catalogue item or null
 * @param {string} fallbackName - the line item's name (for legacy buckets)
 * @returns {number} sum of stock quantities across known keys
 */
function lookupAvailable(catalogueEntry, fallbackName) {
    const stock = AppState.stock || {};
    let qty = 0;
    if (catalogueEntry?.id && stock[catalogueEntry.id]) {
        qty += stock[catalogueEntry.id].quantity || 0;
    }
    const nameKey = fallbackName || catalogueEntry?.name;
    if (nameKey && stock[nameKey]) {
        qty += stock[nameKey].quantity || 0;
    }
    if (catalogueEntry?.hindiName && stock[catalogueEntry.hindiName]) {
        qty += stock[catalogueEntry.hindiName].quantity || 0;
    }
    return qty;
}

/**
 * Find the catalogue entry corresponding to a line item, mirroring the
 * same id/name/hindiName precedence as resolveKey() so the two stay in
 * sync. Returns null if nothing matches.
 *
 * @param {Object} item - sale line item
 * @returns {Object | null}
 */
function findCatalogueEntry(item) {
    if (item.itemId) {
        const byId = AppState.items.find((i) => i.id === item.itemId);
        if (byId) return byId;
    }
    const target = normalize(item.name);
    if (!target) return null;
    return (
        AppState.items.find(
            (i) => normalize(i.name) === target || normalize(i.hindiName) === target
        ) || null
    );
}

/**
 * Compute per-item shortfalls for a list of sale items.
 *
 * @param {Array<{itemId?: string, name?: string, qty?: number, quantity?: number}>} saleItems
 * @returns {Array<{name: string, requested: number, available: number, shortfall: number}>}
 *   list of items whose requested quantity exceeds on-hand stock (empty if all fit)
 */
export function computeStockShortfalls(saleItems) {
    if (!Array.isArray(saleItems) || saleItems.length === 0) return [];

    // Aggregate requested quantity per canonical key. A bill may have
    // several line items for the same physical item (e.g. two weight
    // groups), so individual-line checks would miss the cumulative
    // overshoot.
    const requestedByKey = new Map();
    for (const item of saleItems) {
        const key = resolveKey(item);
        const qty = parseFloat(item.qty ?? item.quantity) || 0;
        const prev = requestedByKey.get(key);
        if (prev) {
            prev.requested += qty;
        } else {
            const catalogueEntry = findCatalogueEntry(item);
            requestedByKey.set(key, {
                key,
                name: item.name || catalogueEntry?.name || key,
                catalogueEntry,
                requested: qty,
            });
        }
    }

    const shortfalls = [];
    for (const row of requestedByKey.values()) {
        const available = lookupAvailable(row.catalogueEntry, row.name);
        if (row.requested > available + 1e-6) {
            shortfalls.push({
                name: row.name,
                requested: row.requested,
                available,
                shortfall: row.requested - available,
            });
        }
    }
    return shortfalls;
}

/**
 * Build a human-readable confirmation message describing all shortfalls.
 * Returns null when there are none.
 *
 * @param {ReturnType<typeof computeStockShortfalls>} shortfalls
 * @returns {string | null}
 */
export function formatShortfallMessage(shortfalls) {
    if (!shortfalls || shortfalls.length === 0) return null;
    const lines = shortfalls.map((s) => {
        const avail = s.available <= 0 ? '0' : s.available.toFixed(1);
        return `• ${s.name}: selling ${s.requested.toFixed(1)} kg, only ${avail} kg in stock (short ${s.shortfall.toFixed(1)} kg)`;
    });
    return (
        'This sale exceeds your recorded stock:\n\n' +
        lines.join('\n') +
        '\n\nSelling more than you have on record will push stock into negative ' +
        'and may distort future rate calculations. Continue anyway?'
    );
}
