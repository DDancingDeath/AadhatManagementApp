// Firebase Configuration and Initialization
// This file will be loaded after Firebase SDK scripts in index.html

// IMPORTANT: For production deployments, consider:
// 1. Restricting API key in Firebase Console (Application restrictions)
// 2. Setting up HTTP referrer restrictions
// 3. Using Firebase App Check for additional security

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================
// Set to 'development' for local testing with dummy data
// Set to 'production' for live app with real data
// 
// Option 1: Use URL parameter: ?env=development
// Option 2: Use localStorage: localStorage.setItem('appEnv', 'development')
// Option 3: Automatic: localhost = development, otherwise = production
// =============================================================================

// Check environment from multiple sources
const getEnvironment = () => {
  // 1. Check URL parameter (highest priority for quick testing)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('env')) return urlParams.get('env');
  
  // 2. Check localStorage (persists across sessions)
  if (localStorage.getItem('appEnv')) return localStorage.getItem('appEnv');
  
  // 3. Check if running on localhost in a BROWSER (not Capacitor app)
  // Capacitor apps run from capacitor:// or file:// protocol, not http://localhost
  const isCapacitorApp = window.location.protocol === 'capacitor:' || 
                         window.location.protocol === 'file:' ||
                         window.Capacitor?.isNativePlatform?.();
  
  if (!isCapacitorApp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'development';
  }
  
  // 4. Default to production (including Capacitor apps)
  return 'production';
};

const APP_ENV = getEnvironment();

// Collection prefix based on environment
// Production: 'items', 'purchases', etc.
// Development: 'dev_items', 'dev_purchases', etc.
const COLLECTION_PREFIX = APP_ENV === 'production' ? '' : 'dev_';

// All collections are now prefixed in dev mode (no shared collections)
// This keeps dev and prod data completely separate

console.log(`🔧 App Environment: ${APP_ENV} | Collection Prefix: "${COLLECTION_PREFIX}"`);

// Single Firebase Config (same project for both environments)
const firebaseConfig = {
  apiKey: "AIzaSyD0ib9JkKbqaNE2i_TZlXYJqEtXI_i2Fj8",
  authDomain: "aadhat-management.firebaseapp.com",
  projectId: "aadhat-management",
  storageBucket: "aadhat-management.firebasestorage.app",
  messagingSenderId: "297248223702",
  appId: "1:297248223702:web:9ff86424b130e77d6c7477",
  measurementId: "G-01155M3XPL"
};

// Expose environment globally
window.APP_ENV = APP_ENV;
window.COLLECTION_PREFIX = COLLECTION_PREFIX;

// Helper function to get prefixed collection name
window.getCollection = (name) => COLLECTION_PREFIX + name;

// Show environment indicator in UI (for development only)
if (APP_ENV !== 'production') {
  document.addEventListener('DOMContentLoaded', () => {
    const indicator = document.createElement('div');
    indicator.id = 'env-indicator';
    indicator.innerHTML = `🔧 ${APP_ENV.toUpperCase()}`;
    indicator.style.cssText = `
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      background: #ff6b35;
      color: white;
      padding: 2px 12px;
      font-size: 10px;
      font-weight: bold;
      z-index: 99999;
      border-radius: 0 0 4px 4px;
      text-transform: uppercase;
    `;
    document.body.appendChild(indicator);
  });
}

// Initialize Firebase
//
// IMPORTANT: variable is intentionally NOT named `app`. A `let app`
// declared at the top level of a classic <script> creates a binding in
// the global lexical environment that SHADOWS `window.app` for inline
// event handlers (`onclick="app.x()"`) — even though it is not visible
// as a `window.app` property in DevTools. That broke every
// `onclick="app.chat.X()"` button in www/templates/chat.html: the AI
// Assistant Send button silently threw `Cannot read properties of
// undefined (reading 'sendFromInput')` because inline handlers
// resolved `app` to *this* Firebase App instance instead of the
// application's `window.app` object.
//
// Found via Playwright interaction-driver in the staging clone repo
// (DDancingDeath/AadhatManagementApp-staging). Full RCA in that repo's
// docs/REVIEW_ISSUES.md → STG-WALK-5.
let firebaseApp;
try {
  firebaseApp = firebase.initializeApp(firebaseConfig);
} catch (error) {
  if (error.code === 'app/duplicate-app') {
    firebaseApp = firebase.app();
  } else {
    console.error('Firebase initialization error:', error);
    throw error;
  }
}

// Initialize Firebase Authentication
const auth = firebase.auth();

// Initialize Cloud Firestore
const db = firebase.firestore();

// Enable offline persistence (Note: Using compat API for simplicity)
db.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('The current browser does not support offline persistence');
    }
  });

// Expose db globally for modules that need it
window.db = db;
window.auth = auth;
