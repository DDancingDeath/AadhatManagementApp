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

    // ---------- Bug #6: negative-stock cost basis corruption --------------
    //
    // When a sale exceeded the on-hand stock, the running quantity went
    // negative and `avgRate` was clamped to 0 (the conditional in the sale
    // branch). That clamp left `totalValue` accumulating new-purchase costs
    // without ever being decremented by sales — so when later purchases
    // brought the quantity back above zero, the displayed rate was many
    // multiples of the actual cost per kg.
    //
    // The fix treats a negative running quantity as zero cost basis: a
    // purchase that lifts the position back into positive territory uses
    // the purchase rate for the *excess* portion, and sales beyond on-hand
    // stock simply clamp totalValue to 0. The deficit portion is sunk cost.

    it('resets cost basis to 0 when a sale drives quantity below zero', async () => {
        AppState.purchaseHistory = [purchase(1000, 10, 20)];        // qty=10, val=200
        AppState.salesHistory    = [sale(2000, 25, 30)];            // oversold by 15
        AppState.purchaseHistory.push(purchase(3000, 5, 22));       // still in deficit

        const stock = await FirebaseService.calculateStock();

        // After the oversale: qty=-15, totalValue=0 (clamped).
        // Subsequent purchase of 5 keeps qty negative (-10) so cost basis
        // stays at 0 — rate must be 0, not inflated by the new purchase.
        expect(stock[ITEM.id].quantity).toBe(-10);
        expect(stock[ITEM.id].rate).toBe(0);
    });

    it('rebases cost basis on the purchase that brings stock back from negative', async () => {
        // Reproduces the Gehu pattern: oversell, dribble of small purchases
        // while still negative, then a large purchase that brings the
        // position back into positive territory. Pre-fix the running rate
        // was distorted to ~4× the actual purchase rate.
        AppState.purchaseHistory = [
            purchase(1000, 10, 24),    // qty=10
            purchase(3000, 5, 24),     // still negative after the sale below
            purchase(5000, 100, 23.5)  // brings position back positive
        ];
        AppState.salesHistory = [sale(2000, 60, 26)]; // oversell — qty=-50

        const stock = await FirebaseService.calculateStock();

        // Chronological replay:
        //   t=1000 purchase 10 @ 24 -> qty=10,  val=240
        //   t=2000 sale     60 @avg -> qty=-50, val=0      (clamped)
        //   t=3000 purchase  5 @ 24 -> qty=-45, val=0      (still in deficit)
        //   t=5000 purchase 100 @ 23.5 -> prevQty=-45, newQty=55
        //                                 -> val = 55 * 23.5 = 1292.5
        // The on-hand 55 kg's cost basis = the rate of the purchase that
        // brought it positive (23.5), NOT the polluted historical average.
        expect(stock[ITEM.id].quantity).toBe(55);
        expect(stock[ITEM.id].rate).toBeCloseTo(23.5, 5);
    });

    it('preserves the new cost basis as further normal purchases are added on top', async () => {
        // After the deficit-fill rebase, normal weighted-average accumulation
        // resumes — the next purchase must blend with the rebased basis,
        // not the historical pre-deficit cost.
        AppState.purchaseHistory = [
            purchase(1000, 10, 20),
            purchase(3000, 50, 30),    // brings stock from -40 to 10 @ basis 30
            purchase(4000, 10, 40)     // normal accumulation: (10*30 + 10*40) / 20 = 35
        ];
        AppState.salesHistory = [sale(2000, 50, 25)]; // oversell

        const stock = await FirebaseService.calculateStock();

        // Replay:
        //   t=1000 +10 @ 20   -> qty=10,  val=200
        //   t=2000 -50 @avg=20 -> qty=-40, val=0   (clamped)
        //   t=3000 +50 @ 30   -> qty=10,  val=300  (rebased: 10*30)
        //   t=4000 +10 @ 40   -> qty=20,  val=700  (normal: 300+400)
        // Rate = 700 / 20 = 35.
        expect(stock[ITEM.id].quantity).toBe(20);
        expect(stock[ITEM.id].rate).toBeCloseTo(35, 5);
    });

    it('clamps cost basis to 0 when a sale exactly equals the on-hand stock', async () => {
        // Edge case: sale brings stock to exactly 0. totalValue should also
        // be 0, and a follow-up purchase must establish a fresh basis.
        AppState.purchaseHistory = [purchase(1000, 10, 24), purchase(3000, 5, 30)];
        AppState.salesHistory    = [sale(2000, 10, 26)];

        const stock = await FirebaseService.calculateStock();

        // t=1000 +10 @ 24 -> qty=10, val=240
        // t=2000 -10 @ 24 -> qty=0,  val=0
        // t=3000 +5  @ 30 -> qty=5,  val=150 (rebased)
        expect(stock[ITEM.id].quantity).toBe(5);
        expect(stock[ITEM.id].rate).toBeCloseTo(30, 5);
    });

    it('does not let multiple consecutive oversales corrupt the cost basis', async () => {
        // Mirrors the user's data: many oversales in succession while in
        // deficit, then a large purchase that recovers. The final rate must
        // equal the recovery purchase rate, regardless of how many oversales
        // accumulated in between.
        AppState.purchaseHistory = [
            purchase(1000, 50, 24),
            purchase(8000, 200, 23.5)   // recovery
        ];
        AppState.salesHistory = [
            sale(2000, 100, 28),         // oversell #1
            sale(3000, 50, 28),          // oversell #2 (still negative)
            sale(4000, 80, 28),          // oversell #3
            sale(5000, 20, 28)           // oversell #4 — qty deeply negative
        ];

        const stock = await FirebaseService.calculateStock();

        // Net quantity: 50 + 200 - (100+50+80+20) = 250 - 250 = 0.
        // Stock is exactly 0 — totalValue=0, rate=0.
        expect(stock[ITEM.id].quantity).toBe(0);
        expect(stock[ITEM.id].rate).toBe(0);
    });

    it('handles a positive add-adjustment that fills a deficit', async () => {
        // An `add` adjustment that lifts a negative position into the
        // positive should rebase like a purchase does.
        AppState.purchaseHistory = [purchase(1000, 10, 20)];
        AppState.salesHistory    = [sale(2000, 30, 25)]; // qty=-20
        AppState.stockAdjustments = [
            {
                id: 'adj_lift',
                timestamp: 3000,
                date: new Date(3000).toLocaleString('en-IN'),
                itemId: ITEM.id,
                itemName: ITEM.name,
                adjustType: 'add',
                quantity: 50,           // -20 + 50 = 30 net
                rate: 22
            }
        ];

        const stock = await FirebaseService.calculateStock();

        // Replay: qty=10 -> -20 (oversell, val=0) -> +50 @ 22 lifts to 30.
        // Excess (30) carries cost basis of 30*22 = 660 -> rate 22.
        expect(stock[ITEM.id].quantity).toBe(30);
        expect(stock[ITEM.id].rate).toBeCloseTo(22, 5);
    });
});
