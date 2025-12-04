# Modular Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         index.html                               │
│                     (User Interface)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SCRIPT LOADING ORDER                        │
│                                                                  │
│  1. Firebase Config + External Libraries                        │
│     └─ firebaseConfig.js, Chart.js, XLSX.js                    │
│                                                                  │
│  2. Core Utilities (Foundation)                                 │
│     ├─ utils/constants.js   (Constants)                        │
│     ├─ utils/state.js        (AppState)                        │
│     └─ utils/helpers.js      (Utility Functions)               │
│                                                                  │
│  3. UI Layer                                                    │
│     ├─ ui/ui-manager.js      (Toast, Modal, Loading)           │
│     └─ ui/navigation.js      (Menu, Tabs)                      │
│                                                                  │
│  4. Services                                                    │
│     ├─ firebase/firestore-service.js (Database)                │
│     └─ services/printer.js   (Bluetooth Printer)               │
│                                                                  │
│  5. Authentication                                              │
│     └─ auth/authentication.js (Login, Register, Roles)         │
│                                                                  │
│  6. Business Logic Modules                                      │
│     ├─ modules/items.js      (Items & Rates) ✅                │
│     ├─ modules/billing.js    (Purchase Bills) 🔄               │
│     ├─ modules/sales.js      (Sales) 🔄                        │
│     ├─ modules/stock.js      (Stock Tracking) 🔄               │
│     ├─ modules/payments.js   (Payments & Expenses) 🔄          │
│     ├─ modules/reports.js    (Analytics) 🔄                    │
│     ├─ modules/finance.js    (Finance) 🔄                      │
│     └─ modules/users.js      (User Management) 🔄              │
│                                                                  │
│  7. Main Initialization (Coordinator)                           │
│     └─ main.js               (App Init & Event Setup)           │
└─────────────────────────────────────────────────────────────────┘

Legend: ✅ Created  🔄 To Be Created
```

## Module Dependencies

```
                     ┌──────────────┐
                     │   Firebase   │
                     │   + Chart.js │
                     │   + XLSX.js  │
                     └──────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │Constants │     │  State   │     │ Helpers  │
    └──────────┘     └─────┬────┘     └──────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐   ┌──────────────┐
    │    UI    │     │Navigation│   │   Firebase   │
    │ Manager  │     │          │   │   Service    │
    └────┬─────┘     └────┬─────┘   └──────┬───────┘
         │                │                │
         └────────────────┼────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐   ┌──────────┐
    │   Auth   │    │  Printer │   │  Items   │
    │  Manager │    │  Service │   │  Manager │
    └──────────┘    └──────────┘   └──────────┘
                          │
                          │
                    ┌─────▼─────┐
                    │  Business │
                    │  Modules  │
                    │  (7 more) │
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  main.js  │
                    │   (Init)  │
                    └───────────┘
```

## Data Flow

```
User Action (HTML onclick)
         │
         ▼
Module Function (e.g., ItemsManager.addItem)
         │
         ├─── Update UI (UIManager.showLoading)
         │
         ├─── Modify State (AppState.items)
         │
         ├─── Call Service (FirebaseService.saveItem)
         │         │
         │         └─── Firestore Database
         │
         ├─── Update UI (UIManager.showToast)
         │
         └─── Render (ItemsManager.renderItems)
```

## Module Communication

```
┌─────────────┐
│   HTML      │ onclick="ItemsManager.addItem()"
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Items       │ calls → FirebaseService.saveItem()
│ Manager     │ calls → UIManager.showLoading()
└──────┬──────┘ reads → AppState.items
       │
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐  ┌─────────────┐
│  Firebase   │  │     UI      │
│  Service    │  │   Manager   │
└──────┬──────┘  └─────────────┘
       │
       ▼
┌─────────────┐
│  Firestore  │
│  Database   │
└─────────────┘
```

## State Management Flow

```
┌──────────────────────────────────────────────┐
│           AppState (state.js)                │
│  - Central source of truth                   │
│  - All modules read/write here               │
├──────────────────────────────────────────────┤
│  currentUser, userRole, userName             │
│  items[], billHistory[], salesHistory[]      │
│  stock{}, paymentsHistory[], settings{}      │
└──────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    Items     │ │   Billing    │ │    Sales     │
│   Manager    │ │   Manager    │ │   Manager    │
└──────────────┘ └──────────────┘ └──────────────┘
         │              │              │
         └──────────────┼──────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Firebase Service │
              │  (Auto-sync)      │
              └──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │    Firestore     │
              │    Database      │
              └──────────────────┘
```

## Event Flow

```
1. Page Load
   └─→ main.js initializes
       └─→ Firebase auth listener
           └─→ loadUserDataAndInitialize()
               ├─→ Load data from Firestore
               ├─→ Setup realtime listeners
               ├─→ Restore draft bills
               ├─→ Apply role restrictions
               └─→ Render initial views

2. User Interaction
   └─→ Click button in HTML
       └─→ Call module function
           ├─→ Show loading
           ├─→ Validate input
           ├─→ Update AppState
           ├─→ Call FirebaseService
           │   └─→ Save to Firestore
           ├─→ Update UI
           └─→ Show toast

3. Realtime Update
   └─→ Firestore change detected
       └─→ Realtime listener callback
           ├─→ Update AppState
           └─→ Re-render affected views
```

## File Size Breakdown

```
Original:
  script.js: 7,242 lines 🔴

After Modularization:
  constants.js:        45 lines
  state.js:            55 lines
  helpers.js:          55 lines
  ui-manager.js:      130 lines
  navigation.js:       60 lines
  authentication.js:  380 lines
  firestore-service:  290 lines
  items.js:           315 lines
  printer.js:         260 lines
  main.js:            120 lines
  ────────────────────────────
  Total:           ~1,710 lines ✅
  
  Remaining in script.js: ~5,500 lines 🔄
```

## Benefits Visualization

```
Before (Monolithic):
┌──────────────────────────────────────┐
│                                      │
│         script.js                    │
│         7,242 lines                  │
│                                      │
│  ❌ Hard to navigate                 │
│  ❌ Merge conflicts                  │
│  ❌ No separation of concerns        │
│  ❌ Difficult to test                │
│  ❌ Hard to maintain                 │
│                                      │
└──────────────────────────────────────┘

After (Modular):
┌─────────┐ ┌─────────┐ ┌─────────┐
│  Auth   │ │Firebase │ │   UI    │
│  380L   │ │  290L   │ │  190L   │
└─────────┘ └─────────┘ └─────────┘
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Items   │ │ Printer │ │  Utils  │
│  315L   │ │  260L   │ │  155L   │
└─────────┘ └─────────┘ └─────────┘

✅ Easy to find code
✅ Parallel development
✅ Clear responsibilities
✅ Easy to test
✅ Simple maintenance
```
