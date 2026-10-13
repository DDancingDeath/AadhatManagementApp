/**
 * @fileoverview Firebase Firestore Service Module
 * Provides all database operations for the Aadhat Management App.
 * Handles CRUD operations for items, bills, sales, expenses, stock, and cash management.
 * @module firebase/firestore-service
 */

// -------------------- FIREBASE DATA OPERATIONS --------------------

import { AppState } from '../utils/state.js';
import { APP_CONFIG } from '../utils/constants.js';
import { Helpers } from '../utils/helpers.js';

/**
 * Gets the Firestore database reference.
 * Attempts to get firebase.firestore() first, falls back to global db.
 * @returns {firebase.firestore.Firestore} The Firestore database instance
 * @throws {Error} If Firestore is not initialized
 * @private
 */
const getDb = () => {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        return firebase.firestore();
    }
    // Fallback to global db if available
    if (typeof db !== 'undefined') {
        return db;
    }
    throw new Error('Firestore not initialized');
};

/**
 * Gets the prefixed collection name based on environment.
 * In development: 'items' -> 'dev_items'
 * In production: 'items' -> 'items'
 * @param {string} name - The base collection name
 * @returns {string} The prefixed collection name
 * @private
 */
const col = (name) => {
    const prefix = window.COLLECTION_PREFIX || '';
    return prefix + name;
};

/** @type {Function[]} Array of unsubscribe functions for real-time listeners */
const unsubscribeFunctions = [];

/** @type {Array<{resolve: Function}>} First-snapshot waiters of active listeners */
const pendingFirstSnapshots = [];

/**
 * Incremented whenever a listener changes AppState data. Used to decide
 * whether a previously computed stock object is still current.
 * @type {number}
 */
let dataVersion = 0;

/** @type {{stock?: Object, version?: number}} Last stock computed by getStock() */
let stockCache = {};

const defaultMapDoc = (doc) => ({ id: doc.id, ...doc.data() });

/**
 * Applies a query snapshot to a listener's private, ordered document list.
 * The first snapshot maps every document; later snapshots only deserialize
 * the changed documents (docChanges indices are defined relative to the
 * list with all prior changes applied, so sequential splicing reproduces
 * snapshot.docs order exactly).
 * @param {{docs: Object[], initialized: boolean}} live
 * @param {firebase.firestore.QuerySnapshot} snapshot
 * @returns {boolean} true if the data changed
 * @private
 */
const applySnapshot = (live, snapshot) => {
    if (!live.initialized) {
        live.docs = snapshot.docs.map(defaultMapDoc);
        live.initialized = true;
        return true;
    }
    const changes = snapshot.docChanges();
    if (changes.length === 0) return false;
    changes.forEach(change => {
        if (change.oldIndex !== -1) live.docs.splice(change.oldIndex, 1);
        if (change.newIndex !== -1) live.docs.splice(change.newIndex, 0, defaultMapDoc(change.doc));
    });
    if (live.docs.length !== snapshot.size) {
        live.docs = snapshot.docs.map(defaultMapDoc);
    }
    return true;
};

const isTabActive = (tabId) => !!document.getElementById(tabId)?.classList.contains('active');

/**
 * Views refreshed after data changes. `tab` is the tab the view lives in
 * (null = always refresh). Views in hidden tabs stay pending until that
 * tab is shown.
 * @private
 */
const VIEWS = {
    itemsList: { tab: null, run: () => window.app?.items?.render?.() },
    billingDropdown: { tab: 'billing', run: () => window.app?.billing?.loadItemsDropdown?.() },
    salesDropdown: { tab: 'wholesale-sales', run: () => window.app?.sales?.loadItemsDropdown?.() },
    wholesaleHistory: { tab: 'wholesale-sales', run: () => window.app?.wholesaleSales?.renderHistory?.() },
    history: { tab: 'history', run: () => window.app?.history?.render?.() },
    due: { tab: 'due', run: () => window.app?.outstanding?.render?.() },
    stockAdjustmentHistory: { tab: 'stock', run: () => window.app?.stock?.renderAdjustmentHistory?.() },
    stockView: { tab: 'stock', run: () => window.app?.stock?.render?.() },
    expensesHistory: { tab: 'expenses', run: () => window.app?.expenses?.renderHistory?.() },
    financeOverview: { tab: 'finance', run: () => window.app?.finance?.calculateOverview?.() },
    financeWithdrawals: { tab: 'finance', run: () => window.app?.finance?.renderWithdrawalHistory?.() },
    analytics: { tab: 'analytics', run: () => window.app?.analytics?.render?.() },
    reports: { tab: 'reports', run: () => window.app?.reports?.renderReports?.() }
};

