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
- **Offline-Ready**: Works with intermittent connectivity

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Mobile**: Capacitor 7.x (Android)
- **Hosting**: Firebase Hosting

## Project Structure

```
├── www/                    # Web application
│   ├── js/
│   │   ├── auth/          # Authentication module
│   │   ├── firebase/      # Firestore service
│   │   ├── modules/       # Business logic modules
│   │   ├── services/      # Printer, audit services
│   │   ├── ui/            # UI management, navigation
│   │   ├── utils/         # Constants, state, helpers
│   │   └── main.js        # App initialization
│   ├── css/               # Modular stylesheets
│   ├── templates/         # HTML templates
│   └── index.html         # Main entry point
├── android/               # Capacitor Android project
└── firebase.json          # Firebase configuration
```

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Android Studio (for mobile builds)

### Development
```bash
# Install dependencies
npm install

# Run local server
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

## Documentation

See [www/js/README.md](www/js/README.md) for detailed module documentation.