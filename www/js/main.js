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
import { FinanceManager } from './modules/finance.js';
import { AnalyticsManager } from './modules/analytics.js';
import { CashManagementManager } from './modules/cash-management.js';
import { AuditService } from './services/audit.js';

// Import template loader utility
import { TemplateLoader } from './utils/template-loader.js';

// Load and inject HTML templates from separate .html files
async function injectTemplates() {
    const templates = await TemplateLoader.loadAllTemplates();
    TemplateLoader.injectTemplates(templates);
}

// Global error handlers
window.addEventListener('error', function(event) {
    const errorMsg = event.error?.message || event.message || 'Unknown error';
    console.error('Global error:', event.error);
    UIManager.showToast('An error occurred: ' + errorMsg);
});

window.addEventListener('unhandledrejection', function(event) {
    const errorMsg = event.reason?.message || event.reason || 'Unknown rejection';
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
        
        // Clean up old audit logs (runs silently for owners)
        AuditService.cleanupOldLogs();
        
        // Load settings (if function exists in legacy code)
        if (typeof window.loadSettings === 'function') {
            window.loadSettings();
        }
        
        UIManager.hideLoading();
        
    } catch (error) {
        console.error('Error initializing app:', error);
        UIManager.hideLoading();
        UIManager.showToast('Failed to load data: ' + error.message);
    }
}

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', async function() {
    // STEP 1: Load and inject all HTML templates from .html files
    await injectTemplates();
    
    // STEP 2: Initialize auth tabs after templates are loaded
    AuthManager.initAuthTabs();
    
    // STEP 3: Initialize Firebase auth listener
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                // Set current user in AppState
                AppState.currentUser = user;
                const authScreen = document.getElementById('authScreen');
                if (authScreen && authScreen.style.display !== 'none') {
                    authScreen.style.display = 'none';
                }
                loadUserDataAndInitialize();
            } else {
                // Clean up Firebase listeners when user signs out
                FirebaseService.cleanup();
                AppState.currentUser = null;
                document.getElementById('authScreen').style.display = 'flex';
            }
        });
    }
    
    // STEP 4: Set up event listeners
    setupEventListeners();
    
    // STEP 5: Clean up listeners when page unloads
    window.addEventListener('beforeunload', () => {
        FirebaseService.cleanup();
    });
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
        search: (query) => ItemsManager.renderItemsTable(query),
        openAddModal: () => ItemsManager.openAddModal(),
        openEditModal: (idx) => ItemsManager.openEditModal(idx),
        closeItemModal: () => ItemsManager.closeItemModal(),
        addModalRate: (type) => ItemsManager.addModalRate(type),
        updateModalRate: (type, idx, val) => ItemsManager.updateModalRate(type, idx, val),
        deleteModalRate: (type, idx) => ItemsManager.deleteModalRate(type, idx),
        saveItemFromModal: () => ItemsManager.saveItemFromModal(),
        deleteItemFromModal: () => ItemsManager.deleteItemFromModal(),
        add: () => ItemsManager.addItem(),
        updateName: (idx, val) => ItemsManager.updateItemName(idx, val),
        updateHindiName: (idx, val) => ItemsManager.updateItemHindiName(idx, val),
        addRate: (idx) => ItemsManager.addRate(idx),
        updateRate: (iIdx, rIdx, val) => ItemsManager.updateRate(iIdx, rIdx, val),
        deleteRate: (iIdx, rIdx) => ItemsManager.deleteRate(iIdx, rIdx),
        addWholesaleRate: (idx) => ItemsManager.addWholesaleRate(idx),
        updateWholesaleRate: (iIdx, rIdx, val) => ItemsManager.updateWholesaleRate(iIdx, rIdx, val),
        deleteWholesaleRate: (iIdx, rIdx) => ItemsManager.deleteWholesaleRate(iIdx, rIdx),
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
            
            try {
                // Save the bill first and wait for it to complete
                const savedBill = await BillingManager.saveBillToHistory();
                
                if (!savedBill) {
                    // Save failed or was cancelled
                    return;
                }
                
                // Only print after successful save
                await PrinterService.printBill(savedBill);
                
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
        editSaleItem: (index) => BillingManager.editSaleItem(index),
        
        // Edit bill items
        editBillItem: (index) => BillingManager.editBillItem(index),
        
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
        print: (billData) => PrinterService.printBill(billData),
        printExpense: (expense) => PrinterService.printExpense(expense)
    },
    
    // Stock
    stock: {
        filterTab: (view, evt) => StockManager.filterStockTab(view, evt),
        render: () => StockManager.renderStock(),
        searchStock: () => StockManager.searchStock(),
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
        reprintSale: (index) => SalesManager.reprintSale(index),
        reprintSaleById: (saleId) => SalesManager.reprintSaleById(saleId),
        updateProfitCalculation: () => SalesManager.updateProfitCalculation(),
        pickContact: () => SalesManager.pickContact()
    },
    
    // History
    history: {
        saveBillToHistory: () => HistoryManager.saveBillToHistory(),
        render: () => HistoryManager.renderHistory(),
        viewBill: (index, type) => HistoryManager.viewBill(index, type),
        reprintBill: (index) => HistoryManager.reprintBill(index),
        closeBillDetails: () => HistoryManager.closeBillDetails(),
        confirmDeleteBill: (index) => HistoryManager.confirmDeleteBill(index),
        deleteBill: (index) => HistoryManager.deleteBill(index),
        filterHistory: (type, event) => HistoryManager.filterHistory(type, event),
        searchHistory: (searchTerm) => HistoryManager.searchHistory(searchTerm),
        toggleView: () => HistoryManager.toggleView(),
        editBillDetails: (billIndex) => {
            if (billIndex !== undefined) {
                // Pass the bill type along with index
                const billType = window.currentBillType || 'purchase';
                BillingManager.editBill(billIndex, billType);
            } else {
                UIManager.showToast('Bill index not provided');
            }
        }
    },
    
    // Outstanding
    outstanding: {
        filterDue: (filter, evt) => OutstandingManager.filterDue(filter, evt),
        renderDue: () => OutstandingManager.renderDue(),
        searchOutstanding: () => OutstandingManager.searchOutstanding(),
        recordPayment: (txnId, txnType) => OutstandingManager.recordPayment(txnId, txnType),
        markAsCleared: (txnId, txnType) => OutstandingManager.markAsCleared(txnId, txnType),
        showDetails: (txnId, txnType) => OutstandingManager.showDetails(txnId, txnType)
    },
    
    // Reports
    reports: {
        renderReports: () => ReportsManager.renderReports(),
        applyFilters: () => ReportsManager.applyFilters(),
        exportCSV: () => ReportsManager.exportToCSV(),
        exportPDF: () => ReportsManager.exportToPDF()
    },
    
    // Payments
    payments: {
        filterExpenseTab: (view, evt) => PaymentsManager.filterExpenseTab(view, evt),
        saveBusinessExpense: () => PaymentsManager.saveBusinessExpense(),
        savePersonalExpense: () => PaymentsManager.savePersonalExpense(),
        renderHistory: () => PaymentsManager.renderPaymentsHistory(),
        updateExpensePersonOptions: () => PaymentsManager.updateExpensePersonOptions(),
        saveAndPrintBusiness: () => PaymentsManager.saveAndPrintBusiness(),
        saveAndPrintPersonal: () => PaymentsManager.saveAndPrintPersonal(),
        viewExpenseDetails: (index, category) => PaymentsManager.viewExpenseDetails(index, category),
        closeExpenseDetails: () => PaymentsManager.closeExpenseDetails(),
        editExpenseFromModal: () => PaymentsManager.editExpenseFromModal(),
        confirmDeleteExpense: () => PaymentsManager.confirmDeleteExpense(),
        editExpense: (expenseId, category) => PaymentsManager.editExpense(expenseId, category),
        deleteExpense: (expenseId, category) => PaymentsManager.deleteExpense(expenseId, category)
    },
    
    // Finance
    finance: {
        filterTab: (view, evt) => FinanceManager.filterTab(view, evt),
        calculateOverview: () => FinanceManager.calculateOverview(),
        renderTransactions: () => FinanceManager.renderTransactions(),
        recordWithdrawal: () => FinanceManager.recordWithdrawal(),
        renderWithdrawalHistory: () => FinanceManager.renderWithdrawalHistory(),
        init: () => FinanceManager.init()
    },
    
    // Analytics
    analytics: {
        filterTab: (view, evt) => AnalyticsManager.filterTab(view, evt),
        setPeriod: (period, evt) => AnalyticsManager.setPeriod(period, evt),
        render: () => AnalyticsManager.renderAnalytics(),
        init: () => AnalyticsManager.init()
    },
    
    // Cash Management
    cashManagement: {
        init: () => CashManagementManager.init(),
        signIn: () => CashManagementManager.signIn(),
        signOut: () => CashManagementManager.signOut(),
        recordTransaction: () => CashManagementManager.recordTransaction(),
        showDetails: (sessionDate) => CashManagementManager.showSessionDetails(sessionDate)
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
        testPrint: () => SettingsManager.testPrint(),
        loadAuditLogs: () => SettingsManager.loadAuditLogs(),
        filterAuditLogs: () => SettingsManager.filterAuditLogs(),
        loadStorageStats: () => SettingsManager.loadStorageStats()
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

// Expose printer manager globally for legacy template compatibility
window.printerManager = printerManager;
window.connectedPrinter = printerManager;
