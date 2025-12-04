# Modular Code Structure

## Overview
The application has been refactored into a modular structure for better maintainability, scalability, and code organization.

## Directory Structure

```
www/
├── js/
│   ├── utils/
│   │   ├── constants.js      # Application constants
│   │   ├── state.js          # Global application state
│   │   └── helpers.js        # Utility helper functions
│   ├── ui/
│   │   ├── ui-manager.js     # UI utilities (loading, toast, modal, haptic)
│   │   └── navigation.js     # Navigation and tab management
│   ├── auth/
│   │   └── authentication.js # Login, register, logout, role management
│   ├── firebase/
│   │   └── firestore-service.js # Firestore CRUD operations
│   ├── modules/
│   │   ├── items.js          # Items and rates management
│   │   ├── billing.js        # Purchase billing (TO BE CREATED)
│   │   ├── sales.js          # Sales management (TO BE CREATED)
│   │   ├── stock.js          # Stock tracking (TO BE CREATED)
│   │   ├── payments.js       # Payments and expenses (TO BE CREATED)
│   │   ├── reports.js        # Reports and analytics (TO BE CREATED)
│   │   ├── finance.js        # Finance and accounting (TO BE CREATED)
│   │   └── users.js          # User management (TO BE CREATED)
│   ├── services/
│   │   └── printer.js        # Bluetooth printer service
│   └── main.js               # Application initialization
├── script.js                 # LEGACY FILE (to be phased out)
├── index.html                # Main HTML file
└── styles.css                # Styles

```

## Module Descriptions

### Core Modules

#### **utils/constants.js**
- Defines application-wide constants
- ESC/POS commands for printer
- Default settings, transaction modes, filter types, user roles

#### **utils/state.js**
- Central application state management
- Contains all global variables (items, bills, sales, etc.)
- Accessible via `window.AppState`

#### **utils/helpers.js**
- Utility functions used across the app
- `escapeHtml()`, `debounce()`, `formatDate()`, `formatCurrency()`, `generateId()`

### UI Modules

#### **ui/ui-manager.js**
- All UI-related utilities
- Loading overlay, toast notifications, modal dialogs
- Haptic feedback for mobile
- Accessible via `window.UIManager`

#### **ui/navigation.js**
- Side navigation menu management
- Tab switching and navigation
- Accessible via `window.NavigationManager`

### Authentication

#### **auth/authentication.js**
- User login, registration, and logout
- Role-based access control
- User display and restrictions
- Accessible via `window.AuthManager`

### Firebase

#### **firestore-service.js**
- All Firestore database operations
- CRUD operations for items, bills, sales, payments, etc.
- Real-time listeners setup
- Accessible via `window.FirebaseService`

### Business Logic Modules

#### **modules/items.js**
- Item and rate management
- Add, edit, delete items
- Purchase and sale rates
- Excel import/export
- Accessible via `window.ItemsManager`

#### **modules/billing.js** (TO BE CREATED)
- Purchase bill creation
- Weight management
- Labour charges calculation
- Bill saving and printing

#### **modules/sales.js** (TO BE CREATED)
- Sales bill creation
- Stock deduction
- Customer management
- Sales history

#### **modules/stock.js** (TO BE CREATED)
- Stock tracking and display
- Stock adjustments
- Low stock alerts
- Stock calculations

#### **modules/payments.js** (TO BE CREATED)
- Payment recording
- Business and personal expenses
- Payment history
- Withdrawal management

#### **modules/reports.js** (TO BE CREATED)
- Report generation
- Date filtering
- Item-wise reports
- Purchase/sales analytics

#### **modules/finance.js** (TO BE CREATED)
- Financial overview
- Profit/loss calculations
- Monthly charts
- Account breakdown

#### **modules/users.js** (TO BE CREATED)
- User approval/rejection
- Role management
- User listing

### Services

#### **services/printer.js**
- Bluetooth printer connection
- ESC/POS command generation
- Print bill functionality
- Accessible via `window.PrinterService`

### Main Entry Point

#### **main.js**
- Application initialization
- Firebase auth listener
- Data loading coordination
- Event listener setup

## Loading Order in HTML

The scripts must be loaded in this specific order:

```html
<!-- 1. External Libraries -->
<script src="firebaseConfig.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

<!-- 2. Utilities (no dependencies) -->
<script src="js/utils/constants.js"></script>
<script src="js/utils/state.js"></script>
<script src="js/utils/helpers.js"></script>

<!-- 3. UI Layer (depends on state) -->
<script src="js/ui/ui-manager.js"></script>
<script src="js/ui/navigation.js"></script>

<!-- 4. Services (depends on utilities) -->
<script src="js/firebase/firestore-service.js"></script>
<script src="js/services/printer.js"></script>

<!-- 5. Authentication (depends on firebase and UI) -->
<script src="js/auth/authentication.js"></script>

<!-- 6. Business Logic Modules (depends on all above) -->
<script src="js/modules/items.js"></script>
<script src="js/modules/billing.js"></script>
<script src="js/modules/sales.js"></script>
<script src="js/modules/stock.js"></script>
<script src="js/modules/payments.js"></script>
<script src="js/modules/reports.js"></script>
<script src="js/modules/finance.js"></script>
<script src="js/modules/users.js"></script>

<!-- 7. Main initialization (last) -->
<script src="js/main.js"></script>
```

## Migration Status

### ✅ Completed
- Directory structure created
- Constants and state management
- UI utilities (loading, toast, modal, haptic)
- Navigation and tab management
- Authentication module
- Firebase service
- Items management
- Printer service
- Main initialization

### 🔄 Remaining (Still in script.js)
- Billing module (purchase bills, weights, labour)
- Sales module (sales bills, customer management)
- Stock module (stock tracking, adjustments)
- Payments module (payments, expenses, withdrawals)
- Reports module (analytics, charts, filters)
- Finance module (profit/loss, account breakdown)
- Users module (user approval, role changes)
- Chat/Chatbot functionality
- WhatsApp integration
- Contact picker
- Various render functions

## Backward Compatibility

All modules export their functions to `window` for backward compatibility with the existing HTML. This allows the transition to be gradual.

Example:
```javascript
// Module function
ItemsManager.renderItems()

// Also available as global function
window.renderItems()
```

## Next Steps

1. Create remaining module files (billing, sales, stock, etc.)
2. Update index.html to include all module scripts
3. Test thoroughly to ensure all functionality works
4. Gradually remove backward compatibility exports
5. Update HTML to use module references directly
6. Eventually deprecate the old script.js file

## Benefits

✅ **Better Organization**: Related code grouped together
✅ **Easier Maintenance**: Find and update code quickly  
✅ **Reusability**: Modules can be reused across projects
✅ **Testability**: Individual modules can be tested separately
✅ **Scalability**: Easy to add new features
✅ **Team Collaboration**: Multiple developers can work on different modules
✅ **Performance**: Load only required modules (future optimization)
