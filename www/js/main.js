// -------------------- MAIN APPLICATION INITIALIZATION --------------------

import { AppState } from './utils/state.js';
import { UIManager } from './ui/ui-manager.js';
import { NavigationManager } from './ui/navigation.js';
import { AuthManager } from './auth/authentication.js';
import { FirebaseService } from './firebase/firestore-service.js';
import { ItemsManager } from './modules/items.js';
import { PrinterService, printerManager } from './services/printer.js';
import { BillingManager } from './modules/billing.js';
import { StockManager } from './modules/stock.js';
import { SalesManager } from './modules/sales.js';
import { HistoryManager } from './modules/history.js';
import { OutstandingManager } from './modules/outstanding.js';
import { ReportsManager } from './modules/reports.js';
import { PaymentsManager } from './modules/miscellaneous.js';
import { SettingsManager } from './modules/settings.js';
import { DateFilterManager } from './modules/datefilter.js';
import { UsersManager } from './modules/users.js';
import { ConfigureManager } from './modules/configure.js';

// Import template loader utility
import { TemplateLoader } from './utils/template-loader.js';

// Load and inject HTML templates from separate .html files
async function injectTemplates() {
    console.log('Loading templates from HTML files...');
    const templates = await TemplateLoader.loadAllTemplates();
    TemplateLoader.injectTemplates(templates);
}

// Global error handlers for debugging
window.addEventListener('error', function(event) {
    const errorMsg = event.error?.message || event.message || 'Unknown error';
    console.error('Global error:', event.error);
    alert('[DEBUG] Global error: ' + errorMsg);
    UIManager.showToast('An error occurred: ' + errorMsg);
});

window.addEventListener('unhandledrejection', function(event) {
    const errorMsg = event.reason?.message || event.reason || 'Unknown rejection';
    console.error('Unhandled promise rejection:', event.reason);
    alert('[DEBUG] Unhandled rejection: ' + errorMsg);
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
    
    // Auto-save triggers for text field changes
    const autoSaveFields = [
        'customerName', 'billComments', 'manualLaborCharges',
        'saleCustomerName', 'saleComments'
    ];
    
    autoSaveFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => {
                if (window.app?.billing?.triggerAutoSave) {
                    window.app.billing.triggerAutoSave();
                }
            });
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
            FirebaseService.loadWithdrawals(),
            BillingManager.loadItemFrequency()
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
        
        // Show app content
        const appContent = document.getElementById('appContent');
        if (appContent) {
            appContent.classList.remove('hidden');
        }
        
        // Show the billing tab by default
        NavigationManager.showTab('billing');
        
        // Initialize UI
        AuthManager.updateUserDisplay();
        AuthManager.applyRoleBasedRestrictions();
        
        // Update username in navigation
        const userNameDisplay = document.getElementById('currentUserName');
        if (userNameDisplay) {
            userNameDisplay.textContent = AppState.userName || 'User';
        }
        
        // Render initial views
        ItemsManager.renderItems();
        BillingManager.loadItemsDropdown();
        SalesManager.loadItemsDropdown();
        BillingManager.updateDraftCount();
        PaymentsManager.updateExpensePersonOptions();
        PaymentsManager.renderPaymentsHistory();
        
        // Check for auto-saved bill
        await BillingManager.checkAutoSave();
        
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
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, initializing app...');
    
    // STEP 1: Load and inject all HTML templates from .html files
    await injectTemplates();
    
    // STEP 2: Initialize auth tabs after templates are loaded
    AuthManager.initAuthTabs();
    
    // STEP 3: Initialize Firebase auth listener
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                console.log('User is signed in:', user.uid);
                // Set current user in AppState
                AppState.currentUser = user;
                const authScreen = document.getElementById('authScreen');
                if (authScreen && authScreen.style.display !== 'none') {
                    authScreen.style.display = 'none';
                }
                loadUserDataAndInitialize();
            } else {
                console.log('No user signed in');
                AppState.currentUser = null;
                document.getElementById('authScreen').style.display = 'flex';
            }
        });
    }
    
    // STEP 4: Set up event listeners
    setupEventListeners();
});

