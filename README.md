# AadhatManagementApp

A comprehensive business management application for wholesale/retail operations built with ES6 modules, Firebase, and Capacitor for Android deployment.

## Features

- **Purchase & Sales Management**: Create bills with weight-based entries, multiple rates, labour charges
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