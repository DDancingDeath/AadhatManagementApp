// -------------------- FIREBASE DATA OPERATIONS --------------------

import { AppState } from '../utils/state.js';

const FirebaseService = {
    // Load items from Firestore
    async loadItems() {
        const snapshot = await db.collection('items').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Save item to Firestore
    async saveItem(item) {
        if (item.id) {
            await db.collection('items').doc(item.id).set(item);
        } else {
            const docRef = await db.collection('items').add(item);
            item.id = docRef.id;
        }
        return item;
    },

    // Delete item from Firestore
    async deleteItem(itemId) {
        await db.collection('items').doc(itemId).delete();
    },

    // Load bills from Firestore
    async loadBills() {
        const snapshot = await db.collection('bills').orderBy('date', 'desc').get();
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
            await db.collection('bills').doc(bill.id).set(bill);
        } else {
            const docRef = await db.collection('bills').add(bill);
            bill.id = docRef.id;
        }
        return bill;
    },

    // Delete bill from Firestore
    async deleteBill(billId) {
        await db.collection('bills').doc(billId).delete();
    },

    // Load sales from Firestore
    async loadSales() {
        const snapshot = await db.collection('sales').orderBy('date', 'desc').get();
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
            await db.collection('sales').doc(sale.id).set(sale);
        } else {
            const docRef = await db.collection('sales').add(sale);
            sale.id = docRef.id;
        }
        return sale;
    },

    // Load payments from Firestore
    async loadPayments() {
        const snapshot = await db.collection('payments').orderBy('date', 'desc').get();
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
        
        const docRef = await db.collection('payments').add(payment);
        return { id: docRef.id, ...payment };
    },

    // Load stock adjustments from Firestore
    async loadStockAdjustments() {
        const snapshot = await db.collection('stockAdjustments').orderBy('date', 'desc').get();
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
        
        const docRef = await db.collection('stockAdjustments').add(adjustment);
        return { id: docRef.id, ...adjustment };
    },

    // Load withdrawals from Firestore
    async loadWithdrawals() {
        try {
            const snapshot = await db.collection('withdrawals').orderBy('date', 'desc').get();
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
        
        const docRef = await db.collection('withdrawals').add(withdrawal);
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
                        stock[key].quantity -= qty;
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
                
                // Apply the adjustment based on type
                switch (adj.adjustType) {
                    case 'add':
                        stock[key].quantity += parseFloat(adj.quantity) || 0;
                        break;
                    case 'remove':
                        stock[key].quantity -= parseFloat(adj.quantity) || 0;
                        break;
                    case 'set':
                        // For 'set' type, we need to set to the newStock value if available
                        if (adj.newStock !== undefined) {
                            stock[key].quantity = parseFloat(adj.newStock) || 0;
                        } else {
                            stock[key].quantity = parseFloat(adj.quantity) || 0;
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
        // Listen to items collection
        db.collection('items').onSnapshot(snapshot => {
            AppState.items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderItems === 'function') {
                window.renderItems();
            }
            if (typeof window.loadItemsDropdown === 'function') {
                window.loadItemsDropdown();
            }
        });
        
        // Listen to bills collection
        db.collection('bills').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.billHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderHistory === 'function') {
                window.renderHistory();
            }
            if (typeof window.renderDue === 'function') {
                window.renderDue();
            }
        });
        
        // Listen to sales collection
        db.collection('sales').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.salesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderSalesHistory === 'function') {
                window.renderSalesHistory();
            }
            if (typeof window.renderSalesOutstanding === 'function') {
                window.renderSalesOutstanding();
            }
        });
        
        // Listen to payments collection
        db.collection('payments').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.paymentsHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderPaymentsHistory === 'function') {
                window.renderPaymentsHistory();
            }
        });
        
        // Listen to stock adjustments collection
        db.collection('stockAdjustments').orderBy('date', 'desc').onSnapshot(snapshot => {
            AppState.stockAdjustments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (typeof window.renderAdjustmentHistory === 'function') {
                window.renderAdjustmentHistory();
            }
        });
    },

    // Notify owners of edits
    async notifyOwnersOfEdit(type, docId, oldData, newData) {
        try {
            const usersSnapshot = await db.collection('users').where('role', '==', 'owner').get();
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
                await db.collection('notifications').add({
                    ...notification,
                    userId: ownerId
                });
            }
        } catch (error) {
            console.error('Error notifying owners:', error);
        }
    }
};

// Export FirebaseService
export { FirebaseService };
