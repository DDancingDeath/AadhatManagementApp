// -------------------- APPLICATION STATE --------------------

export const AppState = {
    // Authentication
    currentUser: null,
    userRole: 'staff',
    userName: 'User',
    
    // Database
    items: [],
    billItems: [],
    labourCharges: [],
    billHistory: [],
    currentWeights: [],
    stock: {},
    salesItems: [],
    salesHistory: [],
    retailSalesHistory: [],
    paymentsHistory: [],
    stockAdjustments: [],
    withdrawalsHistory: [],
    
    // UI State
    currentDateFilter: 'today',
    customDateRange: { from: null, to: null },
    transactionMode: 'purchase',
    reportFilters: { transaction: 'all', item: 'all', customer: 'all' },
    customerPhoneNumber: '',
    analyticsPeriod: '30days',
    currentDueFilter: 'purchase',
    
    // Edit state
    currentBillForEdit: null,
    currentBillType: null,
    currentBillIndex: null,
    
    // Modal
    modalResolve: null,
    
    // Printer
    connectedPrinter: null,
    printerSettings: JSON.parse(localStorage.getItem('printerSettings')) || {
        enabled: false,
        deviceId: null,
        deviceName: null,
        paperWidth: 48
    },
    
    // Settings
    settings: JSON.parse(localStorage.getItem("settings")) || {
        heavyWeightThreshold: 30,
        laborRate: 6,
        autoLaborEnabled: true,
        showHindi: false
    }
};

// Expose to window only for HTML event handlers
window.AppState = AppState;
