# AadhatManagementApp

A comprehensive business management application for wholesale/retail operations built with ES6 modules, Firebase, and Capacitor for Android deployment.

## Features

- **Purchase & Sales Management**: Separate collections for purchases, retail sales, and wholesale sales
- **Real-time Sync**: Automatic UI updates via Firestore onSnapshot listeners
- **Stock Tracking**: Real-time stock levels with adjustment history
- **Cash Management**: Session-based cash tracking with sign-in/sign-out
- **User Management**: Role-based access (owner, manager, staff)
- **Reports & Analytics**: Daily/weekly/monthly reports with charts
- **Bluetooth Printing**: ESC/POS thermal printer support
- **Audit Logging**: 90-day retention for critical actions
- **Outstanding Tracking**: Customer/supplier payment management
- **Offline Support**: Service worker for offline functionality

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Mobile**: Capacitor 7.x (Android)
- **Hosting**: Firebase Hosting
- **Testing**: Jest + Babel

## Project Structure

```
├── www/                    # Web application
│   ├── js/
│   │   ├── __tests__/     # Unit tests
│   │   ├── auth/          # Authentication module
│   │   ├── firebase/      # Firestore service
│   │   ├── modules/       # Business logic modules
│   │   ├── services/      # Printer, audit services
│   │   ├── ui/            # UI management, navigation
│   │   ├── utils/         # Constants, state, helpers, validator
│   │   └── main.js        # App initialization
│   ├── css/               # Modular stylesheets
│   ├── templates/         # HTML templates
│   ├── service-worker.js  # Offline support
│   └── index.html         # Main entry point
├── android/               # Capacitor Android project
├── jest.config.js         # Jest test configuration
├── babel.config.js        # Babel ES6 transform config
└── firebase.json          # Firebase configuration
```

## Firebase Collections

| Collection | Purpose | State Property |
|------------|---------|----------------|
| `items` | Product catalog with rates | `AppState.items` |
| `purchases` | Purchase transactions (stock IN) | `AppState.purchaseHistory` |
| `retailSales` | Retail sales from billing tab | `AppState.retailSalesHistory` |
| `wholesaleSales` | Wholesale sales from sales tab | `AppState.salesHistory` |
| `expenses` | Business expenses | `AppState.expensesHistory` |
| `stockAdjustments` | Manual stock corrections | `AppState.stockAdjustments` |
| `withdrawals` | Cash withdrawals | `AppState.withdrawalsHistory` |
| `cashSessions` | Cash management sessions | (loaded on demand) |
| `users` | User accounts and roles | (loaded on demand) |

### Real-time Auto-Update

The app uses Firestore `onSnapshot` listeners for automatic UI synchronization:

- **Items**: Updates item dropdowns across all tabs
- **Purchases/Sales**: Recalculates stock, updates history, finance, analytics
- **Expenses**: Updates expense history and reports
- **Stock Adjustments**: Recalculates stock levels
- **Withdrawals**: Updates withdrawal history
- **Cash Sessions**: Updates cash management view

All listeners are set up via `FirebaseService.setupRealtimeListeners()` and cleaned up on logout via `FirebaseService.cleanup()`.

### Recent-history window and stock checkpoint (free-plan reads)

Each app open reads only recent data (see the section comment above `HISTORY_COLLECTIONS` in `www/js/firebase/firestore-service.js`):

- History collections are listened to from the 1st of the previous month (`timestamp >= liveFrom`); older bills with money due come from one listener per bill collection (`openDue == true && timestamp < liveFrom`). Older history is loaded on demand (`FirebaseService.ensureHistoryFrom()` / `loadOlderHistory()`).
- Stock = `stockCheckpoints/current` (running stock before `asOf`) + replay of newer events; identical to a full replay. Only **owner/manager** devices rebuild it (full read: when missing/stale, and at least weekly) or roll it forward. Staff devices never write it; while it is stale they load full history instead (correct but costs a full read per open until an owner/manager opens the app).
- Every stock-record write sets `clientVersion: 3`, bills also `openDue`, `timestamp`. Documents written by older app versions without `timestamp` are found by an unfiltered scan and backfilled (`stockCheckpoints/legacyScan`: until complete, then by one device at most every 6 h for 14 days after an outdated app last wrote one).
- Optional: set `settings/app.minClientVersion` to make older apps show "Please update the app".

