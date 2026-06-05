/**
 * @fileoverview Tests for FirebaseService.calculateStock chronological replay.
 *
 * These tests pin the two bugs that the stock page suffered from before the
 * refactor:
 *   - bug #1: stockAdjustments are loaded `orderBy('date','desc')`. Iterating
 *     them in array order applies the *newest* first, inverting the meaning of
 *     any `set` adjustment whenever older `add`/`remove` adjustments exist.
 *   - bug #2: a `set` adjustment used `adj.newStock` (a stale snapshot of stock
 *     at save time). After the snapshot, all later purchases/sales were
 *     re-applied first and then silently overwritten by the snapshot — every
 *     event recorded after the adjustment vanished from the displayed stock.
 *
 * They also cover a smaller fix:
 *   - bug #3: a sale whose key didn't match any purchase was silently dropped,
 *     so the displayed stock of a *different* item was incorrectly inflated.
 *     Sales now create the entry on demand.
 *
 * The test imports the real `FirebaseService` and shares the singleton
 * `AppState` module with the production code, so we exercise the exact code
 * path that runs in the browser.
 */

import { FirebaseService } from '../firebase/firestore-service.js';
import { AppState } from '../utils/state.js';

const ITEM = { id: 'item_piyar', name: 'piyar dana', hindiName: 'पियर दाना' };

/** Reset the slices of AppState that calculateStock reads. */
function resetState() {
    AppState.items = [ITEM];
    AppState.purchaseHistory = [];
    AppState.salesHistory = [];
    AppState.retailSalesHistory = [];
    AppState.stockAdjustments = [];
}

/** Build a purchase document with a single line item. */
function purchase(ts, qty, rate) {
    return {
        id: `purchase_${ts}`,
        timestamp: ts,
        date: new Date(ts).toLocaleString('en-IN'),
        items: [{ itemId: ITEM.id, name: ITEM.name, qty, rate }]
    };
}

/** Build a wholesale sale document with a single line item. */
function sale(ts, qty, rate) {
    return {
        id: `sale_${ts}`,
        timestamp: ts,
        date: new Date(ts).toLocaleString('en-IN'),
        items: [{ itemId: ITEM.id, name: ITEM.name, qty, rate }]
    };
}

/** Build a stock adjustment document. */
function adjustment(ts, adjustType, quantity, opts = {}) {
    return {
        id: `adj_${ts}`,
        timestamp: ts,
        date: new Date(ts).toLocaleString('en-IN'),
        itemId: ITEM.id,
        itemName: ITEM.name,
        adjustType,
        quantity,
        rate: opts.rate || 0,
        newStock: opts.newStock,
        reason: opts.reason || ''
    };
}

