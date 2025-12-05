// -------------------- MAIN APPLICATION INITIALIZATION --------------------

import { AppState } from './utils/state.js';
import { UIManager } from './ui/ui-manager.js';
import { NavigationManager } from './ui/navigation.js';
import { AuthManager } from './auth/authentication.js';
import { FirebaseService } from './firebase/firestore-service.js';
import { ItemsManager } from './modules/items.js';
import { PrinterService, printerManager } from './services/printer.js';
import { BillingManager } from './modules/billing.js';

// Global error handlers for debugging
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    UIManager.showToast('An error occurred. Check console for details.');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
});

// Setup event listeners
function setupEventListeners() {
    // Overlay click to close menu
    const overlay = document.querySelector('.overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            NavigationManager.toggleMenu();
        });
    }
    
    // Modal buttons
    const modalCancel = document.getElementById('modalCancel');
    const modalConfirm = document.getElementById('modalConfirm');
    
    if (modalCancel) {
        modalCancel.addEventListener('click', () => UIManager.closeModal(false));
    }
    if (modalConfirm) {
        modalConfirm.addEventListener('click', () => UIManager.closeModal(true));
    }
    
    // Warn before leaving page with unsaved bill
    window.addEventListener('beforeunload', function(e) {
        if (AppState.billItems.length > 0 || AppState.salesItems.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// Load user data and initialize app
async function loadUserDataAndInitialize() {
    UIManager.showLoading();
    
    try {
        // Fetch user data
        const userId = AppState.currentUser?.uid || firebase.auth().currentUser?.uid;
        if (userId) {
            const userDoc = await firebase.firestore().collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                AppState.userRole = userData.role || 'staff';
                AppState.userName = userData.name || 'User';
            }
        }
        
        // Load all data from Firestore
        console.log('Loading data from Firestore...');
        
        const [items, bills, sales, payments, stockAdjustments, withdrawals] = await Promise.all([
            FirebaseService.loadItems(),
            FirebaseService.loadBills(),
            FirebaseService.loadSales(),
            FirebaseService.loadPayments(),
            FirebaseService.loadStockAdjustments(),
            FirebaseService.loadWithdrawals()
        ]);
        
        AppState.items = items;
        AppState.billHistory = bills;
        AppState.salesHistory = sales;
        AppState.paymentsHistory = payments;
        AppState.stockAdjustments = stockAdjustments;
        AppState.withdrawalsHistory = withdrawals;
        
        console.log('Data loaded:', {
            items: items.length,
            bills: bills.length,
            sales: sales.length,
            payments: payments.length
        });
        
        // Calculate stock
        AppState.stock = await FirebaseService.calculateStock();
        
        // Set up real-time listeners
        FirebaseService.setupRealtimeListeners();
        
        // Restore any draft bills (if function exists in legacy code)
        if (typeof window.restoreBillDraft === 'function') {
            window.restoreBillDraft();
        }
        
        // Initialize UI
        AuthManager.updateUserDisplay();
        AuthManager.applyRoleBasedRestrictions();
        
        // Render initial views
        ItemsManager.renderItems();
        
        // Update printer status
        PrinterService.updateStatus();
        
        // Load settings (if function exists in legacy code)
        if (typeof window.loadSettings === 'function') {
            window.loadSettings();
        }
        
        UIManager.hideLoading();
        console.log('App initialized successfully!');
        
    } catch (error) {
        console.error('Error initializing app:', error);
        UIManager.hideLoading();
        UIManager.showToast('Failed to load data: ' + error.message);
    }
}

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    // Initialize Firebase auth listener
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                console.log('User is signed in:', user.uid);
                loadUserDataAndInitialize();
            } else {
                console.log('No user signed in');
                document.getElementById('authScreen').style.display = 'flex';
            }
        });
    }
    
    // Set up event listeners
    setupEventListeners();
});

