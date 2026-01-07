// -------------------- MAIN APPLICATION INITIALIZATION --------------------

import { AppState } from './utils/state.js';
import { UIManager } from './ui/ui-manager.js';
import { NavigationManager } from './ui/navigation.js';
import { AuthManager } from './auth/authentication.js';
import { FirebaseService } from './firebase/firestore-service.js';
import { ItemsManager } from './modules/items.js';
import { PrinterService, printerManager } from './services/printer.js';
import { BillingManager, PurchaseManager, RetailSaleManager } from './modules/billing.js';
import { StockManager } from './modules/stock.js';
import { WholesaleSalesManager } from './modules/wholesale-sales.js';
import { HistoryManager } from './modules/history.js';
import { OutstandingManager } from './modules/outstanding.js';
import { ReportsManager } from './modules/reports.js';
import { ExpensesManager } from './modules/miscellaneous.js';
import { SettingsManager } from './modules/settings.js';
import { DateFilterManager } from './modules/datefilter.js';
import { UsersManager } from './modules/users.js';
import { FinanceManager } from './modules/finance.js';
import { AnalyticsManager } from './modules/analytics.js';
import { CashManagementManager } from './modules/cash-management.js';
import { DayManager } from './modules/day.js';
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
            const userDoc = await firebase.firestore().collection(window.getCollection ? window.getCollection('users') : 'users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Check if user is approved
                if (userData.status === 'pending') {
                    await firebase.auth().signOut();
                    UIManager.hideLoading();
                    UIManager.showToast('Your account is pending approval. Please wait for admin approval.');
                    document.getElementById('authScreen').style.display = 'flex';
                    return;
                }
                
                if (userData.status === 'rejected') {
                    await firebase.auth().signOut();
                    UIManager.hideLoading();
                    UIManager.showToast('Your account has been rejected. Please contact admin.');
                    document.getElementById('authScreen').style.display = 'flex';
                    return;
                }
                
                AppState.userRole = userData.role || 'staff';
                AppState.userName = userData.name || 'User';
            } else {
                // User document doesn't exist
                await firebase.auth().signOut();
                UIManager.hideLoading();
                UIManager.showToast('User account not found. Please register.');
                document.getElementById('authScreen').style.display = 'flex';
                return;
            }
        }
        
        // Load all data from Firestore
        const [items, purchases, wholesaleSales, retailSales, payments, stockAdjustments, withdrawals] = await Promise.all([
            FirebaseService.loadItems(),
            FirebaseService.loadPurchases(),
            FirebaseService.loadSales(),
            FirebaseService.loadRetailSales(),
            FirebaseService.loadExpenses(),
            FirebaseService.loadStockAdjustments(),
            FirebaseService.loadWithdrawals(),
            BillingManager.loadItemFrequency()
        ]);
        
        AppState.items = items;
        AppState.purchaseHistory = purchases;
        AppState.salesHistory = wholesaleSales;
        AppState.retailSalesHistory = retailSales;
        AppState.expensesHistory = payments;
        AppState.stockAdjustments = stockAdjustments;
        AppState.withdrawalsHistory = withdrawals;
        
        // Calculate stock
        AppState.stock = await FirebaseService.calculateStock();
        
        // Initialize billing manager (connects purchase and retail-sale modules)
        BillingManager.init();
        
        // Set up real-time listeners
        FirebaseService.setupRealtimeListeners();
        
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
        WholesaleSalesManager.loadItemsDropdown();
        BillingManager.updateDraftCount();
        ExpensesManager.updateExpensePersonOptions();
        ExpensesManager.renderexpensesHistory();
        
        // Check for auto-saved bill
        await BillingManager.checkAutoSave();
        
        // Update printer status
        PrinterService.updateStatus();
        
        // Clean up old audit logs (runs silently for owners)
        AuditService.cleanupOldLogs();
        
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
    
    // Purchase (direct access to PurchaseManager)
    purchase: {
        addWeight: (autoAdd) => PurchaseManager.addWeight(autoAdd),
        renderWeights: () => PurchaseManager.renderWeights(),
        removeWeight: (idx) => PurchaseManager.removeWeight(idx),
        clearWeights: () => PurchaseManager.clearWeights(),
        addToBill: (autoAdd) => PurchaseManager.addToBill(autoAdd),
        renderBill: () => PurchaseManager.renderBill(),
        deleteBillItem: (idx) => PurchaseManager.deleteBillItem(idx),
        editBillItem: (idx) => PurchaseManager.editBillItem(idx),
        updateTotals: (heavy) => PurchaseManager.updateTotals(heavy),
        updatePaymentTotal: () => PurchaseManager.updatePaymentTotal(),
        fillPayableAmount: (type) => PurchaseManager.fillPayableAmount(type),
        saveBillToHistory: () => PurchaseManager.saveBillToHistory(),
        shareWhatsApp: () => PurchaseManager.shareWhatsApp(),
        getBillItems: () => PurchaseManager.getBillItems(),
        getWeights: () => PurchaseManager.getWeights(),
        clearBill: () => PurchaseManager.clearBill()
    },
    
    // Retail Sale (direct access to RetailSaleManager)
    retailSale: {
        addSaleWeight: (autoAdd) => RetailSaleManager.addSaleWeight(autoAdd),
        renderSaleWeights: () => RetailSaleManager.renderSaleWeights(),
        removeSaleWeight: (idx) => RetailSaleManager.removeSaleWeight(idx),
        clearSaleWeights: () => RetailSaleManager.clearSaleWeights(),
        addToSalesBill: (autoAdd) => RetailSaleManager.addToSalesBill(autoAdd),
        renderSalesBill: () => RetailSaleManager.renderSalesBill(),
        removeSaleItem: (idx) => RetailSaleManager.removeSaleItem(idx),
        editSaleItem: (idx) => RetailSaleManager.editSaleItem(idx),
        updateSaleTotals: () => RetailSaleManager.updateSaleTotals(),
        updateSaleRunningTotal: () => RetailSaleManager.updateSaleRunningTotal(),
        updateSalePaymentTotal: () => RetailSaleManager.updateSalePaymentTotal(),
        fillReceivableAmount: (type) => RetailSaleManager.fillReceivableAmount(type),
        completeSale: () => RetailSaleManager.completeSale(),
        shareSaleWhatsApp: () => RetailSaleManager.shareSaleWhatsApp(),
        printSale: () => RetailSaleManager.printSale(),
        pickSaleContact: () => RetailSaleManager.pickSaleContact(),
        getSaleItems: () => RetailSaleManager.getSaleItems(),
        getSaleWeights: () => RetailSaleManager.getSaleWeights(),
        clearSale: () => RetailSaleManager.clearSale()
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
    
    // Wholesale Sales
    wholesaleSales: {
        loadItemsDropdown: () => WholesaleSalesManager.loadItemsDropdown(),
        loadItemDetails: () => WholesaleSalesManager.loadItemDetails(),
        addToWholesaleBill: () => WholesaleSalesManager.addToWholesaleBill(),
        removeWholesaleItem: (index) => WholesaleSalesManager.removeWholesaleItem(index),
        completeSale: () => WholesaleSalesManager.completeSale(),
        printWholesaleSale: () => WholesaleSalesManager.printWholesaleSale(),
        shareViaWhatsApp: () => WholesaleSalesManager.shareViaWhatsApp(),
        filterTab: (view, evt) => WholesaleSalesManager.filterSalesTab(view, evt),
        renderHistory: () => WholesaleSalesManager.renderSalesHistory(),
        renderOutstanding: () => WholesaleSalesManager.renderSalesOutstanding(),
        recordPayment: (saleId) => WholesaleSalesManager.recordPayment(saleId),
        markSaleAsCleared: (saleId) => WholesaleSalesManager.markSaleAsCleared(saleId),
        reprintSale: (index) => WholesaleSalesManager.reprintSale(index),
        reprintSaleById: (saleId) => WholesaleSalesManager.reprintSaleById(saleId),
        updateProfitCalculation: () => WholesaleSalesManager.updateProfitCalculation(),
        pickContact: () => WholesaleSalesManager.pickContact()
    },
    
    // History
    history: {
        saveBillToHistory: () => HistoryManager.saveBillToHistory(),
        render: () => HistoryManager.renderHistory(),
        viewBill: (index, type) => HistoryManager.viewBill(index, type),
        
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
        render: () => OutstandingManager.renderDue(),
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
    
    // Expenses
    expenses: {
        filterExpenseTab: (view, evt) => ExpensesManager.filterExpenseTab(view, evt),
        saveBusinessExpense: () => ExpensesManager.saveBusinessExpense(),
        savePersonalExpense: () => ExpensesManager.savePersonalExpense(),
        renderHistory: () => ExpensesManager.renderexpensesHistory(),
        updateExpensePersonOptions: () => ExpensesManager.updateExpensePersonOptions(),
        saveAndPrintBusiness: () => ExpensesManager.saveAndPrintBusiness(),
        saveAndPrintPersonal: () => ExpensesManager.saveAndPrintPersonal(),
        viewExpenseDetails: (index, category) => ExpensesManager.viewExpenseDetails(index, category),
        closeExpenseDetails: () => ExpensesManager.closeExpenseDetails(),
        editExpenseFromModal: () => ExpensesManager.editExpenseFromModal(),
        confirmDeleteExpense: () => ExpensesManager.confirmDeleteExpense(),
        editExpense: (expenseId, category) => ExpensesManager.editExpense(expenseId, category),
        deleteExpense: (expenseId, category) => ExpensesManager.deleteExpense(expenseId, category)
    },
    
    // Finance
    finance: {
        filterTab: (view, evt) => FinanceManager.filterTab(view, evt),
        setDateFilter: (filter, evt) => FinanceManager.setDateFilter(filter, evt),
        applyCustomDateFilter: () => FinanceManager.applyCustomDateFilter(),
        renderDashboard: () => FinanceManager.renderDashboard(),
        renderAssets: () => FinanceManager.renderAssets(),
        renderWithdrawals: () => FinanceManager.renderWithdrawals(),
        recordWithdrawal: () => FinanceManager.recordWithdrawal(),
        toggleOtherPurpose: () => FinanceManager.toggleOtherPurpose(),
        showAddAccountModal: () => FinanceManager.showAddAccountModal(),
        closeAccountModal: () => FinanceManager.closeAccountModal(),
        saveNewAccount: () => FinanceManager.saveNewAccount(),
        quickAddAccount: (name, icon) => FinanceManager.quickAddAccount(name, icon),
        editAccount: (index) => FinanceManager.editAccount(index),
        closeEditAccountModal: () => FinanceManager.closeEditAccountModal(),
        updateAccount: () => FinanceManager.updateAccount(),
        deleteAccount: () => FinanceManager.deleteAccount(),
        init: () => FinanceManager.init()
    },
    
    // Analytics
    analytics: {
        filterTab: (view, evt) => AnalyticsManager.filterTab(view, evt),
        setPeriod: (period, evt) => AnalyticsManager.setPeriod(period, evt),
        render: () => AnalyticsManager.renderAnalytics(),
        init: () => AnalyticsManager.init()
    },
    
    // Day (Today's Summary + Cash Management)
    day: {
        init: () => DayManager.init(),
        showSubTab: (tab) => DayManager.showSubTab(tab),
        loadTodayData: () => DayManager.loadTodayData(),
        filterTransactions: () => DayManager.filterTransactions()
    },
    
    // Cash Management
    cashManagement: {
        init: () => CashManagementManager.init(),
        signIn: () => CashManagementManager.signIn(),
        signOut: () => CashManagementManager.signOut(),
        recordTransaction: () => CashManagementManager.recordTransaction(),
        showDetails: (sessionDate) => CashManagementManager.showSessionDetails(sessionDate),
        loadTodaySession: () => CashManagementManager.loadTodaySession(),
        renderHistory: () => CashManagementManager.renderHistory(),
        calculateTodayTransactions: () => CashManagementManager.calculateTodayTransactions(),
        updateUI: () => CashManagementManager.updateUI()
    },
    
    // Sales (alias for wholesaleSales for easier access)
    sales: {
        loadItemsDropdown: () => WholesaleSalesManager.loadItemsDropdown(),
        loadItemDetails: () => WholesaleSalesManager.loadItemDetails(),
        renderHistory: () => WholesaleSalesManager.renderSalesHistory()
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