**Deployment order (CI never deploys rules/indexes):**

1. Deploy `firestore.indexes.json` (`firebase deploy --only firestore:indexes`) — the dues listener needs the `openDue + timestamp` composite indexes.
2. Ship the new app (APK + web) and make sure **every phone runs it**.
3. Only then deploy `firestore.rules` (`firebase deploy --only firestore:rules`): it rejects bill/adjustment writes without `clientVersion >= 3` (blocks outdated apps, whose edits/deletes of old bills would otherwise not invalidate the stock checkpoint) and limits checkpoint state writes to owner/manager.

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Android Studio (for mobile builds)

### Installation
```bash
# Install dependencies
npm install
```

### Development
```bash
# Run local server
npm start
# OR
npx http-server www -p 8080

# Deploy to Firebase
firebase deploy --only hosting
```

### Android Build
```bash
# Sync Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

**Supported Android versions:** Android 11 (API 30) and newer (`minSdkVersion = 30` in `android/variables.gradle`).

Build an APK from the command line (requires JDK 21 and the Android SDK):
```bash
npm ci
npx cap sync android
cd android
./gradlew assembleDebug     # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # signed only if a keystore is configured (see below)
```

Release signing: create `android/keystore.properties` (git-ignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`,
or set `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.


## Testing

The project uses Jest for unit testing with Babel for ES6 module transformation.

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Structure

```
www/js/__tests__/
├── __mocks__/
│   └── firebase-mock.js   # Mock Firebase/Firestore for testing
├── helpers.test.js        # Tests for utility helper functions (26 tests)
├── state.test.js          # Tests for AppState module (31 tests)
└── validator.test.js      # Tests for form validation utilities (45 tests)
```

### Current Coverage

| File | Statements | Branches | Functions | Lines |
|------|------------|----------|-----------|-------|
| helpers.js | 62.96% | 38.88% | 75% | 62.74% |
| state.js | 100% | 100% | 100% | 100% |
| validator.js | 96.22% | 93.47% | 90% | 96% |

### Writing Tests

Tests are written using Jest syntax. Example:

```javascript
import { Validator } from '../utils/validator.js';

describe('Validator', () => {
    test('should validate required fields', () => {
        const result = Validator.required('value', 'Field Name');
        expect(result.valid).toBe(true);
    });
});
```

### Test Configuration

- **Jest Config**: `jest.config.js` - Test environment, patterns, coverage settings
- **Babel Config**: `babel.config.js` - ES6 module transformation for Node.js

### Firestore Security Rules Tests

`firestore.rules` only lets *approved* users (profile in `users`/`dev_users` with role owner/manager/staff and status not `pending`/`rejected`; a missing status counts as approved) touch business data, and stops users from changing their own `role`/`status`/`approvedAt`/`approvedBy`. The rules are tested against the Firestore emulator (needs Java 11+ on `PATH`/`JAVA_HOME`):

```bash
cd rules-tests && npm install && cd ..   # one-time: separate deps for the rules tests
npm run test:rules                       # starts the emulator (demo-aadhat project, port 8181) and runs rules-tests/test.js
```

## Validation

The app includes a comprehensive validation utility (`www/js/utils/validator.js`) for client-side form validation:

```javascript
import { Validator } from './utils/validator.js';

// Validate a bill before saving
const result = Validator.validateBill({
    sellerName: 'Supplier Name',
    items: [{ name: 'Rice', rate: 50, weight: 10 }]
});

if (!result.valid) {
    console.log(result.errors); // Array of error messages
}
```

## Service Worker (Offline Support)

The app includes a service worker (`www/service-worker.js`) that:
- Caches static assets (CSS, JS, HTML, templates)
- Uses cache-first strategy for static files
- Uses network-first strategy for Firebase API calls
- Enables basic offline functionality

## Documentation

- **Module Documentation**: [www/js/README.md](www/js/README.md)
- **Architecture Diagram**: [www/js/ARCHITECTURE_DIAGRAM.md](www/js/ARCHITECTURE_DIAGRAM.md)
- **Quick Start Guide**: [www/js/QUICK_START.md](www/js/QUICK_START.md)