/** Debounce window that coalesces bursts of snapshot events (ms). */
const RENDER_DEBOUNCE_MS = 150;

/** Max wait for server data at startup once cached data is available (ms). */
const FIRST_SNAPSHOT_SERVER_WAIT_MS = 10000;
const pendingViews = new Set();
let stockDirty = false;
let flushTimer = null;

const runView = (name) => {
    try {
        VIEWS[name].run();
    } catch (e) {
        console.error(`View refresh error (${name}):`, e);
    }
};

const runPendingViews = (shouldRun) => {
    for (const name of [...pendingViews]) {
        if (!shouldRun(VIEWS[name])) continue;
        pendingViews.delete(name);
        runView(name);
    }
};

const flushPendingWork = async () => {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (stockDirty) {
        stockDirty = false;
        try {
            await FirebaseService.getStock();
        } catch (e) {
            console.error('Stock recalculation error:', e);
        }
    }
    runPendingViews(view => !view.tab || isTabActive(view.tab));
};

const scheduleFlush = () => {
    if (!flushTimer) {
        flushTimer = setTimeout(flushPendingWork, RENDER_DEBOUNCE_MS);
    }
};

const markDirty = (views, affectsStock) => {
    views.forEach(v => pendingViews.add(v));
    if (affectsStock) stockDirty = true;
    scheduleFlush();
};

// Refresh views that went stale while their tab was hidden.
if (typeof window !== 'undefined') {
    window.addEventListener('aadhat:tabshown', (event) => {
        const tabId = event.detail?.tabId;
        if ([...pendingViews].some(name => VIEWS[name].tab === tabId)) {
            // Run now (not debounced) so the tab never shows stale data.
            flushPendingWork();
        }
    });
}

/** Users list cache for notification fan-out (avoids a query per edit). */
const USERS_CACHE_TTL_MS = 10 * 60 * 1000;
let usersCache = null;

const getUsersForNotifications = async () => {
    if (usersCache && Date.now() - usersCache.at < USERS_CACHE_TTL_MS) {
        return usersCache.users;
    }
    const snapshot = await getDb().collection(col('users')).get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, role: doc.data().role }));
    usersCache = { at: Date.now(), users };
    return users;
};

/** Writes one notification per user id using batched writes. */
const writeNotifications = async (userIds, notification) => {
    const db = getDb();
    const ref = db.collection(col('notifications'));
    for (let i = 0; i < userIds.length; i += 450) {
        const batch = db.batch();
        userIds.slice(i, i + 450).forEach(userId => {
            batch.set(ref.doc(), { ...notification, userId });
        });
        await batch.commit();
    }
};

/**
 * Firebase Service object containing all database operations.
 * Provides methods for CRUD operations on all collections.
 * @namespace FirebaseService
 */
