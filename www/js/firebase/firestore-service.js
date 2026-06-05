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

        for (const ev of events) {
            if (ev.kind === 'purchase') {
                const key = getItemKey(ev.item);
                if (!stock[key]) stock[key] = { quantity: 0, rate: 0, totalValue: 0 };
                const qty = parseFloat(ev.item.qty || ev.item.quantity) || 0;
                const rate = parseFloat(ev.item.rate) || 0;
                stock[key].quantity += qty;
                stock[key].totalValue += qty * rate;
            } else if (ev.kind === 'sale') {
                const key = getItemKey(ev.item);
                // Create the entry on demand so a sale of an item that was
                // only ever introduced via a stock adjustment (or whose key
                // mismatched a purchase) is still reflected, instead of being
                // silently dropped and inflating displayed stock elsewhere.
                if (!stock[key]) stock[key] = { quantity: 0, rate: 0, totalValue: 0 };
                const qty = parseFloat(ev.item.qty || ev.item.quantity) || 0;
                const avgRate = stock[key].quantity > 0 ? stock[key].totalValue / stock[key].quantity : 0;
                stock[key].quantity -= qty;
                stock[key].totalValue -= qty * avgRate;
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
                    case 'add':
                        stock[key].quantity += adjQty;
                        if (adjRate > 0) {
                            stock[key].totalValue += adjQty * adjRate;
                        }
                        break;
                    case 'remove': {
                        // Reduce quantity but keep total value proportional so
                        // the weighted average rate is preserved.
                        const removalRatio = stock[key].quantity > 0 ? adjQty / stock[key].quantity : 0;
                        stock[key].quantity -= adjQty;
                        stock[key].totalValue -= stock[key].totalValue * removalRatio;
                        break;
                    }
                    case 'set': {
                        // For chronological replay we use the user-entered
                        // target quantity (adj.quantity) rather than the
                        // historical `newStock` snapshot — the snapshot was
                        // computed against the stock state at save time and is
                        // unreliable when later events have shifted things.
                        const newQty = adjQty;
                        if (adjRate > 0) {
                            stock[key].quantity = newQty;
                            stock[key].totalValue = newQty * adjRate;
                        } else {
                            const currentAvgRate = stock[key].quantity > 0 ? stock[key].totalValue / stock[key].quantity : 0;
                            stock[key].quantity = newQty;
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
     * Sets up real-time Firestore listeners for live data synchronization.
     * Listens to items, bills, sales, expenses, stock adjustments, and withdrawals.
     * Updates AppState and triggers render functions when data changes.
     * Uses window.app methods for proper module integration.
     * @returns {void}
     */
    setupRealtimeListeners() {
        // Clear any existing listeners first
        this.cleanup();

        // Listen to items collection
        const unsubItems = getDb().collection(col('items')).onSnapshot(snapshot => {
            AppState.items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Update item-related UI components
            if (window.app?.items?.render) {
                window.app.items.render();
            }
            if (window.app?.billing?.loadItemsDropdown) {
                window.app.billing.loadItemsDropdown();
            }
            if (window.app?.sales?.loadItemsDropdown) {
                window.app.sales.loadItemsDropdown();
            }
        }, error => {
            console.error('Items listener error:', error);
        });
        unsubscribeFunctions.push(unsubItems);
        
        // Listen to purchases collection (renamed from bills)
        const unsubPurchases = getDb().collection(col('purchases')).orderBy('date', 'desc').onSnapshot(async snapshot => {
            AppState.purchaseHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Recalculate stock when purchases change
            try {
                AppState.stock = await this.calculateStock();
            } catch (e) {
                console.error('Stock recalculation error:', e);
            }
            
            // Update billing dropdown (stock availability may have changed)
            if (window.app?.billing?.loadItemsDropdown) {
                window.app.billing.loadItemsDropdown();
            }
            if (window.app?.sales?.loadItemsDropdown) {
                window.app.sales.loadItemsDropdown();
            }
            
            // Update history view if visible
            if (window.app?.history?.render) {
                const historyTab = document.getElementById('history');
                if (historyTab && historyTab.style.display !== 'none') {
                    window.app.history.render();
                }
            }
            
            // Update outstanding dues
            if (window.app?.outstanding?.render) {
                const dueTab = document.getElementById('due');
                if (dueTab && dueTab.style.display !== 'none') {
                    window.app.outstanding.render();
                }
            }
            
            // Update stock view if visible
            if (window.app?.stock?.render) {
                const stockTab = document.getElementById('stock');
                if (stockTab && stockTab.style.display !== 'none') {
                    window.app.stock.render();
                }
            }
            
            // Update finance overview if visible
            if (window.app?.finance?.calculateOverview) {
                const financeTab = document.getElementById('finance');
                if (financeTab && financeTab.style.display !== 'none') {
                    window.app.finance.calculateOverview();
                }
            }
            
            // Update analytics if visible
            if (window.app?.analytics?.render) {
                const analyticsTab = document.getElementById('analytics');
                if (analyticsTab && analyticsTab.style.display !== 'none') {
                    window.app.analytics.render();
                }
            }
            
            // Update reports if visible
            if (window.app?.reports?.renderReports) {
                const reportsTab = document.getElementById('reports');
                if (reportsTab && reportsTab.style.display !== 'none') {
                    window.app.reports.renderReports();
                }
            }
        }, error => {
            console.error('Purchases listener error:', error);
        });
        unsubscribeFunctions.push(unsubPurchases);
        
        // Listen to retail sales collection
        const unsubRetailSales = getDb().collection(col('retailSales')).orderBy('date', 'desc').onSnapshot(async snapshot => {
            AppState.retailSalesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Recalculate stock when retail sales change
            try {
                AppState.stock = await this.calculateStock();
            } catch (e) {
                console.error('Stock recalculation error:', e);
            }
            
            // Update billing/sales dropdowns (stock availability changed)
            if (window.app?.billing?.loadItemsDropdown) {
                window.app.billing.loadItemsDropdown();
            }
            
            // Update history view if visible
            if (window.app?.history?.render) {
                const historyTab = document.getElementById('history');
                if (historyTab && historyTab.style.display !== 'none') {
                    window.app.history.render();
                }
            }
            
            // Update outstanding dues
            if (window.app?.outstanding?.render) {
                const dueTab = document.getElementById('due');
                if (dueTab && dueTab.style.display !== 'none') {
                    window.app.outstanding.render();
                }
            }
            
            // Update stock view if visible
            if (window.app?.stock?.render) {
                const stockTab = document.getElementById('stock');
                if (stockTab && stockTab.style.display !== 'none') {
                    window.app.stock.render();
                }
            }
            
            // Update finance overview if visible
            if (window.app?.finance?.calculateOverview) {
                const financeTab = document.getElementById('finance');
                if (financeTab && financeTab.style.display !== 'none') {
                    window.app.finance.calculateOverview();
                }
            }
            
            // Update analytics if visible
            if (window.app?.analytics?.render) {
                const analyticsTab = document.getElementById('analytics');
                if (analyticsTab && analyticsTab.style.display !== 'none') {
                    window.app.analytics.render();
                }
            }
            
            // Update reports if visible
            if (window.app?.reports?.renderReports) {
                const reportsTab = document.getElementById('reports');
                if (reportsTab && reportsTab.style.display !== 'none') {
                    window.app.reports.renderReports();
                }
            }
        }, error => {
            console.error('Retail sales listener error:', error);
        });
        unsubscribeFunctions.push(unsubRetailSales);
        
        // Listen to wholesale sales collection
        const unsubSales = getDb().collection(col('wholesaleSales')).orderBy('date', 'desc').onSnapshot(async snapshot => {
            AppState.salesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Recalculate stock when sales change
            try {
                AppState.stock = await this.calculateStock();
            } catch (e) {
                console.error('Stock recalculation error:', e);
            }
            
            // Update billing/sales dropdowns (stock availability changed)
            if (window.app?.billing?.loadItemsDropdown) {
                window.app.billing.loadItemsDropdown();
            }
            if (window.app?.sales?.loadItemsDropdown) {
                window.app.sales.loadItemsDropdown();
            }
            
            // Update wholesale sales tab if visible
            if (window.app?.wholesaleSales?.renderHistory) {
                const wholesaleTab = document.getElementById('wholesale-sales');
                if (wholesaleTab && wholesaleTab.style.display !== 'none') {
                    window.app.wholesaleSales.renderHistory();
                }
            }
            
            // Update history view if visible (sales tab)
            if (window.app?.history?.render) {
                const historyTab = document.getElementById('history');
                if (historyTab && historyTab.style.display !== 'none') {
                    window.app.history.render();
                }
            }
            
            // Update outstanding dues
            if (window.app?.outstanding?.render) {
                const dueTab = document.getElementById('due');
                if (dueTab && dueTab.style.display !== 'none') {
                    window.app.outstanding.render();
                }
            }
            
            // Update stock view if visible
            if (window.app?.stock?.render) {
                const stockTab = document.getElementById('stock');
                if (stockTab && stockTab.style.display !== 'none') {
                    window.app.stock.render();
                }
            }
            
            // Update finance overview if visible
            if (window.app?.finance?.calculateOverview) {
                const financeTab = document.getElementById('finance');
                if (financeTab && financeTab.style.display !== 'none') {
                    window.app.finance.calculateOverview();
                }
            }
            
            // Update analytics if visible
            if (window.app?.analytics?.render) {
                const analyticsTab = document.getElementById('analytics');
                if (analyticsTab && analyticsTab.style.display !== 'none') {
                    window.app.analytics.render();
                }
            }
            
            // Update reports if visible
            if (window.app?.reports?.renderReports) {
                const reportsTab = document.getElementById('reports');
                if (reportsTab && reportsTab.style.display !== 'none') {
                    window.app.reports.renderReports();
                }
            }
        }, error => {
            console.error('Sales listener error:', error);
        });
        unsubscribeFunctions.push(unsubSales);
        
        // Listen to expenses collection
        const unsubExpenses = getDb().collection(col('expenses')).orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.expensesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Update expenses view if visible
            if (window.app?.expenses?.renderHistory) {
                const expensesTab = document.getElementById('expenses');
                if (expensesTab && expensesTab.style.display !== 'none') {
                    window.app.expenses.renderHistory();
                }
            }
            
            // Update finance overview if visible
            if (window.app?.finance?.calculateOverview) {
                const financeTab = document.getElementById('finance');
                if (financeTab && financeTab.style.display !== 'none') {
                    window.app.finance.calculateOverview();
                }
            }
            
            // Update analytics if visible (expenses affect profit calculations)
            if (window.app?.analytics?.render) {
                const analyticsTab = document.getElementById('analytics');
                if (analyticsTab && analyticsTab.style.display !== 'none') {
                    window.app.analytics.render();
                }
            }
            
            // Update reports if visible
            if (window.app?.reports?.renderReports) {
                const reportsTab = document.getElementById('reports');
                if (reportsTab && reportsTab.style.display !== 'none') {
                    window.app.reports.renderReports();
                }
            }
        }, error => {
            console.error('Expenses listener error:', error);
        });
        unsubscribeFunctions.push(unsubExpenses);
        
        // Listen to stock adjustments collection
        const unsubStockAdj = getDb().collection(col('stockAdjustments')).orderBy('date', 'desc').onSnapshot(async snapshot => {
            AppState.stockAdjustments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Recalculate stock when adjustments change
            try {
                AppState.stock = await this.calculateStock();
            } catch (e) {
                console.error('Stock recalculation error:', e);
            }
            
            // Update stock adjustment history if visible
            if (window.app?.stock?.renderAdjustmentHistory) {
                const stockTab = document.getElementById('stock');
                if (stockTab && stockTab.style.display !== 'none') {
                    window.app.stock.renderAdjustmentHistory();
                    window.app.stock.render();
                }
            }
        }, error => {
            console.error('Stock adjustments listener error:', error);
        });
        unsubscribeFunctions.push(unsubStockAdj);
        
        // Listen to withdrawals collection
        const unsubWithdrawals = getDb().collection(col('withdrawals')).orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.withdrawalsHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Update finance view if visible
            if (window.app?.finance?.calculateOverview) {
                const financeTab = document.getElementById('finance');
                if (financeTab && financeTab.style.display !== 'none') {
                    window.app.finance.calculateOverview();
                }
            }
            if (window.app?.finance?.renderWithdrawalHistory) {
                const financeTab = document.getElementById('finance');
                if (financeTab && financeTab.style.display !== 'none') {
                    window.app.finance.renderWithdrawalHistory();
                }
            }
        }, error => {
            console.error('Withdrawals listener error:', error);
        });
        unsubscribeFunctions.push(unsubWithdrawals);
        
        // Listen to cash sessions collection
        const unsubCashSessions = getDb().collection(col('cashSessions')).orderBy('date', 'desc').onSnapshot(snapshot => {
            // Update cash management if visible
            if (window.app?.cashManagement?.init) {
                const cashTab = document.getElementById('cashManagement');
                if (cashTab && cashTab.style.display !== 'none') {
                    window.app.cashManagement.loadTodaySession();
                    window.app.cashManagement.renderHistory();
                }
            }
        }, error => {
            console.error('Cash sessions listener error:', error);
        });
        unsubscribeFunctions.push(unsubCashSessions);
        
        // Listen to users collection (for owner to see new registrations)
        const unsubUsers = getDb().collection(col('users')).orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            // Update users management view if visible (owner only)
            if (AppState.userRole === 'owner' && window.app?.users?.loadUsers) {
                const usersTab = document.getElementById('users');
                if (usersTab && usersTab.style.display !== 'none') {
                    window.app.users.loadUsers();
                }
            }
        }, error => {
            console.error('Users listener error:', error);
        });
        unsubscribeFunctions.push(unsubUsers);
        
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
            const usersSnapshot = await getDb().collection(col('users')).where('role', '==', 'owner').get();
            const ownerIds = usersSnapshot.docs.map(doc => doc.id);
            
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
            
            for (const ownerId of ownerIds) {
                await getDb().collection(col('notifications')).add({
                    ...notification,
                    userId: ownerId
                });
            }
        } catch (error) {
            console.error('Error notifying owners:', error);
        }
    },

    /**
     * Notifies all users when an item rate is changed.
     * Creates notification documents for all users in the notifications collection.
     * Note: Wholesale rate changes only notify owners/managers (staff can't see wholesale rates)
     * @async
     * @param {Object} item - The item with changed rate
     * @param {string} rateType - Type of rate ('purchase', 'sale', 'wholesale')
     * @param {number} oldRate - Previous rate value
     * @param {number} newRate - New rate value
     * @returns {Promise<void>}
     */
    async notifyRateChange(item, rateType, oldRate, newRate) {
        try {
            // Get users based on rate type
            // Wholesale rates are only visible to owners/managers, so don't notify staff
            let usersQuery;
            if (rateType === 'wholesale') {
                // Only notify owners and managers for wholesale rate changes
                const ownersSnapshot = await getDb().collection(col('users')).where('role', '==', 'owner').get();
                const managersSnapshot = await getDb().collection(col('users')).where('role', '==', 'manager').get();
                const userIds = [
                    ...ownersSnapshot.docs.map(doc => doc.id),
                    ...managersSnapshot.docs.map(doc => doc.id)
                ];
                usersQuery = { docs: userIds.map(id => ({ id })) };
            } else {
                // Notify all users for purchase and sale rate changes
                usersQuery = await getDb().collection(col('users')).get();
            }
            
            const userIds = usersQuery.docs ? usersQuery.docs.map(doc => doc.id) : [];
            
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
            
            console.log(`Notifying ${userIds.length} users about rate change, excluding current user: ${AppState.currentUser?.uid}`);
            
            // Notify all relevant users except the one who made the change
            let notifiedCount = 0;
            for (const userId of userIds) {
                if (userId !== AppState.currentUser?.uid) {
                    await getDb().collection(col('notifications')).add({
                        ...notification,
                        userId: userId
                    });
                    notifiedCount++;
                    console.log(`Notification saved for user: ${userId}`);
                }
            }
            
            console.log(`Rate change notification sent to ${notifiedCount} users: ${item.name} ${rateType} rate: ₹${oldRate} → ₹${newRate}`);
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
