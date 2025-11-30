// Firebase Configuration and Initialization
// This file will be loaded after Firebase SDK scripts in index.html

const firebaseConfig = {
  apiKey: "AIzaSyD0ib9JkKbqaNE2i_TZlXYJqEtXI_i2Fj8",
  authDomain: "aadhat-management.firebaseapp.com",
  projectId: "aadhat-management",
  storageBucket: "aadhat-management.firebasestorage.app",
  messagingSenderId: "297248223702",
  appId: "1:297248223702:web:9ff86424b130e77d6c7477",
  measurementId: "G-01155M3XPL"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

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

// Firebase initialized and ready
console.log('Firebase initialized successfully');