describe('FirebaseService.calculateStock - chronological replay', () => {
    beforeEach(() => {
        resetState();
    });

    it('sums simple purchases with weighted-average rate', async () => {
        AppState.purchaseHistory = [
            purchase(1000, 10, 100),
            purchase(2000, 10, 200)
        ];
        const stock = await FirebaseService.calculateStock();
        expect(stock[ITEM.id].quantity).toBe(20);
        expect(stock[ITEM.id].rate).toBeCloseTo(150);
    });

    it('subtracts sales using the running weighted-average rate', async () => {
        AppState.purchaseHistory = [purchase(1000, 10, 100), purchase(2000, 10, 200)];
        AppState.salesHistory = [sale(3000, 5, 250)];
        const stock = await FirebaseService.calculateStock();
        expect(stock[ITEM.id].quantity).toBe(15);
        // After 20kg @ avg 150, selling 5 at avg=150 leaves totalValue=2250 / 15 = 150
        expect(stock[ITEM.id].rate).toBeCloseTo(150);
    });

    // ---------- Bug #1 ----------------------------------------------------
    it('applies adjustments in chronological order even when stored newest-first', async () => {
        // Simulate the production load order: orderBy('date','desc')
        AppState.stockAdjustments = [
            adjustment(3000, 'set', 100),   // newest - last chronologically
            adjustment(2000, 'remove', 5),
            adjustment(1000, 'add', 50)     // oldest - first chronologically
        ];

        const stock = await FirebaseService.calculateStock();

        // Expected chronological replay:
        //   t=1000  add 50    -> 50
        //   t=2000  remove 5  -> 45
        //   t=3000  set 100   -> 100   (the user's last word)
        expect(stock[ITEM.id].quantity).toBe(100);
    });

    // ---------- Bug #2 ----------------------------------------------------
    it('preserves purchases recorded AFTER a set adjustment', async () => {
        AppState.stockAdjustments = [adjustment(2000, 'set', 20, { rate: 100 })];
        AppState.purchaseHistory = [purchase(3000, 5, 200)];

        const stock = await FirebaseService.calculateStock();

        // Replay:
        //   t=2000  set 20 @ 100  -> qty=20, value=2000
        //   t=3000  purchase 5 @ 200 -> qty=25, value=3000
        expect(stock[ITEM.id].quantity).toBe(25);
        expect(stock[ITEM.id].rate).toBeCloseTo(120);
    });

    it('uses adj.quantity (target) for set adjustments, not the stale newStock snapshot', async () => {
        // newStock snapshot says 999 but quantity (the user-entered target) is 50.
        // With purchases happening before, the production bug would have used
        // the snapshot. The fix uses adj.quantity.
        AppState.purchaseHistory = [purchase(1000, 10, 100)];
        AppState.stockAdjustments = [adjustment(2000, 'set', 50, { rate: 100, newStock: 999 })];

        const stock = await FirebaseService.calculateStock();

        expect(stock[ITEM.id].quantity).toBe(50);
    });

    it('handles set + later remove correctly', async () => {
        AppState.stockAdjustments = [
            adjustment(2000, 'remove', 5),   // newest first (DESC load order)
            adjustment(1000, 'set', 30, { rate: 100 })
        ];

        const stock = await FirebaseService.calculateStock();

        // t=1000 set 30, t=2000 remove 5 -> 25
        expect(stock[ITEM.id].quantity).toBe(25);
    });

    // ---------- Bug #3 ----------------------------------------------------
    it('creates a stock entry for sales of an item that was never purchased', async () => {
        AppState.salesHistory = [sale(1000, 5, 200)];
        const stock = await FirebaseService.calculateStock();
        // The entry is created so its negative balance is visible, instead of
        // being silently dropped (which previously caused other items'
        // displayed stock to look wrong).
        expect(stock[ITEM.id]).toBeDefined();
        expect(stock[ITEM.id].quantity).toBe(-5);
    });

    // ---------- Cross-source ordering ------------------------------------
    it('interleaves purchases, sales and adjustments in true chronological order', async () => {
        AppState.purchaseHistory = [purchase(1000, 10, 100), purchase(4000, 5, 300)];
        AppState.salesHistory = [sale(2000, 3, 150)];
        AppState.stockAdjustments = [
            adjustment(5000, 'remove', 2),       // newest - DESC load order
            adjustment(3000, 'set', 20, { rate: 200 })
        ];

        const stock = await FirebaseService.calculateStock();

        // Chronological replay:
        //   t=1000  purchase 10 @ 100  -> qty=10, value=1000
        //   t=2000  sale 3 @ avg(100)  -> qty=7,  value=700
        //   t=3000  set 20 @ 200       -> qty=20, value=4000
        //   t=4000  purchase 5 @ 300   -> qty=25, value=5500
        //   t=5000  remove 2 (5/25=20%)-> qty=23, value=5060
        expect(stock[ITEM.id].quantity).toBe(23);
        expect(stock[ITEM.id].rate).toBeCloseTo(220);
    });

    it('falls back to parsing the locale date string when timestamp is absent', async () => {
        // Two purchases with no numeric timestamp - only a parseable d/m/yyyy date.
        // First chronologically is the 1 Jan one even though the array lists Feb first.
        const p1 = { id: 'p1', date: '01/02/2026, 10:00:00 am', items: [{ itemId: ITEM.id, name: ITEM.name, qty: 5, rate: 200 }] };
        const p2 = { id: 'p2', date: '01/01/2026, 10:00:00 am', items: [{ itemId: ITEM.id, name: ITEM.name, qty: 5, rate: 100 }] };
        AppState.purchaseHistory = [p1, p2];

        const stock = await FirebaseService.calculateStock();
        expect(stock[ITEM.id].quantity).toBe(10);
        expect(stock[ITEM.id].rate).toBeCloseTo(150);
    });

    // ---------- Bug #4: case-insensitive name matching --------------------
    it('collapses legacy records without itemId to the same bucket regardless of name casing or whitespace', async () => {
        // A purchase using the canonical lower-case name + itemId, and a sale
        // recorded against the same item by legacy data that has no itemId and
        // a differently-cased / whitespace-padded name. Pre-fix, the sale was
        // bucketed under a separate orphan key ("Piyar Dana") and the purchase
        // bucket showed the full quantity uncorrected.
        AppState.purchaseHistory = [purchase(1000, 100, 200)];
        AppState.salesHistory = [
            {
                id: 'legacy_sale',
                timestamp: 2000,
                date: new Date(2000).toLocaleString('en-IN'),
                items: [{ name: '  Piyar Dana  ', qty: 30, rate: 250 }]
            }
        ];

        const stock = await FirebaseService.calculateStock();

        expect(stock[ITEM.id]).toBeDefined();
        expect(stock[ITEM.id].quantity).toBe(70);
        // No orphan bucket should exist under the legacy raw name.
        expect(stock['  Piyar Dana  ']).toBeUndefined();
        expect(stock['Piyar Dana']).toBeUndefined();
        expect(stock['piyar dana']).toBeUndefined();
    });

    it('matches by hindiName case-insensitively for legacy records without itemId', async () => {
        // The catalogue Hindi name is "पियर दाना" — exact match. Legacy data
        // commonly carries the same string with stray whitespace. Stripping +
        // case-folding should still produce a single canonical bucket.
        AppState.purchaseHistory = [purchase(1000, 50, 200)];
        AppState.salesHistory = [
            {
                id: 'legacy_sale_hindi',
                timestamp: 2000,
                date: new Date(2000).toLocaleString('en-IN'),
                items: [{ name: ' पियर दाना ', qty: 10, rate: 250 }]
            }
        ];

        const stock = await FirebaseService.calculateStock();
        expect(stock[ITEM.id].quantity).toBe(40);
    });

    // ---------- Bug #5: adjustment bucket fragmentation -------------------
    //
    // Purchases and sales go through `getItemKey()` which collapses to the
    // canonical catalogue id (case-insensitive name match, fallback for
    // deleted itemIds). Pre-fix, the adjustment branch used the raw
    // `adj.itemId || adj.itemName` as the bucket key. When an adjustment's
    // itemId pointed to a removed catalogue entry, or its itemName casing
    // differed from the canonical version, the adjustment landed in its own
    // bucket. Later sales subtracted from the purchase bucket while the
    // adjustment sat untouched in its own bucket — `renderStock` re-summed
    // the two buckets for display, over-stating stock by the size of the
    // adjustment.
    it('merges adjustments with stale itemId into the canonical bucket', async () => {
        // Adjustment carries a stale itemId that no longer exists in the
        // catalogue but its itemName matches the canonical item.
        AppState.purchaseHistory = [purchase(1000, 100, 200)];
        AppState.stockAdjustments = [
            {
                id: 'adj_stale',
                timestamp: 2000,
                date: new Date(2000).toLocaleString('en-IN'),
                itemId: 'old_deleted_item_id',
                itemName: ITEM.name,
                adjustType: 'set',
                quantity: 50,
                rate: 200
            }
        ];
        AppState.salesHistory = [sale(3000, 10, 250)];

        const stock = await FirebaseService.calculateStock();

        // Expected:
        //   t=1000  purchase 100 @ 200  -> qty=100
        //   t=2000  set      50  @ 200  -> qty=50
        //   t=3000  sale     10         -> qty=40
        expect(stock[ITEM.id]).toBeDefined();
        expect(stock[ITEM.id].quantity).toBe(40);
        // No fragment bucket should exist under the stale id.
        expect(stock.old_deleted_item_id).toBeUndefined();
    });

    it('merges adjustments with mismatched-casing itemName into the canonical bucket', async () => {
        // Adjustment has no itemId and its itemName casing differs from the
        // catalogue's canonical "piyar dana".
        AppState.purchaseHistory = [purchase(1000, 100, 200)];
        AppState.stockAdjustments = [
            {
                id: 'adj_case',
                timestamp: 2000,
                date: new Date(2000).toLocaleString('en-IN'),
                itemId: null,
                itemName: '  Piyar Dana  ',
                adjustType: 'add',
                quantity: 25,
                rate: 200
            }
        ];

        const stock = await FirebaseService.calculateStock();

        // Single canonical bucket, summed: 100 + 25 = 125
        expect(stock[ITEM.id].quantity).toBe(125);
        // No fragment under the raw stored name
        expect(stock['  Piyar Dana  ']).toBeUndefined();
        expect(stock['Piyar Dana']).toBeUndefined();
    });

    it('subtracts later sales from the same bucket a `set` adjustment writes to', async () => {
        // The original reported failure mode: adjustment fragmenting into
        // its own bucket so later sales don't reduce it. After the fix the
        // sale and the set adjustment share one bucket, and the displayed
        // stock reflects the sale.
        AppState.purchaseHistory = [purchase(1000, 100, 200)];
        AppState.stockAdjustments = [
            {
                id: 'adj_set',
                timestamp: 2000,
                date: new Date(2000).toLocaleString('en-IN'),
                itemId: null,                  // missing itemId
                itemName: 'PIYAR DANA',        // upper-case stored name
                adjustType: 'set',
                quantity: 50,
                rate: 200
            }
        ];
        AppState.salesHistory = [sale(3000, 20, 250)];

        const stock = await FirebaseService.calculateStock();

        // Expected chronologically:
        //   t=1000  purchase 100  -> qty=100
        //   t=2000  set     50    -> qty=50
        //   t=3000  sale    20    -> qty=30
        // Pre-fix this was 100 (purchase bucket: 100-20=80) + 50 (adjustment
        // bucket untouched) = 130 after renderStock merged them.
        expect(stock[ITEM.id].quantity).toBe(30);
    });
});