const FirebaseService = {
    /**
     * Gets the Firestore database reference.
     * @type {firebase.firestore.Firestore}
     */
    get db() {
        return getDb();
    },

    /**
     * Cleans up all active real-time listeners.
     * Should be called when user logs out or app is destroyed.
     * @returns {void}
     */
    cleanup() {
        unsubscribeFunctions.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        unsubscribeFunctions.length = 0;
        pendingFirstSnapshots.forEach(settle => settle.resolve());
        pendingFirstSnapshots.length = 0;
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        pendingViews.clear();
        stockDirty = false;
        stockCache = {};
        dataVersion++;
    },

    /**
     * Loads all items from Firestore.
     * @async
     * @returns {Promise<Array<{id: string, name: string, hindiName?: string, rate?: number}>>} Array of item objects
     */
    async loadItems() {
        const snapshot = await getDb().collection(col('items')).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves an item to Firestore. Creates new if no ID, updates if ID exists.
     * @async
     * @param {Object} item - The item to save
     * @param {string} [item.id] - Item ID (if updating existing)
     * @param {string} item.name - Item name
     * @param {string} [item.hindiName] - Item name in Hindi
     * @param {number} [item.rate] - Default rate for the item
     * @returns {Promise<Object>} The saved item with ID
     */
    async saveItem(item) {
        if (item.id) {
            await getDb().collection(col('items')).doc(item.id).set(item);
        } else {
            const docRef = await getDb().collection(col('items')).add(item);
            item.id = docRef.id;
        }
        return item;
    },

    /**
     * Deletes an item from Firestore.
     * @async
     * @param {string} itemId - The ID of the item to delete
     * @returns {Promise<void>}
     */
    async deleteItem(itemId) {
        await getDb().collection(col('items')).doc(itemId).delete();
    },

    /**
     * Loads all purchases from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of purchase objects
     */
    async loadPurchases() {
        const snapshot = await getDb().collection(col('purchases')).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves a purchase to Firestore. Creates new if no ID, updates if ID exists.
     * Automatically adds userId and userName from AppState.
     * @async
     * @param {Object} purchase - The purchase to save
     * @param {string} [purchase.id] - Purchase ID (if updating existing)
     * @param {string} purchase.partyName - Party/customer name
     * @param {string} purchase.date - Purchase date
     * @param {Array} purchase.items - Array of purchase items
     * @param {number} purchase.total - Total purchase amount
     * @returns {Promise<Object>} The saved purchase with ID
     */
    async savePurchase(purchase) {
        if (!purchase.userId && AppState.currentUser) {
            purchase.userId = AppState.currentUser.uid;
        }
        if (!purchase.userName && AppState.userName) {
            purchase.userName = AppState.userName;
        }
        
        if (purchase.id) {
            await getDb().collection(col('purchases')).doc(purchase.id).set(purchase);
        } else {
            const docRef = await getDb().collection(col('purchases')).add(purchase);
            purchase.id = docRef.id;
        }
        return purchase;
    },

    /**
     * Updates an existing purchase in Firestore.
     * @async
     * @param {Object} purchase - The purchase to update
     * @param {string} purchase.id - Purchase ID (required)
     * @returns {Promise<Object>} The updated purchase
     * @throws {Error} If purchase.id is not provided
     */
    async updatePurchase(purchase) {
        if (!purchase.id) {
            throw new Error('Purchase ID is required for update');
        }
        await getDb().collection(col('purchases')).doc(purchase.id).set(purchase);
        return purchase;
    },

    /**
     * Deletes a purchase from Firestore.
     * @async
     * @param {string} purchaseId - The ID of the purchase to delete
     * @returns {Promise<void>}
     */
    async deletePurchase(purchaseId) {
        await getDb().collection(col('purchases')).doc(purchaseId).delete();
    },

    /**
     * Loads all wholesale sales from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of sale objects
     */
    async loadSales() {
        const snapshot = await getDb().collection(col('wholesaleSales')).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves a wholesale sale to Firestore. Creates new if no ID, updates if ID exists.
     * @async
     * @param {Object} sale - The sale to save
     * @param {string} [sale.id] - Sale ID (if updating existing)
     * @param {string} sale.partyName - Party/customer name
     * @param {string} sale.date - Sale date
     * @param {Array} sale.items - Array of sale items
     * @param {number} sale.total - Total sale amount
     * @returns {Promise<Object>} The saved sale with ID
     */
    async saveWholesaleSale(sale) {
        if (!sale.userId && AppState.currentUser) {
            sale.userId = AppState.currentUser.uid;
        }
        if (!sale.userName && AppState.userName) {
            sale.userName = AppState.userName;
        }
        
        if (sale.id) {
            await getDb().collection(col('wholesaleSales')).doc(String(sale.id)).set(sale);
        } else {
            const docRef = await getDb().collection(col('wholesaleSales')).add(sale);
            sale.id = docRef.id;
        }
        return sale;
    },

    /**
     * Updates an existing wholesale sale in Firestore.
     * @async
     * @param {Object} sale - The sale to update
     * @param {string} sale.id - Sale ID (required)
     * @returns {Promise<Object>} The updated sale
     * @throws {Error} If sale.id is not provided
     */
    async updateWholesaleSale(sale) {
        if (!sale.id) {
            throw new Error('Sale ID is required for update');
        }
        await getDb().collection(col('wholesaleSales')).doc(String(sale.id)).set(sale);
        return sale;
    },

    /**
     * Saves a retail sale to Firestore. Uses separate retailSales collection.
     * @async
     * @param {Object} sale - The retail sale to save
     * @param {string} [sale.id] - Sale ID (if updating existing)
     * @param {string} sale.customerName - Customer name
     * @param {string} sale.date - Sale date
     * @param {Array} sale.items - Array of sale items
     * @param {number} sale.total - Total sale amount
     * @returns {Promise<Object>} The saved sale with ID
     */
    async saveRetailSale(sale) {
        if (!sale.userId && AppState.currentUser) {
            sale.userId = AppState.currentUser.uid;
        }
        if (!sale.userName && AppState.userName) {
            sale.userName = AppState.userName;
        }
        
        if (sale.id) {
            await getDb().collection(col('retailSales')).doc(String(sale.id)).set(sale);
        } else {
            const docRef = await getDb().collection(col('retailSales')).add(sale);
            sale.id = docRef.id;
        }
        return sale;
    },

    /**
     * Loads all retail sales from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of retail sale objects
     */
    async loadRetailSales() {
        const snapshot = await getDb().collection(col('retailSales')).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Updates an existing retail sale in Firestore.
     * @async
     * @param {Object} sale - The sale to update
     * @param {string} sale.id - Sale ID (required)
     * @returns {Promise<Object>} The updated sale
     * @throws {Error} If sale.id is not provided
     */
    async updateRetailSale(sale) {
        if (!sale.id) {
            throw new Error('Sale ID is required for update');
        }
        await getDb().collection(col('retailSales')).doc(String(sale.id)).set(sale);
        return sale;
    },

    /**
     * Deletes a retail sale from Firestore.
     * @async
     * @param {string} saleId - The ID of the sale to delete
     * @returns {Promise<void>}
     */
    async deleteRetailSale(saleId) {
        await getDb().collection(col('retailSales')).doc(String(saleId)).delete();
    },

    /**
     * Deletes a wholesale sale from Firestore.
     * @async
     * @param {string} saleId - The ID of the sale to delete
     * @returns {Promise<void>}
     */
    async deleteWholesaleSale(saleId) {
        await getDb().collection(col('wholesaleSales')).doc(String(saleId)).delete();
    },

    /**
     * Loads all expenses from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of expense objects
     */
    async loadExpenses() {
        const snapshot = await getDb().collection(col('expenses')).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves an expense to Firestore.
     * @async
     * @param {Object} expense - The expense to save
     * @param {string} expense.description - Expense description
     * @param {number} expense.amount - Expense amount
     * @param {string} expense.date - Expense date
     * @param {string} [expense.category] - Expense category
     * @returns {Promise<Object>} The saved expense with ID
     */
    async saveExpense(expense) {
        if (!expense.userId && AppState.currentUser) {
            expense.userId = AppState.currentUser.uid;
        }
        if (!expense.userName && AppState.userName) {
            expense.userName = AppState.userName;
        }
        
        const docRef = await getDb().collection(col('expenses')).add(expense);
        return { id: docRef.id, ...expense };
    },

    /**
     * Deletes an expense from Firestore.
     * Handles both old numeric IDs and new Firebase document IDs.
     * Also updates local AppState.expensesHistory.
     * @async
     * @param {string|number} expenseId - The ID of the expense to delete
     * @returns {Promise<void>}
     */
    async deleteExpense(expenseId) {
        // Handle both old numeric IDs and new Firebase document IDs
        if (typeof expenseId === 'number' || !isNaN(Number(expenseId))) {
            // Old expense with numeric ID - query by id field
            const snapshot = await getDb().collection(col('expenses')).where('id', '==', Number(expenseId)).get();
            const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);
        } else {
            // New expense with Firebase document ID
            await getDb().collection(col('expenses')).doc(expenseId).delete();
        }
        
        // Update local state
        const index = AppState.expensesHistory.findIndex(e => e.id == expenseId);
        if (index !== -1) {
            AppState.expensesHistory.splice(index, 1);
        }
    },

    /**
     * Loads all stock adjustments from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of stock adjustment objects
     */
    async loadStockAdjustments() {
        const snapshot = await getDb().collection(col('stockAdjustments')).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves a stock adjustment to Firestore.
     * @async
     * @param {Object} adjustment - The stock adjustment to save
     * @param {string} adjustment.itemId - ID of the item being adjusted
     * @param {string} adjustment.adjustType - Type of adjustment ('add', 'remove', 'set')
     * @param {number} adjustment.quantity - Adjustment quantity
     * @param {number} [adjustment.rate] - Rate for the adjustment
     * @param {string} adjustment.date - Adjustment date
     * @param {string} [adjustment.reason] - Reason for adjustment
     * @returns {Promise<Object>} The saved adjustment with ID
     */
    async saveStockAdjustment(adjustment) {
        if (!adjustment.userId && AppState.currentUser) {
            adjustment.userId = AppState.currentUser.uid;
        }
        if (!adjustment.userName && AppState.userName) {
            adjustment.userName = AppState.userName;
        }
        
        const docRef = await getDb().collection(col('stockAdjustments')).add(adjustment);
        return { id: docRef.id, ...adjustment };
    },

    /**
     * Loads all withdrawals from Firestore, ordered by date descending.
     * Converts Firestore Timestamp to JavaScript Date objects.
     * @async
     * @returns {Promise<Array<Object>>} Array of withdrawal objects
     */
    async loadWithdrawals() {
        try {
            const snapshot = await getDb().collection(col('withdrawals')).orderBy('date', 'desc').get();
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    date: data.date?.toDate?.() || new Date(data.date)
                };
            });
        } catch (error) {
            console.error('Error loading withdrawals:', error);
            return [];
        }
    },

    /**
     * Saves a withdrawal to Firestore.
     * @async
     * @param {Object} withdrawal - The withdrawal to save
     * @param {number} withdrawal.amount - Withdrawal amount
     * @param {string} withdrawal.date - Withdrawal date
     * @param {string} [withdrawal.description] - Description of withdrawal
     * @returns {Promise<Object>} The saved withdrawal with ID
     */
    async saveWithdrawal(withdrawal) {
        if (!withdrawal.userId && AppState.currentUser) {
            withdrawal.userId = AppState.currentUser.uid;
        }
        if (!withdrawal.userName && AppState.userName) {
            withdrawal.userName = AppState.userName;
        }
        
        const docRef = await getDb().collection(col('withdrawals')).add(withdrawal);
        return { id: docRef.id, ...withdrawal };
    },

    /**
     * Calculates current stock levels from all purchases, sales, and adjustments.
     *
     * Events from every source (purchases, wholesale sales, retail sales, stock
     * adjustments) are merged into a single timeline and applied in strict
     * chronological order. This is critical because:
     *   1. Stock adjustments are loaded `orderBy('date','desc')`, so iterating
     *      them in array order applies the newest first — which inverts the
     *      meaning of any `set` adjustment whenever older `add`/`remove`
     *      adjustments exist.
     *   2. A `set` adjustment is a calibration point at a moment in time. If we
     *      re-apply *all* purchases/sales and then overwrite with `adj.newStock`
     *      (a stale snapshot of stock at the moment the adjustment was saved),
     *      every purchase/sale recorded after the adjustment is silently lost.
     *
     * Sorting all events chronologically and applying them in order resolves
     * both problems: a `set` becomes the running stock at its timestamp, and
     * later events adjust from that point.
     *
     * @async
     * @returns {Promise<Object.<string, {quantity: number, rate: number}>>} Stock object keyed by item ID
     */
    async calculateStock() {
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
        // Lookup tables built once per call (O(I)) instead of scanning
        // AppState.items for every event (O(E*I)). Both maps keep the FIRST
        // catalogue entry in array order, matching Array.prototype.find.
        const catalogueIds = new Set();
        const idByName = new Map();
        (AppState.items || []).forEach(i => {
            catalogueIds.add(i.id);
            const n = normalize(i.name);
            if (!idByName.has(n)) idByName.set(n, i.id);
            const h = normalize(i.hindiName);
            if (!idByName.has(h)) idByName.set(h, i.id);
        });
        const getItemKey = (item) => {
            if (item.itemId) {
                if (catalogueIds.has(item.itemId)) return item.itemId;
                // itemId points to a deleted catalogue entry — fall through to
                // name matching rather than orphaning the bucket under a stale id.
            }
            const target = normalize(item.name);
            if (target && idByName.has(target)) {
                return idByName.get(target);
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
    },

    /**
     * Returns the cached stock when it was computed from the current listener
     * data (and nobody has replaced AppState.stock since); otherwise
     * recalculates it, stores it in AppState.stock and returns it.
     * @async
     * @returns {Promise<Object.<string, {quantity: number, rate: number}>>}
     */
    async getStock() {
        if (unsubscribeFunctions.length > 0 && stockCache.stock && stockCache.stock === AppState.stock && stockCache.version === dataVersion) {
            return AppState.stock;
        }
        const version = dataVersion;
        const stock = await this.calculateStock();
        AppState.stock = stock;
        stockCache = { stock, version };
        return stock;
    },

    /**
     * Sets up real-time Firestore listeners for live data synchronization.
     * Listens to items, bills, sales, expenses, stock adjustments, and withdrawals.
     *
     * The first snapshot of each listener populates AppState, so startup does
     * not need a separate full-collection .get() (which would read every
     * document twice). Later snapshots apply only docChanges() and schedule a
     * single debounced stock recalculation + re-render of the visible tab.
     *
     * @returns {Promise<void>} Resolves once every data listener has delivered
     *   its first snapshot; rejects if a required listener fails before that.
     */
    setupRealtimeListeners() {
        // Clear any existing listeners first
        this.cleanup();

        const firstSnapshots = [];
        const listen = (query, stateKey, label, { views = [], immediateViews = [], affectsStock = false, optional = false } = {}) => {
            const live = { docs: [], initialized: false };
            let settle;
            firstSnapshots.push(new Promise((resolve, reject) => { settle = { resolve, reject }; }));
            // If listeners are torn down before the first snapshot (e.g. logout
            // during startup), don't leave startup waiting forever.
            pendingFirstSnapshots.push(settle);
            // Startup waits for server-confirmed data (like the former .get()),
            // falling back to the offline cache when offline or the server is slow.
            let ready = false;
            let readyTimer = null;
            const markReady = () => {
                if (ready) return;
                ready = true;
                clearTimeout(readyTimer);
                settle.resolve();
            };
            // includeMetadataChanges so the cache -> server transition is seen
            // even when the cached data was already up to date.
            const unsubscribe = query.onSnapshot({ includeMetadataChanges: true }, snapshot => {
                const changed = applySnapshot(live, snapshot);
                if (changed) {
                    AppState[stateKey] = live.docs.slice();
                    dataVersion++;
                }
                if (!ready) {
                    // Startup computes stock and renders the initial views itself.
                    if (!snapshot.metadata.fromCache || navigator.onLine === false) {
                        markReady();
                    } else if (!readyTimer) {
                        readyTimer = setTimeout(markReady, FIRST_SNAPSHOT_SERVER_WAIT_MS);
                    }
                    return;
                }
                if (!changed) return;
                // Index-based views (item dropdown values, item cards) must
                // never lag behind AppState.items, so refresh them right away.
                immediateViews.forEach(name => {
                    pendingViews.delete(name);
                    runView(name);
                });
                markDirty(views, affectsStock);
            }, error => {
                console.error(`${label} listener error:`, error);
                clearTimeout(readyTimer);
                if (!ready) {
                    ready = true;
                    if (optional) {
                        AppState[stateKey] = [];
                        settle.resolve();
                    } else {
                        settle.reject(error);
                    }
                }
            });
            unsubscribeFunctions.push(unsubscribe);
        };

        const db = getDb();
        listen(db.collection(col('items')), 'items', 'Items', {
            immediateViews: ['itemsList', 'billingDropdown', 'salesDropdown'],
            affectsStock: true
        });
        listen(db.collection(col('purchases')).orderBy('date', 'desc'), 'purchaseHistory', 'Purchases', {
            views: ['billingDropdown', 'salesDropdown', 'history', 'due', 'stockView', 'financeOverview', 'analytics', 'reports'],
            affectsStock: true
        });
        listen(db.collection(col('retailSales')).orderBy('date', 'desc'), 'retailSalesHistory', 'Retail sales', {
            views: ['billingDropdown', 'history', 'due', 'stockView', 'financeOverview', 'analytics', 'reports'],
            affectsStock: true
        });
        listen(db.collection(col('wholesaleSales')).orderBy('date', 'desc'), 'salesHistory', 'Sales', {
            views: ['billingDropdown', 'salesDropdown', 'wholesaleHistory', 'history', 'due', 'stockView', 'financeOverview', 'analytics', 'reports'],
            affectsStock: true
        });
        listen(db.collection(col('expenses')).orderBy('date', 'desc'), 'expensesHistory', 'Expenses', {
            views: ['expensesHistory', 'financeOverview', 'analytics', 'reports']
        });
        listen(db.collection(col('stockAdjustments')).orderBy('date', 'desc'), 'stockAdjustments', 'Stock adjustments', {
            views: ['stockAdjustmentHistory', 'stockView'],
            affectsStock: true
        });
        listen(db.collection(col('withdrawals')).orderBy('date', 'desc'), 'withdrawalsHistory', 'Withdrawals', {
            views: ['financeOverview', 'financeWithdrawals'],
            optional: true
        });

        // Note: the former `cashSessions` and `users` listeners were removed.
        // Their callbacks targeted a non-existent element id / app method and
        // never did anything, yet each re-read its whole collection on every
        // app open.
        
        // Listen to notifications for current user (rate changes, etc.)
        if (AppState.currentUser?.uid) {
            // Listen to global item frequency changes to update dropdown order in real-time
            const unsubItemFrequency = getDb().collection(col('itemFrequency')).doc('global').onSnapshot(doc => {
                if (doc.exists && window.app?.billing) {
                    // Update the billing manager's item frequency data
                    window.app.billing.billingManager?.itemFrequency && 
                        Object.assign(window.app.billing.billingManager.itemFrequency, doc.data());
                    
                    // Reload dropdowns to reflect new order
                    if (window.app.billing.loadItemsDropdown) {
                        window.app.billing.loadItemsDropdown();
                    }
                    if (window.app.billing.loadSaleItemsDropdown) {
                        window.app.billing.loadSaleItemsDropdown();
                    }
                    if (window.app.sales?.loadItemsDropdown) {
                        window.app.sales.loadItemsDropdown();
                    }
                }
            }, error => {
                console.error('Item frequency listener error:', error);
            });
            unsubscribeFunctions.push(unsubItemFrequency);
            
            console.log('Setting up notifications listener for user:', AppState.currentUser.uid);
            
            const unsubNotifications = getDb().collection(col('notifications'))
                .where('userId', '==', AppState.currentUser.uid)
                .where('read', '==', false)
                .orderBy('timestamp', 'desc')
                .limit(10)
                .onSnapshot(snapshot => {
                    console.log('Notifications snapshot received, changes:', snapshot.docChanges().length);
                    snapshot.docChanges().forEach(change => {
                        console.log('Notification change type:', change.type, change.doc.data());
                        if (change.type === 'added') {
                            const notification = change.doc.data();
                            // Show toast for rate change notifications
                            if (notification.type === 'rate_change') {
                                const itemName = notification.itemHindiName || notification.itemName;
                                const message = `${itemName} ${notification.rateTypeLabel} rate: ₹${notification.oldRate} → ₹${notification.newRate} (by ${notification.changedBy})`;
                                console.log('Showing rate change toast:', message);
                                UIManager.showToast(message, 5000);
                                
                                // Mark as read after showing
                                getDb().collection(col('notifications')).doc(change.doc.id).update({ read: true });
                            }
                        }
                    });
                }, error => {
                    console.error('Notifications listener error:', error);
                });
            unsubscribeFunctions.push(unsubNotifications);
        } else {
            console.warn('No currentUser.uid, skipping notifications listener');
        }

        return Promise.all(firstSnapshots).then(() => undefined);
    },

    /**
     * Notifies all owner users when a document is edited.
     * Creates notification documents for each owner in the notifications collection.
     * @async
     * @param {string} type - Type of document edited (e.g., 'bill', 'sale')
     * @param {string} docId - ID of the edited document
     * @param {Object} oldData - Original data before edit
     * @param {Object} newData - New data after edit
     * @returns {Promise<void>}
     */
    async notifyOwnersOfEdit(type, docId, oldData, newData) {
        try {
            const users = await getUsersForNotifications();
            const ownerIds = users.filter(u => u.role === 'owner').map(u => u.id);
            
            const notification = {
                type: 'edit',
                documentType: type,
                documentId: docId,
                oldData: oldData,
                newData: newData,
                editedBy: AppState.userName,
                editedByUserId: AppState.currentUser?.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            };
            
            await writeNotifications(ownerIds, notification);
        } catch (error) {
            console.error('Error notifying owners:', error);
        }
    },

    /**
     * Notifies all users when an item rate is changed.
     * Creates notification documents for all users in the notifications collection.
     * Note: Wholesale rate changes only notify owners/managers (staff can't see wholesale rates)
     * Callers need not await this; it never rejects.
     * @async
     * @param {Object} item - The item with changed rate
     * @param {string} rateType - Type of rate ('purchase', 'sale', 'wholesale')
     * @param {number} oldRate - Previous rate value
     * @param {number} newRate - New rate value
     * @returns {Promise<void>}
     */
    async notifyRateChange(item, rateType, oldRate, newRate) {
        try {
            // Wholesale rates are only visible to owners/managers, so don't notify staff
            const users = await getUsersForNotifications();
            const recipients = rateType === 'wholesale'
                ? users.filter(u => u.role === 'owner' || u.role === 'manager')
                : users;
            
            const rateTypeLabels = {
                'purchase': 'Purchase',
                'sale': 'Sale', 
                'wholesale': 'Wholesale'
            };
            
            const notification = {
                type: 'rate_change',
                itemId: item.id,
                itemName: item.name,
                itemHindiName: item.hindiName || '',
                rateType: rateType,
                rateTypeLabel: rateTypeLabels[rateType] || rateType,
                oldRate: oldRate,
                newRate: newRate,
                changedBy: AppState.userName || 'Unknown',
                changedByUserId: AppState.currentUser?.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            };
            
            // Notify all relevant users except the one who made the change
            const userIds = recipients.map(u => u.id).filter(id => id !== AppState.currentUser?.uid);
            await writeNotifications(userIds, notification);
            
            console.log(`Rate change notification sent to ${userIds.length} users: ${item.name} ${rateType} rate: ₹${oldRate} → ₹${newRate}`);
        } catch (error) {
            console.error('Error notifying rate change:', error);
        }
    },

    /**
     * Loads withdrawals from Firestore ordered by timestamp (secondary method).
     * @async
     * @returns {Promise<Array<Object>>} Array of withdrawal objects
     */
    async loadWithdrawalsByTimestamp() {
        const snapshot = await getDb().collection(col('withdrawals')).orderBy('timestamp', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves a withdrawal with additional tracking information.
     * Adds withdrawnBy and withdrawnByName fields for audit trail.
     * @async
     * @param {Object} withdrawal - The withdrawal to save
     * @param {number} withdrawal.amount - Withdrawal amount
     * @param {string} withdrawal.date - Withdrawal date
     * @returns {Promise<Object>} The saved withdrawal with ID and tracking info
     */
    async saveWithdrawalWithTracking(withdrawal) {
        if (!withdrawal.userId && AppState.currentUser) {
            withdrawal.userId = AppState.currentUser.uid;
        }
        if (!withdrawal.withdrawnBy && AppState.currentUser) {
            withdrawal.withdrawnBy = AppState.currentUser.uid;
        }
        if (!withdrawal.withdrawnByName && AppState.userName) {
            withdrawal.withdrawnByName = AppState.userName;
        }
        
        const docRef = await getDb().collection(col('withdrawals')).add(withdrawal);
        return { id: docRef.id, ...withdrawal };
    },

    /**
     * Loads all cash management sessions from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of cash session objects
     */
    async loadCashSessions() {
        const snapshot = await getDb().collection(col('cashManagement')).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves a cash management session to Firestore.
     * @async
     * @param {Object} session - The cash session to save
     * @param {string} [session.id] - Session ID (if updating existing)
     * @param {string} session.date - Session date
     * @param {number} session.openingCash - Opening cash amount
     * @param {number} [session.closingCash] - Closing cash amount
     * @returns {Promise<Object>} The saved session with ID
     */
    async saveCashSession(session) {
        if (session.id) {
            await getDb().collection(col('cashManagement')).doc(session.id).set(session);
        } else {
            const docRef = await getDb().collection(col('cashManagement')).add(session);
            session.id = docRef.id;
        }
        return session;
    },

    /**
     * Updates an existing cash management session in Firestore.
     * @async
     * @param {Object} session - The session to update
     * @param {string} session.id - Session ID (required)
     * @returns {Promise<Object>} The updated session
     * @throws {Error} If session.id is not provided
     */
    async updateCashSession(session) {
        if (!session.id) {
            throw new Error('Session ID is required for update');
        }
        await getDb().collection(col('cashManagement')).doc(session.id).set(session);
        return session;
    }
};

// Export FirebaseService and cleanup function
export { FirebaseService };
