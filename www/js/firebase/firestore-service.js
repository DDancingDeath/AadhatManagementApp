// -------------------- FIREBASE DATA OPERATIONS --------------------

import { AppState } from '../utils/state.js';
import { APP_CONFIG } from '../utils/constants.js';

// Get Firestore database reference
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

// Store unsubscribe functions for cleanup
const unsubscribeFunctions = [];

const FirebaseService = {
    // Get the database reference
    get db() {
        return getDb();
    },

    // Cleanup all listeners
    cleanup() {
        unsubscribeFunctions.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        unsubscribeFunctions.length = 0;
    },

    // Load items from Firestore
    async loadItems() {
        const snapshot = await getDb().collection('items').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save item to Firestore
    async saveItem(item) {
        if (item.id) {
            await getDb().collection('items').doc(item.id).set(item);
        } else {
            const docRef = await getDb().collection('items').add(item);
            item.id = docRef.id;
        }
        return item;
    },

    // Delete item from Firestore
    async deleteItem(itemId) {
        await getDb().collection('items').doc(itemId).delete();
    },

    // Load bills from Firestore
    async loadBills() {
        const snapshot = await getDb().collection('bills').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save bill to Firestore
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

    // Update bill in Firestore
    async updateBill(bill) {
        if (!bill.id) {
            throw new Error('Bill ID is required for update');
        }
        await getDb().collection('bills').doc(bill.id).set(bill);
        return bill;
    },

    // Delete bill from Firestore
    async deleteBill(billId) {
        await getDb().collection('bills').doc(billId).delete();
    },

    // Load sales from Firestore
    async loadSales() {
        const snapshot = await getDb().collection('sales').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save sale to Firestore
    async saveSale(sale) {
        if (!sale.userId && AppState.currentUser) {
            sale.userId = AppState.currentUser.uid;
        }
        if (!sale.userName && AppState.userName) {
            sale.userName = AppState.userName;
        }
        
        if (sale.id) {
            await getDb().collection('sales').doc(String(sale.id)).set(sale);
        } else {
            const docRef = await getDb().collection('sales').add(sale);
            sale.id = docRef.id;
        }
        return sale;
    },

    // Update sale in Firestore
    async updateSale(sale) {
        if (!sale.id) {
            throw new Error('Sale ID is required for update');
        }
        await getDb().collection('sales').doc(String(sale.id)).set(sale);
        return sale;
    },

    // Save retail sale to Firestore
    async saveRetailSale(sale) {
        if (!sale.userId && AppState.currentUser) {
            sale.userId = AppState.currentUser.uid;
        }
        if (!sale.userName && AppState.userName) {
            sale.userName = AppState.userName;
        }
        
        if (sale.id) {
            await getDb().collection('sales').doc(sale.id).set(sale);
        } else {
            const docRef = await getDb().collection('sales').add(sale);
            sale.id = docRef.id;
        }
        return sale;
    },

    // Load payments from Firestore
    async loadPayments() {
        const snapshot = await getDb().collection('payments').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save payment to Firestore
    async savePayment(payment) {
        if (!payment.userId && AppState.currentUser) {
            payment.userId = AppState.currentUser.uid;
        }
        if (!payment.userName && AppState.userName) {
            payment.userName = AppState.userName;
        }
        
        const docRef = await getDb().collection('payments').add(payment);
        return { id: docRef.id, ...payment };
    },

    // Delete payment from Firestore
    async deletePayment(paymentId) {
        // Handle both old numeric IDs and new Firebase document IDs
        if (typeof paymentId === 'number' || !isNaN(Number(paymentId))) {
            // Old payment with numeric ID - query by id field
            const snapshot = await getDb().collection('payments').where('id', '==', Number(paymentId)).get();
            const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);
        } else {
            // New payment with Firebase document ID
            await getDb().collection('payments').doc(paymentId).delete();
        }
        
        // Update local state
        const index = AppState.paymentsHistory.findIndex(p => p.id == paymentId);
        if (index !== -1) {
            AppState.paymentsHistory.splice(index, 1);
        }
    },

    // Load stock adjustments from Firestore
    async loadStockAdjustments() {
        const snapshot = await getDb().collection('stockAdjustments').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save stock adjustment to Firestore
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

    // Load withdrawals from Firestore
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

    // Save withdrawal to Firestore
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

    // Calculate stock from all bills and sales
    async calculateStock() {
        const stock = {};
        
        // Helper function to get item key (use itemId if available, otherwise name)
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

    // Set up real-time listeners for live sync
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
        
        // Listen to sales collection
        const unsubSales = getDb().collection('sales').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.salesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderSalesHistory === 'function') {
                window.renderSalesHistory();
            }
            if (typeof window.renderSalesOutstanding === 'function') {
                window.renderSalesOutstanding();
            }
        });
        unsubscribeFunctions.push(unsubSales);
        
        // Listen to payments collection
        const unsubPayments = getDb().collection('payments').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.paymentsHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderPaymentsHistory === 'function') {
                window.renderPaymentsHistory();
            }
        });
        unsubscribeFunctions.push(unsubPayments);
        
        // Listen to stock adjustments collection
        const unsubStockAdj = getDb().collection('stockAdjustments').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.stockAdjustments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderAdjustmentHistory === 'function') {
                window.renderAdjustmentHistory();
            }
        });
        unsubscribeFunctions.push(unsubStockAdj);
    },

    // Notify owners of edits
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

    // Load withdrawals from Firestore (secondary method with timestamp order)
    async loadWithdrawalsByTimestamp() {
        const snapshot = await getDb().collection('withdrawals').orderBy('timestamp', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save withdrawal to Firestore (with additional user tracking)
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

    // Load cash sessions from Firestore
    async loadCashSessions() {
        const snapshot = await getDb().collection('cashManagement').orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save cash session to Firestore
    async saveCashSession(session) {
        if (session.id) {
            await getDb().collection('cashManagement').doc(session.id).set(session);
        } else {
            const docRef = await getDb().collection('cashManagement').add(session);
            session.id = docRef.id;
        }
        return session;
    },

    // Update cash session in Firestore
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
