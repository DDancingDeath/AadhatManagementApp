/**
 * @fileoverview Equivalence test for the Map-based catalogue lookup in
 * FirebaseService.calculateStock.
 *
 * `referenceCalculateStock` below is a verbatim copy of calculateStock as of
 * cba680c (which scanned AppState.items with Array.find for every event).
 * The optimized implementation must return identical results on a large,
 * messy synthetic dataset: duplicate names, hindi-name matches, casing and
 * whitespace variants, deleted itemIds, unknown names, all adjustment types,
 * numeric/Timestamp/string dates.
 */

import { FirebaseService } from '../firebase/firestore-service.js';
import { AppState } from '../utils/state.js';
import { Helpers } from '../utils/helpers.js';

// ---- Reference implementation (copied from cba680c, do not modify) ----
async function referenceCalculateStock() {
    const stock = {};

    /**
     * Helper function to get item key. Resolves to a canonical catalogue id
     * whenever possible. Falls back to a case-insensitive, whitespace-trimmed
     * comparison against `name` and `hindiName` so legacy records that don't
     * carry an `itemId` (or whose stored name differs only in casing or
     * surrounding whitespace) still collapse to the same bucket as their
     * canonical counterpart.
     *
     * @param {Object} item - Item from bill/sale
     * @returns {string} Item key for stock lookup
     */
    const normalize = (s) => (s == null ? '' : String(s).trim().toLowerCase());
    const getItemKey = (item) => {
        if (item.itemId) {
            const foundItem = AppState.items.find(i => i.id === item.itemId);
            if (foundItem) return foundItem.id;
            // itemId points to a deleted catalogue entry — fall through to
            // name matching rather than orphaning the bucket under a stale id.
        }
        const target = normalize(item.name);
        if (target) {
            const foundItem = AppState.items.find(i =>
                normalize(i.name) === target || normalize(i.hindiName) === target
            );
            if (foundItem) return foundItem.id;
        }
        // Last resort: bucket under a normalized name so different casings
        // of the same legacy item still merge together.
        return target || (item.itemId || '__unknown__');
    };

    /**
     * Resolve a sortable timestamp (ms since epoch) for a record. Prefers
     * the numeric `timestamp` field when present, then a Firestore Timestamp
     * with `.toMillis()`, then the human-readable `date` string parsed via
     * Helpers.parseDate. Records with no resolvable time are pushed to the
     * end of the timeline so they don't corrupt the ordering of dated events.
     */
    const eventTime = (record) => {
        if (typeof record.timestamp === 'number') return record.timestamp;
        if (record.timestamp && typeof record.timestamp.toMillis === 'function') {
            return record.timestamp.toMillis();
        }
        const parsed = Helpers.parseDate(record.date);
        return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
    };

    // Build a single chronological event timeline. Each purchase/sale doc
    // may contain multiple line items; the parent doc's timestamp applies
    // to all of them.
    const events = [];

    AppState.purchaseHistory.forEach(purchase => {
        if (!Array.isArray(purchase.items)) return;
        const t = eventTime(purchase);
        purchase.items.forEach(item => events.push({ t, kind: 'purchase', item }));
    });

    AppState.salesHistory.forEach(sale => {
        if (!Array.isArray(sale.items)) return;
        const t = eventTime(sale);
        sale.items.forEach(item => events.push({ t, kind: 'sale', item }));
    });

    AppState.retailSalesHistory.forEach(sale => {
        if (!Array.isArray(sale.items)) return;
        const t = eventTime(sale);
        sale.items.forEach(item => events.push({ t, kind: 'sale', item }));
    });

    AppState.stockAdjustments.forEach(adj => {
        events.push({ t: eventTime(adj), kind: 'adjustment', adj });
    });

    // Ascending chronological order. Array.prototype.sort is stable in
    // modern JS engines, so ties keep their original insertion order.
    events.sort((a, b) => a.t - b.t);

    // `totalValue` represents the cost basis of the stock *currently on
    // hand*. When the running quantity drops to zero or below, the cost
    // basis of "on-hand" stock is zero by definition — we don't own any
    // of the goods, so there is no carrying cost to track. Without this
    // discipline, the running average rate becomes nonsensical: a sale
    // that exceeds available stock leaves `totalValue` artificially high
    // (because `avgRate` is clamped to 0 once `quantity <= 0`, so the
    // sale subtracts nothing), and subsequent purchases pile their full
    // cost on top — yielding rates many times the actual purchase price.
    //
    // The rules below clamp `totalValue` to 0 whenever the running
    // quantity is at or below zero, and treat a purchase that lifts a
    // negative position back into positive territory as "filling the
    // deficit" first (sunk cost honoring an oversale) and contributing
    // only the *excess* portion to the new cost basis at the purchase
    // rate.
    for (const ev of events) {
        if (ev.kind === 'purchase') {
            const key = getItemKey(ev.item);
            if (!stock[key]) stock[key] = { quantity: 0, rate: 0, totalValue: 0 };
            const qty = parseFloat(ev.item.qty || ev.item.quantity) || 0;
            const rate = parseFloat(ev.item.rate) || 0;
            const prevQty = stock[key].quantity;
            const newQty = prevQty + qty;
            stock[key].quantity = newQty;
            if (newQty <= 0) {
                // Still in deficit (or back to exactly zero) after the
                // purchase — no on-hand value to carry.
                stock[key].totalValue = 0;
            } else if (prevQty < 0) {
                // Purchase fills the deficit and adds new stock; only
                // the excess (newQty) is on-hand inventory.
                stock[key].totalValue = newQty * rate;
            } else {
                // Normal: stock was already non-negative; accumulate.
                stock[key].totalValue += qty * rate;
            }
        } else if (ev.kind === 'sale') {
            const key = getItemKey(ev.item);
            // Create the entry on demand so a sale of an item that was
            // only ever introduced via a stock adjustment (or whose key
            // mismatched a purchase) is still reflected, instead of being
            // silently dropped and inflating displayed stock elsewhere.
            if (!stock[key]) stock[key] = { quantity: 0, rate: 0, totalValue: 0 };
            const qty = parseFloat(ev.item.qty || ev.item.quantity) || 0;
            const prevQty = stock[key].quantity;
            const avgRate = prevQty > 0 ? stock[key].totalValue / prevQty : 0;
            const newQty = prevQty - qty;
            stock[key].quantity = newQty;
            if (newQty <= 0) {
                // Sale equals or exceeds on-hand stock — no remaining
                // cost basis to carry forward.
                stock[key].totalValue = 0;
            } else {
                stock[key].totalValue -= qty * avgRate;
            }
        } else if (ev.kind === 'adjustment') {
            const adj = ev.adj;
            // Route the adjustment through the same canonical-id
            // resolution as purchases/sales. Using the raw `itemId`
            // or `itemName` here causes the adjustment to fragment into
            // its own bucket when the itemId points to a deleted
            // catalogue entry or when the stored itemName casing/
            // whitespace differs from the canonical version. Once
            // fragmented, later sales subtract from the purchase
            // bucket while the adjustment sits in its own bucket —
            // the displayed quantity (which renderStock re-merges by
            // catalogue match) is then over-stated by the size of the
            // adjustment.
            const key = getItemKey({ itemId: adj.itemId, name: adj.itemName });
            if (!key) continue;
            if (!stock[key]) stock[key] = { quantity: 0, rate: 0, totalValue: 0 };

            const adjQty = parseFloat(adj.quantity) || 0;
            const adjRate = parseFloat(adj.rate) || 0;

            switch (adj.adjustType) {
                case 'add': {
                    const prevQty = stock[key].quantity;
                    const newQty = prevQty + adjQty;
                    stock[key].quantity = newQty;
                    if (newQty <= 0) {
                        stock[key].totalValue = 0;
                    } else if (prevQty < 0) {
                        // Adjustment fills a deficit. If a rate was
                        // supplied, use it for the on-hand excess;
                        // otherwise we have no basis and the rate
                        // falls to 0.
                        stock[key].totalValue = adjRate > 0 ? newQty * adjRate : 0;
                    } else if (adjRate > 0) {
                        stock[key].totalValue += adjQty * adjRate;
                    }
                    // adjRate==0 with prevQty>=0: leave totalValue
                    // alone — the existing average rate is diluted
                    // across the larger quantity (preserves the
                    // historical behavior for rate-less add adjustments).
                    break;
                }
                case 'remove': {
                    // Reduce quantity but keep total value proportional so
                    // the weighted average rate is preserved.
                    const prevQty = stock[key].quantity;
                    const newQty = prevQty - adjQty;
                    stock[key].quantity = newQty;
                    if (newQty <= 0 || prevQty <= 0) {
                        stock[key].totalValue = 0;
                    } else {
                        const removalRatio = adjQty / prevQty;
                        stock[key].totalValue -= stock[key].totalValue * removalRatio;
                    }
                    break;
                }
                case 'set': {
                    // For chronological replay we use the user-entered
                    // target quantity (adj.quantity) rather than the
                    // historical `newStock` snapshot — the snapshot was
                    // computed against the stock state at save time and is
                    // unreliable when later events have shifted things.
                    const newQty = adjQty;
                    const prevQty = stock[key].quantity;
                    const prevTotal = stock[key].totalValue;
                    stock[key].quantity = newQty;
                    if (newQty <= 0) {
                        stock[key].totalValue = 0;
                    } else if (adjRate > 0) {
                        stock[key].totalValue = newQty * adjRate;
                    } else {
                        // No rate supplied — carry the previous average
                        // rate over to the new quantity. If we had no
                        // valid prior basis (negative or zero stock),
                        // the resulting rate is 0.
                        const currentAvgRate = prevQty > 0 && prevTotal > 0
                            ? prevTotal / prevQty
                            : 0;
                        stock[key].totalValue = newQty * currentAvgRate;
                    }
                    break;
                }
            }
        }
    }

    // Calculate average rates and clean up
    Object.keys(stock).forEach(itemName => {
        const s = stock[itemName];
        if (s.quantity > 0 && s.totalValue > 0) {
            s.rate = s.totalValue / s.quantity;
        } else {
            s.rate = 0;
        }
        // Remove totalValue as it's not needed in the final result
        delete s.totalValue;
    });

    return stock;
}
// ---- End of reference implementation ----

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function buildDataset(seed) {
    const rand = rng(seed);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

    const items = [];
    for (let i = 0; i < 60; i++) {
        items.push({ id: `item_${i}`, name: `Item ${i}`, hindiName: i % 3 === 0 ? `आइटम ${i}` : undefined });
    }
    // Duplicate names / hindi names across ids to exercise "first match wins".
    items.push({ id: 'dup_a', name: 'Item 5', hindiName: 'dup hindi' });
    items.push({ id: 'dup_b', name: 'Other', hindiName: 'item 7' });
    items.push({ id: 'dup_c', name: '  ITEM 9  ', hindiName: null });
    items.push({ id: 'no_name' });

    const lineName = () => {
        const it = pick(items);
        const variants = [
            it.name,
            it.hindiName,
            it.name && it.name.toUpperCase(),
            it.name && `  ${it.name}  `,
            'Legacy Unknown',
            '  legacy unknown ',
            '',
            undefined
        ];
        return { it, name: pick(variants) };
    };
    const lineItem = () => {
        const { it, name } = lineName();
        const idVariant = pick([it.id, it.id, 'deleted_item', undefined, '']);
        const qtyField = rand() < 0.5 ? 'qty' : 'quantity';
        return {
            itemId: idVariant,
            name,
            [qtyField]: pick([int(1, 50), String(int(1, 50)), '', 0, int(1, 50) + 0.5]),
            rate: pick([int(10, 100), String(int(10, 100)), undefined])
        };
    };
    const when = (i) => {
        const ts = 1700000000000 + i * 3600000 + int(0, 1000);
        const r = rand();
        if (r < 0.5) return { timestamp: ts, date: new Date(ts).toLocaleString('en-IN') };
        if (r < 0.7) return { timestamp: { toMillis: () => ts }, date: new Date(ts).toLocaleString('en-IN') };
        if (r < 0.9) return { date: new Date(ts).toLocaleString('en-IN') };
        return {};
    };
    const docs = (prefix, n) => Array.from({ length: n }, (_, i) => ({
        id: `${prefix}_${i}`,
        ...when(int(0, 2000)),
        items: rand() < 0.03 ? undefined : Array.from({ length: int(1, 6) }, lineItem)
    }));

    const purchaseHistory = docs('p', 700);
    const salesHistory = docs('s', 400);
    const retailSalesHistory = docs('r', 600);
    const stockAdjustments = Array.from({ length: 150 }, (_, i) => {
        const { it, name } = lineName();
        return {
            id: `adj_${i}`,
            ...when(int(0, 2000)),
            itemId: pick([it.id, 'deleted_item', null, undefined]),
            itemName: name,
            adjustType: pick(['add', 'remove', 'set', 'set', 'bogus']),
            quantity: pick([int(0, 80), String(int(0, 80)), undefined]),
            rate: pick([0, int(10, 100), undefined])
        };
    });
    return { items, purchaseHistory, salesHistory, retailSalesHistory, stockAdjustments };
}

describe('calculateStock - optimized lookup matches reference implementation', () => {
    const seeds = [1, 42, 1337, 20261013];

    it.each(seeds)('produces identical stock for synthetic dataset (seed %i)', async (seed) => {
        const data = buildDataset(seed);
        Object.assign(AppState, data);

        const expected = await referenceCalculateStock();
        const actual = await FirebaseService.calculateStock();

        expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
        expect(actual).toEqual(expected);
        expect(Object.keys(actual).length).toBeGreaterThan(20);
    });
});
