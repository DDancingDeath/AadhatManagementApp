/**
 * @fileoverview Firebase Firestore Service Module
 * Provides all database operations for the Aadhat Management App.
 * Handles CRUD operations for items, bills, sales, expenses, stock, and cash management.
 * @module firebase/firestore-service
 */

// -------------------- FIREBASE DATA OPERATIONS --------------------

import { AppState } from '../utils/state.js';
import { APP_CONFIG } from '../utils/constants.js';

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
        const snapshot = await getDb().collection('items').get();
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
            await getDb().collection('items').doc(item.id).set(item);
        } else {
            const docRef = await getDb().collection('items').add(item);
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
        await getDb().collection('items').doc(itemId).delete();
    },

    /**
     * Loads all bills from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of bill objects
     */
    async loadBills() {
        const snapshot = await getDb().collection('bills').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Saves a bill to Firestore. Creates new if no ID, updates if ID exists.
     * Automatically adds userId and userName from AppState.
     * @async
     * @param {Object} bill - The bill to save
     * @param {string} [bill.id] - Bill ID (if updating existing)
     * @param {string} bill.partyName - Party/customer name
     * @param {string} bill.date - Bill date
     * @param {Array} bill.items - Array of bill items
     * @param {number} bill.total - Total bill amount
     * @returns {Promise<Object>} The saved bill with ID
     */
    async saveBill(bill) {
        if (!bill.userId && AppState.currentUser) {
            bill.userId = AppState.currentUser.uid;
        }
        if (!bill.userName && AppState.userName) {
            bill.userName = AppState.userName;
        }
        
        if (bill.id) {
            await getDb().collection('bills').doc(bill.id).set(bill);
        } else {
            const docRef = await getDb().collection('bills').add(bill);
            bill.id = docRef.id;
        }
        return bill;
    },

    /**
     * Updates an existing bill in Firestore.
     * @async
     * @param {Object} bill - The bill to update
     * @param {string} bill.id - Bill ID (required)
     * @returns {Promise<Object>} The updated bill
     * @throws {Error} If bill.id is not provided
     */
    async updateBill(bill) {
        if (!bill.id) {
            throw new Error('Bill ID is required for update');
        }
        await getDb().collection('bills').doc(bill.id).set(bill);
        return bill;
    },

    /**
     * Deletes a bill from Firestore.
     * @async
     * @param {string} billId - The ID of the bill to delete
     * @returns {Promise<void>}
     */
    async deleteBill(billId) {
        await getDb().collection('bills').doc(billId).delete();
    },

    /**
     * Loads all wholesale sales from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of sale objects
     */
    async loadSales() {
        const snapshot = await getDb().collection('wholesaleSales').orderBy('date', 'desc').get();
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
    async saveSale(sale) {
        if (!sale.userId && AppState.currentUser) {
            sale.userId = AppState.currentUser.uid;
        }
        if (!sale.userName && AppState.userName) {
            sale.userName = AppState.userName;
        }
        
        if (sale.id) {
            await getDb().collection('wholesaleSales').doc(String(sale.id)).set(sale);
        } else {
            const docRef = await getDb().collection('wholesaleSales').add(sale);
            sale.id = docRef.id;
        }
        return sale;
    },

    /**
     * Updates an existing sale in Firestore.
     * @async
     * @param {Object} sale - The sale to update
     * @param {string} sale.id - Sale ID (required)
     * @returns {Promise<Object>} The updated sale
     * @throws {Error} If sale.id is not provided
     */
    async updateSale(sale) {
        if (!sale.id) {
            throw new Error('Sale ID is required for update');
        }
        await getDb().collection('wholesaleSales').doc(String(sale.id)).set(sale);
        return sale;
    },

    /**
     * Saves a retail sale to Firestore. Uses wholesaleSales collection.
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
            await getDb().collection('wholesaleSales').doc(sale.id).set(sale);
        } else {
            const docRef = await getDb().collection('wholesaleSales').add(sale);
            sale.id = docRef.id;
        }
        return sale;
    },

    /**
     * Loads all expenses from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of expense objects
     */
    async loadExpenses() {
        const snapshot = await getDb().collection('expenses').orderBy('date', 'desc').get();
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
        
        const docRef = await getDb().collection('expenses').add(expense);
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
            const snapshot = await getDb().collection('expenses').where('id', '==', Number(expenseId)).get();
            const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);
        } else {
            // New expense with Firebase document ID
            await getDb().collection('expenses').doc(expenseId).delete();
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
        const snapshot = await getDb().collection('stockAdjustments').orderBy('date', 'desc').get();
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
        
        const docRef = await getDb().collection('stockAdjustments').add(adjustment);
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
            const snapshot = await getDb().collection('withdrawals').orderBy('date', 'desc').get();
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
        
        const docRef = await getDb().collection('withdrawals').add(withdrawal);
        return { id: docRef.id, ...withdrawal };
    },

    /**
     * Calculates current stock levels from all bills, sales, and adjustments.
     * Uses purchase bills to add stock, sales to subtract stock.
     * Applies stock adjustments (add, remove, set) to final values.
     * @async
     * @returns {Promise<Object.<string, {quantity: number, rate: number}>>} Stock object keyed by item ID
     */
    async calculateStock() {
        const stock = {};
        
        /**
         * Helper function to get item key (use itemId if available, otherwise name)
         * @param {Object} item - Item from bill/sale
         * @returns {string} Item key for stock lookup
         */
        const getItemKey = (item) => {
            if (item.itemId) {
                const foundItem = AppState.items.find(i => i.id === item.itemId);
                return foundItem ? foundItem.id : item.name;
            }
            // For old data without itemId, find by name
            const foundItem = AppState.items.find(i => i.name === item.name || i.hindiName === item.name);
            return foundItem ? foundItem.id : item.name;
        };
        
        // Add from purchases
        AppState.billHistory.forEach(bill => {
            if (bill.items && Array.isArray(bill.items)) {
                bill.items.forEach(item => {
                    const key = getItemKey(item);
                    if (!stock[key]) {
                        stock[key] = { quantity: 0, rate: 0, totalValue: 0 };
                    }
                    const qty = parseFloat(item.qty || item.quantity) || 0;
                    const rate = parseFloat(item.rate) || 0;
                    stock[key].quantity += qty;
                    stock[key].totalValue += qty * rate;
                });
            }
        });
        
        // Subtract from sales
        AppState.salesHistory.forEach(sale => {
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const key = getItemKey(item);
                    if (stock[key]) {
                        const qty = parseFloat(item.qty || item.quantity) || 0;
                        // Calculate the value to subtract based on average rate
                        const avgRate = stock[key].quantity > 0 ? stock[key].totalValue / stock[key].quantity : 0;
                        stock[key].quantity -= qty;
                        stock[key].totalValue -= qty * avgRate;
                    }
                });
            }
        });
        
        // Apply stock adjustments
        AppState.stockAdjustments.forEach(adj => {
            // Use itemId if available, otherwise fallback to itemName
            const key = adj.itemId || adj.itemName;
            if (key) {
                if (!stock[key]) {
                    stock[key] = { quantity: 0, rate: 0, totalValue: 0 };
                }
                
                const adjQty = parseFloat(adj.quantity) || 0;
                const adjRate = parseFloat(adj.rate) || 0;
                
                // Apply the adjustment based on type
                switch (adj.adjustType) {
                    case 'add':
                        stock[key].quantity += adjQty;
                        // Add the value of added stock to totalValue
                        if (adjRate > 0) {
                            stock[key].totalValue += adjQty * adjRate;
                        }
                        break;
                    case 'remove':
                        // When removing stock, reduce quantity but keep totalValue proportional
                        const removalRatio = stock[key].quantity > 0 ? adjQty / stock[key].quantity : 0;
                        stock[key].quantity -= adjQty;
                        stock[key].totalValue -= stock[key].totalValue * removalRatio;
                        break;
                    case 'set':
                        // For 'set' type, we need to set to the newStock value if available
                        const newQty = adj.newStock !== undefined ? parseFloat(adj.newStock) : adjQty;
                        if (adjRate > 0) {
                            // If rate is provided, recalculate totalValue
                            stock[key].quantity = newQty;
                            stock[key].totalValue = newQty * adjRate;
                        } else {
                            // If no rate, maintain the same average rate
                            const currentAvgRate = stock[key].quantity > 0 ? stock[key].totalValue / stock[key].quantity : 0;
                            stock[key].quantity = newQty;
                            stock[key].totalValue = newQty * currentAvgRate;
                        }
                        break;
                }
            }
        });
        
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
     * Listens to items, bills, sales, expenses, and stock adjustments collections.
     * Updates AppState and triggers render functions when data changes.
     * @returns {void}
     */
    setupRealtimeListeners() {
        // Clear any existing listeners first
        this.cleanup();

        // Listen to items collection
        const unsubItems = getDb().collection('items').onSnapshot(snapshot => {
            AppState.items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderItems === 'function') {
                window.renderItems();
            }
            if (typeof window.loadItemsDropdown === 'function') {
                window.loadItemsDropdown();
            }
        });
        unsubscribeFunctions.push(unsubItems);
        
        // Listen to bills collection
        const unsubBills = getDb().collection('bills').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.billHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderHistory === 'function') {
                window.renderHistory();
            }
            if (typeof window.renderDue === 'function') {
                window.renderDue();
            }
        });
        unsubscribeFunctions.push(unsubBills);
        
        // Listen to wholesale sales collection
        const unsubSales = getDb().collection('wholesaleSales').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.salesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderSalesHistory === 'function') {
                window.renderSalesHistory();
            }
            if (typeof window.renderSalesOutstanding === 'function') {
                window.renderSalesOutstanding();
            }
        });
        unsubscribeFunctions.push(unsubSales);
        
        // Listen to expenses collection
        const unsubExpenses = getDb().collection('expenses').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.expensesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderExpensesHistory === 'function') {
                window.renderExpensesHistory();
            }
        });
        unsubscribeFunctions.push(unsubExpenses);
        
        // Listen to stock adjustments collection
        const unsubStockAdj = getDb().collection('stockAdjustments').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.stockAdjustments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderAdjustmentHistory === 'function') {
                window.renderAdjustmentHistory();
            }
        });
        unsubscribeFunctions.push(unsubStockAdj);
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
            const usersSnapshot = await getDb().collection('users').where('role', '==', 'owner').get();
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
                await getDb().collection('notifications').add({
                    ...notification,
                    userId: ownerId
                });
            }
        } catch (error) {
            console.error('Error notifying owners:', error);
        }
    },

    /**
     * Loads withdrawals from Firestore ordered by timestamp (secondary method).
     * @async
     * @returns {Promise<Array<Object>>} Array of withdrawal objects
     */
    async loadWithdrawalsByTimestamp() {
        const snapshot = await getDb().collection('withdrawals').orderBy('timestamp', 'desc').get();
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
        
        const docRef = await getDb().collection('withdrawals').add(withdrawal);
        return { id: docRef.id, ...withdrawal };
    },

    /**
     * Loads all cash management sessions from Firestore, ordered by date descending.
     * @async
     * @returns {Promise<Array<Object>>} Array of cash session objects
     */
    async loadCashSessions() {
        const snapshot = await getDb().collection('cashManagement').orderBy('date', 'desc').get();
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
            await getDb().collection('cashManagement').doc(session.id).set(session);
        } else {
            const docRef = await getDb().collection('cashManagement').add(session);
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
        await getDb().collection('cashManagement').doc(session.id).set(session);
        return session;
    }
};

// Export FirebaseService and cleanup function
export { FirebaseService };
