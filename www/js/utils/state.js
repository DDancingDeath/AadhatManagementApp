/**
 * Application State Module
 * Central state management for the Aadhat Management App
 * @module utils/state
 */

/**
 * @typedef {Object} PrinterSettings
 * @property {boolean} enabled - Whether Bluetooth printing is enabled
 * @property {string|null} deviceId - Connected printer device ID
 * @property {string|null} deviceName - Connected printer device name
 * @property {number} paperWidth - Paper width in characters (default 48)
 */

/**
 * @typedef {Object} AppSettings
 * @property {number} heavyWeightThreshold - Weight threshold for heavy items (kg)
 * @property {number} laborRate - Labor rate per kg for heavy items
 * @property {boolean} autoLaborEnabled - Auto-calculate labor charges
 * @property {boolean} showHindi - Display Hindi names for items
 */

/**
 * Global application state object
 * @type {Object}
 */
export const AppState = {
    /** @type {Object|null} Current authenticated Firebase user */
    currentUser: null,
    /** @type {string} Current user role: 'owner', 'manager', or 'staff' */
    userRole: 'staff',
    /** @type {string} Display name of current user */
    userName: 'User',
    
    // Database Collections
    /** @type {Array<Object>} All inventory items */
    items: [],
    /** @type {Array<Object>} Current bill items (temporary) */
    billItems: [],
    /** @type {Array<Object>} Labour charges for current bill */
    labourCharges: [],
    /** @type {Array<Object>} Purchase history */
    purchaseHistory: [],
    /** @type {Array<Object>} Retail sales history */
    retailSalesHistory: [],
    /** @type {Array<number>} Current weights being entered */
    currentWeights: [],
    /** @type {Object<string, {quantity: number, rate: number}>} Stock by item ID */
    stock: {},
    /** @type {Array<Object>} Current sale items (temporary) */
    salesItems: [],
    /** @type {Array<Object>} Wholesale sales history */
    salesHistory: [],
    /** @type {Array<Object>} Business and personal expenses history */
    expensesHistory: [],
    /** @type {Array<Object>} Stock adjustment records */
    stockAdjustments: [],
    /** @type {Array<Object>} Cash withdrawal history */
    withdrawalsHistory: [],
    
    // UI State
    /** @type {string} Current date filter: 'today', 'week', 'month', 'custom', 'all' */
    currentDateFilter: 'today',
    /** @type {{from: string|null, to: string|null}} Custom date range */
    customDateRange: { from: null, to: null },
    /** @type {string} Current billing mode: 'purchase' or 'sale' */
    transactionMode: 'purchase',
    /** @type {{transaction: string, item: string, customer: string}} Report filters */
    reportFilters: { transaction: 'all', item: 'all', customer: 'all' },
    /** @type {string} Customer phone number for current transaction */
    customerPhoneNumber: '',
    /** @type {string} Analytics period: '7days', '30days', '90days', 'all' */
    analyticsPeriod: '30days',
    /** @type {string} Outstanding filter: 'purchase' or 'sale' */
    currentDueFilter: 'purchase',
    
    // Edit State
    /** @type {Object|null} Bill currently being edited */
    currentBillForEdit: null,
    /** @type {string|null} Type of bill being edited */
    currentBillType: null,
    /** @type {number|null} Index of bill being edited */
    currentBillIndex: null,
    
    // Modal State
    /** @type {Function|null} Promise resolve function for modal */
    modalResolve: null,
    
    // Printer State
    /** @type {Object|null} Connected Bluetooth printer instance */
    connectedPrinter: null,
    /** @type {PrinterSettings} Printer configuration */
    printerSettings: JSON.parse(localStorage.getItem('printerSettings')) || {
        enabled: false,
        deviceId: null,
        deviceName: null,
        paperWidth: 48
    },
    
    // App Settings
    /** @type {AppSettings} Application settings */
    settings: JSON.parse(localStorage.getItem("settings")) || {
        heavyWeightThreshold: 30,
        laborRate: 6,
        autoLaborEnabled: true,
        showHindi: false
    }
};

// Expose to window only for HTML event handlers
window.AppState = AppState;