// Expose clean API to window for HTML event handlers
window.app = {
    // Authentication
    auth: {
        showTab: (tab) => AuthManager.showAuthTab(tab),
        login: () => AuthManager.handleLogin(),
        register: () => AuthManager.handleRegister(),
        logout: () => AuthManager.handleLogout(),
        forgotPassword: () => AuthManager.handleForgotPassword()
    },
    
    // Navigation
    nav: {
        toggleMenu: () => NavigationManager.toggleMenu(),
        showTab: (tabId, evt) => NavigationManager.showTabFromNav(tabId, evt)
    },
    
    // Items Management
    items: {
        render: () => ItemsManager.renderItems(),
        add: () => ItemsManager.addItem(),
        updateName: (idx, val) => ItemsManager.updateItemName(idx, val),
        updateHindiName: (idx, val) => ItemsManager.updateItemHindiName(idx, val),
        addRate: (idx) => ItemsManager.addRate(idx),
        updateRate: (iIdx, rIdx, val) => ItemsManager.updateRate(iIdx, rIdx, val),
        deleteRate: (iIdx, rIdx) => ItemsManager.deleteRate(iIdx, rIdx),
        addSaleRate: (idx) => ItemsManager.addSaleRate(idx),
        updateSaleRate: (iIdx, rIdx, val) => ItemsManager.updateSaleRate(iIdx, rIdx, val),
        deleteSaleRate: (iIdx, rIdx) => ItemsManager.deleteSaleRate(iIdx, rIdx),
        delete: (idx) => ItemsManager.deleteItem(idx),
        exportExcel: () => ItemsManager.exportToExcel(),
        importExcel: (evt) => ItemsManager.importFromExcel(evt)
    },
    
    // Billing
    billing: {
        // Weight management
        addWeight: () => BillingManager.addWeight(),
        renderWeights: () => BillingManager.renderWeights(),
        removeWeight: (idx) => BillingManager.removeWeight(idx),
        clearWeights: () => BillingManager.clearWeights(),
        
        // Purchase bill
        addToBill: (autoAdd) => BillingManager.addToBill(autoAdd),
        renderBill: () => BillingManager.renderBill(),
        deleteBillItem: (idx) => BillingManager.deleteBillItem(idx),
        updateTotals: () => BillingManager.updateTotals(),
        updatePaymentTotal: () => BillingManager.updatePaymentTotal(),
        fillPayableAmount: (type) => BillingManager.fillPayableAmount(type),
        saveBill: () => BillingManager.saveBillToHistory(),
        
        // Sales bill
        addToSalesBill: () => BillingManager.addToSalesBill(),
        renderSalesBill: () => BillingManager.renderSalesBill(),
        removeSalesItem: (idx) => BillingManager.removeSalesItem(idx),
        updateSalePaymentTotal: () => BillingManager.updateSalePaymentTotal(),
        fillSalePayableAmount: (type) => BillingManager.fillSalePayableAmount(type),
        completeSale: () => BillingManager.completeSale(),
        
        // Print bill
        printBill: async () => {
            const billItems = BillingManager.getBillItems();
            if (billItems.length === 0) {
                UIManager.showToast('No items in bill');
                return;
            }
            
            const billData = {
                items: billItems,
                billTotal: parseFloat(document.getElementById('billTotal')?.textContent || 0),
                laborCharges: parseFloat(document.getElementById('laborCharges')?.value || 0),
                totalPackets: parseInt(document.getElementById('totalPackets')?.textContent || 0),
                amountPayable: parseFloat(document.getElementById('grandTotal')?.textContent || 0),
                customerName: document.getElementById('customerName')?.value || '',
                isPurchase: true,
                isAutoLabor: true,
                date: new Date().toISOString()
            };
            
            try {
                await PrinterService.printBill(billData);
                UIManager.showToast('Bill printed successfully!');
            } catch (error) {
                console.error('Print error:', error);
                UIManager.showToast('Print failed: ' + error.message);
            }
        }
    },
    
    // Printer
    printer: {
        scan: () => PrinterService.scanDevices(),
        disconnect: () => PrinterService.disconnect(),
        test: () => PrinterService.testPrint(),
        updateStatus: () => PrinterService.updateStatus(),
        print: (billData) => PrinterService.printBill(billData)
    },
    
    // UI
    ui: {
        showLoading: () => UIManager.showLoading(),
        hideLoading: () => UIManager.hideLoading(),
        showToast: (msg, duration) => UIManager.showToast(msg, duration),
        showModal: (msg, title, showCancel) => UIManager.showModal(msg, title, showCancel),
        closeModal: (result) => UIManager.closeModal(result)
    },
    
    // Legacy script.js function bridges (for functions not yet modularized)
    // These will delegate to script.js until they're moved to modules
    legacy: {
        // These functions still exist in script.js
        showTab: (tabId, evt) => typeof window.showTab === 'function' ? window.showTab(tabId, evt) : null,
        loadItemsDropdown: () => typeof window.loadItemsDropdown === 'function' ? window.loadItemsDropdown() : null,
        loadRates: () => typeof window.loadRates === 'function' ? window.loadRates() : null,
        handleRateChange: () => typeof window.handleRateChange === 'function' ? window.handleRateChange() : null,
        renderHistory: () => typeof window.renderHistory === 'function' ? window.renderHistory() : null,
        renderSalesHistory: () => typeof window.renderSalesHistory === 'function' ? window.renderSalesHistory() : null,
        renderStock: () => typeof window.renderStock === 'function' ? window.renderStock() : null,
        renderReports: () => typeof window.renderReports === 'function' ? window.renderReports() : null,
        renderDue: () => typeof window.renderDue === 'function' ? window.renderDue() : null,
        renderSalesOutstanding: () => typeof window.renderSalesOutstanding === 'function' ? window.renderSalesOutstanding() : null,
        loadSellItemDropdown: () => typeof window.loadSellItemDropdown === 'function' ? window.loadSellItemDropdown() : null,
        loadSellItemDetails: () => typeof window.loadSellItemDetails === 'function' ? window.loadSellItemDetails() : null,
        saveBillOnly: () => typeof window.saveBillOnly === 'function' ? window.saveBillOnly() : null,
        toggleTransactionMode: () => typeof window.toggleTransactionMode === 'function' ? window.toggleTransactionMode() : null
    }
};

// Expose printer manager globally for script.js compatibility
window.printerManager = printerManager;
window.connectedPrinter = printerManager;

console.log('Main app script loaded (ES6 modules)');
