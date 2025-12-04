// -------------------- CONSTANTS --------------------

// ESC/POS Commands
export const ESC = '\x1B';
export const GS = '\x1D';

// Default Settings
export const DEFAULT_SETTINGS = {
    heavyWeightThreshold: 30,
    laborRate: 6,
    autoLaborEnabled: true,
    showHindi: false
};

// Transaction Modes
export const TRANSACTION_MODES = {
    PURCHASE: 'purchase',
    SALE: 'sale'
};

// Filter Types
export const FILTER_TYPES = {
    TODAY: 'today',
    WEEK: 'week',
    MONTH: 'month',
    CUSTOM: 'custom',
    ALL: 'all'
};

// User Roles
export const USER_ROLES = {
    OWNER: 'owner',
    MANAGER: 'manager',
    STAFF: 'staff'
};

// Analytics Periods
export const ANALYTICS_PERIODS = {
    SEVEN_DAYS: '7days',
    THIRTY_DAYS: '30days',
    NINETY_DAYS: '90days',
    ALL_TIME: 'all'
};
