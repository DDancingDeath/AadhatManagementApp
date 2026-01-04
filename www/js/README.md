# Modular Code Structure

## Overview
The application uses ES6 modules with a clean separation of concerns for maintainability and scalability.

## Directory Structure

```
www/js/
├── utils/
│   ├── constants.js          # App constants (time delays, ESC/POS commands)
│   ├── state.js              # Global application state (AppState)
│   ├── helpers.js            # Utility functions (escapeHtml, debounce, formatDate, etc.)
│   └── template-loader.js    # Dynamic HTML template loading
├── ui/
│   ├── ui-manager.js         # UI utilities (loading, toast, modal, haptic)
│   └── navigation.js         # Tab navigation and menu management
├── auth/
│   └── authentication.js     # Login, register, logout, role management
├── firebase/
│   └── firestore-service.js  # Firestore CRUD operations
├── modules/
│   ├── analytics.js          # Usage analytics and charts
│   ├── billing.js            # Purchase bill creation (weights, labour)
│   ├── cash-management.js    # Session-based cash tracking
│   ├── configure.js          # App configuration
│   ├── datefilter.js         # Date range filtering
│   ├── finance.js            # Financial overview and profit/loss
│   ├── history.js            # Bill history and editing
│   ├── items.js              # Items and rates management
│   ├── miscellaneous.js      # Expenses and withdrawals
│   ├── outstanding.js        # Outstanding payments tracking
│   ├── reports.js            # Reports generation
│   ├── retail-sales.js       # Retail sales functionality
│   ├── sales.js              # Wholesale sales management
│   ├── settings.js           # App settings, audit logs, storage stats
│   ├── stock.js              # Stock tracking and adjustments
│   └── users.js              # User management and roles
├── services/
│   ├── audit.js              # Audit logging (90-day retention)
│   └── printer.js            # Bluetooth thermal printer (ESC/POS)
└── main.js                   # Application initialization
```

## Module Descriptions

### Utils

| Module | Description |
|--------|-------------|
| `constants.js` | Time constants, ESC/POS printer commands |
| `state.js` | Central AppState object for all global data |
| `helpers.js` | `escapeHtml()`, `debounce()`, `formatDate()`, `formatCurrency()`, `generateId()`, `pickContact()` |
| `template-loader.js` | Dynamically loads HTML templates |

### UI

| Module | Description |
|--------|-------------|
| `ui-manager.js` | `showLoading()`, `showToast()`, `showModal()`, haptic feedback |
| `navigation.js` | Tab switching, side menu, navigation state |

### Services

| Module | Description |
|--------|-------------|
| `audit.js` | `AuditService.log()`, `cleanupOldLogs()`, `getRecentLogs()` - 90-day retention |
| `printer.js` | Bluetooth printer connection, ESC/POS bill formatting |

### Business Modules

| Module | Description |
|--------|-------------|
| `billing.js` | Purchase bills with weights, multiple rates, labour charges |
| `sales.js` | Wholesale sales with stock deduction |
| `retail-sales.js` | Retail point-of-sale |
| `items.js` | Item CRUD, purchase/sale/wholesale rates |
| `stock.js` | Stock levels, adjustments, history |
| `history.js` | Bill history, view/edit/delete bills |
| `cash-management.js` | Cash session sign-in/out, balance tracking |
| `outstanding.js` | Customer/supplier outstanding amounts |
| `finance.js` | Profit/loss, financial overview |
| `reports.js` | Analytics, date-filtered reports |
| `miscellaneous.js` | Expenses, withdrawals |
| `settings.js` | App settings, audit log viewer, storage stats |
| `users.js` | User approval, role management (owner only) |

## Global Exports

All modules export to `window.app` namespace for HTML onclick handlers:

```javascript
window.app = {
    items: ItemsManager,
    billing: BillingManager,
    sales: SalesManager,
    stock: StockManager,
    // ... etc
};
```

## Loading

Modules are loaded via ES6 imports in `main.js`. The app initializes on `DOMContentLoaded`.