// Expose loadUserDataAndInitialize for manual login trigger
window.initializeApp = loadUserDataAndInitialize;

// Expose functions needed by Firebase listeners
window.renderPaymentsHistory = () => PaymentsManager.renderPaymentsHistory();

// Global bridge function for legacy template compatibility
window.loadSellItemDetails = () => SalesManager.loadItemDetails();

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
        renderTable: () => ItemsManager.renderItemsTable(),
        add: () => ItemsManager.addItem(),
        updateName: (idx, val) => ItemsManager.updateItemName(idx, val),
        updateHindiName: (idx, val) => ItemsManager.updateItemHindiName(idx, val),
        addRate: (idx) => ItemsManager.addRate(idx),
        updateRate: (iIdx, rIdx, val) => ItemsManager.updateRate(iIdx, rIdx, val),
        deleteRate: (iIdx, rIdx) => ItemsManager.deleteRate(iIdx, rIdx),
        addSaleRate: (idx) => ItemsManager.addSaleRate(idx),
        updateSaleRate: (iIdx, rIdx, val) => ItemsManager.updateSaleRate(iIdx, rIdx, val),
        deleteSaleRate: (iIdx, rIdx) => ItemsManager.deleteSaleRate(iIdx, rIdx),
        deleteItem: (idx) => ItemsManager.deleteItem(idx),
        exportExcel: () => ItemsManager.exportToExcel(),
        importExcel: (evt) => ItemsManager.importFromExcel(evt)
    },
    
    // Billing
    billing: {
        // Items & Rates loading
        loadItemsDropdown: () => BillingManager.loadItemsDropdown(),
        loadSaleItemsDropdown: () => BillingManager.loadSaleItemsDropdown(),
        loadRates: () => BillingManager.loadRates(),
        loadSaleRates: () => BillingManager.loadSaleRates(),
        
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
        addSaleWeight: (autoAdd) => BillingManager.addSaleWeight(autoAdd),
        renderSaleWeights: () => BillingManager.renderSaleWeights(),
        removeSaleWeight: (idx) => BillingManager.removeSaleWeight(idx),
        clearSaleWeights: () => BillingManager.clearSaleWeights(),
        addToSalesBill: (autoAdd) => BillingManager.addToSalesBill(autoAdd),
        renderSalesBill: () => BillingManager.renderSalesBill(),
        removeSalesItem: (idx) => BillingManager.removeSalesItem(idx),
        removeSaleItem: (idx) => BillingManager.removeSaleItem(idx),
        updateSalePaymentTotal: () => BillingManager.updateSalePaymentTotal(),
        fillSalePayableAmount: (type) => BillingManager.fillSalePayableAmount(type),
        fillReceivableAmount: (type) => BillingManager.fillReceivableAmount(type),
        completeSale: () => BillingManager.completeSale(),
        
        // Print bill (saves and prints)
        printBill: async () => {
            const billItems = BillingManager.getBillItems();
            if (billItems.length === 0) {
                UIManager.showToast('No items in bill');
                return;
            }
            
            // Collect bill data before saving
            const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
            const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
            const duePayment = parseFloat(document.getElementById('dueAmount')?.value || 0);
            
            // Get labor calculation string only if auto-labor was used (checkbox checked and not manually edited)
            const autoLaborCheckbox = document.getElementById('autoLaborCharge');
            const laborChargesInput = document.getElementById('manualLaborCharges');
            const laborCalculationSpan = document.getElementById('laborCalculation');
            const laborCalc = (autoLaborCheckbox?.checked && !laborChargesInput?.dataset.manuallySet) 
                ? laborCalculationSpan?.textContent || null 
                : null;
            
            const billData = {
                items: billItems,
                billTotal: parseFloat(document.getElementById('billTotal')?.textContent || 0),
                laborCharges: parseFloat(document.getElementById('manualLaborCharges')?.value || 0),
                laborCalc: laborCalc,
                totalPackets: parseInt(document.getElementById('totalPacketsInBill')?.textContent || 0),
                amountPayable: parseFloat(document.getElementById('amountPayable')?.textContent || 0),
                customerName: document.getElementById('customerName')?.value || '',
                isPurchase: true,
                date: new Date().toISOString(),
                payment: {
                    online: onlinePayment,
                    cash: cashPayment,
                    due: duePayment,
                    total: onlinePayment + cashPayment + duePayment
                }
            };
            
            try {
                // Save the bill
                await BillingManager.saveBillToHistory();
                
                // Print the bill data we collected
                await PrinterService.printBill(billData);
                
                UIManager.showToast('Bill saved and printed!');
            } catch (error) {
                console.error('Print error:', error);
                UIManager.showToast('Error: ' + error.message);
            }
        },
        
        // Mode toggle between Purchase and Sale
        switchMode: (mode, event) => BillingManager.switchMode(mode, event),
        
        // Contact picker
        pickContact: () => BillingManager.pickContact(),
        pickSaleContact: () => BillingManager.pickSaleContact(),
        
        // WhatsApp share
        shareWhatsApp: () => BillingManager.shareWhatsApp(),
        shareSaleWhatsApp: () => BillingManager.shareSaleWhatsApp(),
        
        // Sale methods
        loadSaleRates: () => BillingManager.loadSaleRates(),
        updateSalePaymentTotal: () => BillingManager.updateSalePaymentTotal(),
        fillReceivableAmount: (type) => BillingManager.fillReceivableAmount(type),
        completeSale: () => BillingManager.completeSale(),
        printSale: () => BillingManager.printSale(),
        removeSaleItem: (index) => BillingManager.removeSaleItem(index),
        
        // Draft management
        saveDraft: () => BillingManager.saveDraft(),
        showDrafts: () => BillingManager.showDrafts(),
        closeDrafts: () => BillingManager.closeDrafts(),
        loadDraft: (index) => BillingManager.loadDraft(index),
        deleteDraft: (index) => BillingManager.deleteDraft(index),
        clearBill: () => BillingManager.clearBill(),
        updateDraftCount: () => BillingManager.updateDraftCount(),
        
        // Auto-save management
        triggerAutoSave: () => BillingManager.triggerAutoSave(),
        checkAutoSave: () => BillingManager.checkAutoSave()
    },
    
    // Printer
    printer: {
        scan: () => PrinterService.scanDevices(),
        connect: (deviceId, deviceName) => PrinterService.connect(deviceId, deviceName),
        disconnect: () => PrinterService.disconnect(),
        test: () => PrinterService.testPrint(),
        updateStatus: () => PrinterService.updateStatus(),
        print: (billData) => PrinterService.printBill(billData)
    },
    
    // Stock
    stock: {
        filterTab: (view, evt) => StockManager.filterStockTab(view, evt),
        render: () => StockManager.renderStock(),
        loadAdjustItemStock: () => StockManager.loadAdjustItemStock(),
        updateAdjustmentPlaceholder: () => StockManager.updateAdjustmentPlaceholder(),
        applyAdjustment: () => StockManager.applyStockAdjustment(),
        renderAdjustmentHistory: () => StockManager.renderAdjustmentHistory()
    },
    
    // Sales
    sales: {
        loadItemsDropdown: () => SalesManager.loadItemsDropdown(),
        loadItemDetails: () => SalesManager.loadItemDetails(),
        addToWholesaleBill: () => SalesManager.addToWholesaleBill(),
        removeWholesaleItem: (index) => SalesManager.removeWholesaleItem(index),
        completeSale: () => SalesManager.completeSale(),
        printWholesaleSale: () => SalesManager.printWholesaleSale(),
        shareViaWhatsApp: () => SalesManager.shareViaWhatsApp(),
        filterTab: (view, evt) => SalesManager.filterSalesTab(view, evt),
        renderHistory: () => SalesManager.renderSalesHistory(),
        renderOutstanding: () => SalesManager.renderSalesOutstanding(),
        recordPayment: (saleId) => SalesManager.recordPayment(saleId),
        markSaleAsCleared: (saleId) => SalesManager.markSaleAsCleared(saleId),
        reprintSale: (index) => SalesManager.reprintSale(index)
    },
    
    // History
    history: {
        saveBillToHistory: () => HistoryManager.saveBillToHistory(),
        render: () => HistoryManager.renderHistory(),
        reprintBill: (index) => HistoryManager.reprintBill(index),
        closeBillDetails: () => HistoryManager.closeBillDetails(),
        confirmDeleteBill: (index) => HistoryManager.confirmDeleteBill(index),
        deleteBill: (index) => HistoryManager.deleteBill(index),
        filterHistory: (type, event) => HistoryManager.filterHistory(type, event),
        searchHistory: (searchTerm) => HistoryManager.searchHistory(searchTerm),
        toggleView: () => HistoryManager.toggleView(),
        editBillDetails: (billIndex) => {
            if (billIndex !== undefined) {
                BillingManager.editBill(billIndex);
            } else {
                UIManager.showToast('Bill index not provided');
            }
        }
    },
    
    // Outstanding
    outstanding: {
        filterDue: (filter, evt) => OutstandingManager.filterDue(filter, evt),
        renderDue: () => OutstandingManager.renderDue(),
        markAsCleared: (txnId, txnType) => OutstandingManager.markAsCleared(txnId, txnType),
        showDetails: (txnId, txnType) => OutstandingManager.showDetails(txnId, txnType)
    },
    
    // Reports
    reports: {
        renderReports: () => ReportsManager.renderReports(),
        applyFilters: () => ReportsManager.applyFilters(),
        exportCSV: () => ReportsManager.exportToCSV(),
        exportPDF: () => {
            UIManager.showToast('PDF export - coming soon');
            console.log('exportPDF - not yet implemented');
        }
    },
    
    // Payments
    payments: {
        filterExpenseTab: (view, evt) => PaymentsManager.filterExpenseTab(view, evt),
        saveBusinessExpense: () => PaymentsManager.saveBusinessExpense(),
        savePersonalExpense: () => PaymentsManager.savePersonalExpense(),
        renderHistory: () => PaymentsManager.renderPaymentsHistory(),
        updateExpensePersonOptions: () => PaymentsManager.updateExpensePersonOptions(),
        saveAndPrintBusiness: () => PaymentsManager.saveAndPrintBusiness(),
        saveAndPrintPersonal: () => PaymentsManager.saveAndPrintPersonal()
    },
    
    // Configure
    configure: {
        showSubTab: (subTab) => ConfigureManager.showSubTab(subTab)
    },
    
    // Settings
    settings: {
        load: () => SettingsManager.loadSettings(),
        save: () => SettingsManager.saveSettings(),
        toggleDarkMode: () => SettingsManager.toggleDarkMode(),
        clearAllData: () => SettingsManager.clearAllData(),
        toggleBluetoothPrinter: () => SettingsManager.toggleBluetoothPrinter(),
        scanBluetoothDevices: () => SettingsManager.scanBluetoothDevices(),
        connectToPrinter: (id, name) => SettingsManager.connectToPrinter(id, name),
        disconnectPrinter: () => SettingsManager.disconnectPrinter(),
        updatePrinterStatus: () => SettingsManager.updatePrinterStatus(),
        testPrint: () => SettingsManager.testPrint()
    },
    
    // Date Filter
    dateFilter: {
        setFilter: (filter, evt) => DateFilterManager.setDateFilter(filter, evt),
        applyCustomFilter: () => DateFilterManager.applyCustomDateFilter()
    },
    
    // Users
    users: {
        load: () => UsersManager.loadUsers(),
        approveUser: (userId, role) => UsersManager.approveUser(userId, role),
        rejectUser: (userId) => UsersManager.rejectUser(userId),
        showChangeRoleDialog: (userId, userName, currentRole) => UsersManager.showChangeRoleDialog(userId, userName, currentRole)
    },
    
    // UI
    ui: {
        showLoading: () => UIManager.showLoading(),
        hideLoading: () => UIManager.hideLoading(),
        showToast: (msg, duration) => UIManager.showToast(msg, duration),
        showModal: (msg, title, showCancel) => UIManager.showModal(msg, title, showCancel),
        closeModal: (result) => UIManager.closeModal(result)
    }
};

// Expose printer manager globally for script.js compatibility
window.printerManager = printerManager;
window.connectedPrinter = printerManager;

console.log('Main app script loaded (ES6 modules)');
