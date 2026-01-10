/**
 * @fileoverview Telemetry Service for error tracking and diagnostics
 * Captures all errors and exceptions, groups them, and stores in Firestore
 * @module services/telemetry
 */

import { AppState } from '../utils/state.js';

/**
 * Maximum number of errors to store locally before syncing
 * @constant {number}
 */
const MAX_LOCAL_ERRORS = 50;

/**
 * Debounce time for syncing errors to Firestore (ms)
 * @constant {number}
 */
const SYNC_DEBOUNCE = 5000;

/**
 * Telemetry Service - Captures and stores application errors
 * @namespace TelemetryService
 */
const TelemetryService = {
    /**
     * Local error buffer
     * @type {Array}
     */
    errorBuffer: [],

    /**
     * Sync timer ID
     * @type {number|null}
     */
    syncTimer: null,

    /**
     * Whether telemetry is initialized
     * @type {boolean}
     */
    initialized: false,

    /**
     * Get Firestore database reference
     * @returns {firebase.firestore.Firestore}
     */
    getDb() {
        return firebase.firestore();
    },

    /**
     * Get collection name with environment prefix
     * @param {string} name - Collection name
     * @returns {string}
     */
    col(name) {
        return window.getCollection ? window.getCollection(name) : name;
    },

    /**
     * Initialize telemetry service
     */
    init() {
        if (this.initialized) return;

        // Override global error handlers
        const originalOnError = window.onerror;
        window.onerror = (message, source, lineno, colno, error) => {
            this.captureError({
                type: 'uncaught',
                message: message,
                source: source,
                line: lineno,
                column: colno,
                stack: error?.stack
            });
            if (originalOnError) {
                originalOnError(message, source, lineno, colno, error);
            }
        };

        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.captureError({
                type: 'unhandledrejection',
                message: event.reason?.message || String(event.reason),
                stack: event.reason?.stack
            });
        });

        // Intercept console.error
        const originalConsoleError = console.error;
        console.error = (...args) => {
            this.captureConsoleError(args);
            originalConsoleError.apply(console, args);
        };

        this.initialized = true;
        console.log('Telemetry service initialized');
    },

    /**
     * Capture a console.error call
     * @param {Array} args - Console error arguments
     */
    captureConsoleError(args) {
        const message = args.map(arg => {
            if (arg instanceof Error) {
                return arg.message;
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        // Skip certain noisy errors
        if (message.includes('Telemetry') || 
            message.includes('telemetry') ||
            message.includes('FirebaseError: The query requires an index')) {
            return;
        }

        this.captureError({
            type: 'console.error',
            message: message.substring(0, 500), // Limit message length
            stack: args.find(a => a instanceof Error)?.stack
        });
    },

    /**
     * Capture an error
     * @param {Object} errorData - Error data
     */
    captureError(errorData) {
        const error = {
            ...errorData,
            timestamp: Date.now(),
            date: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
            userId: AppState.currentUser?.uid || 'anonymous',
            userName: AppState.userName || 'Unknown',
            userRole: AppState.userRole || 'unknown',
            // Create a fingerprint for grouping
            fingerprint: this.createFingerprint(errorData)
        };

        this.errorBuffer.push(error);

        // Limit buffer size
        if (this.errorBuffer.length > MAX_LOCAL_ERRORS) {
            this.errorBuffer.shift();
        }

        // Debounced sync
        this.schedulSync();
    },

    /**
     * Create a fingerprint for error grouping
     * @param {Object} errorData - Error data
     * @returns {string} Fingerprint hash
     */
    createFingerprint(errorData) {
        const parts = [
            errorData.type,
            errorData.message?.substring(0, 100),
            errorData.source?.split('/').pop(),
            errorData.line
        ].filter(Boolean);
        
        // Simple hash
        const str = parts.join('|');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    },

    /**
     * Schedule sync to Firestore
     */
    schedulSync() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
        this.syncTimer = setTimeout(() => this.syncToFirestore(), SYNC_DEBOUNCE);
    },

    /**
     * Sync errors to Firestore
     */
    async syncToFirestore() {
        if (this.errorBuffer.length === 0) return;
        if (!AppState.currentUser) return;

        const errorsToSync = [...this.errorBuffer];
        this.errorBuffer = [];

        try {
            const db = this.getDb();
            const batch = db.batch();

            // Group errors by fingerprint
            const grouped = {};
            errorsToSync.forEach(error => {
                const fp = error.fingerprint;
                if (!grouped[fp]) {
                    grouped[fp] = {
                        ...error,
                        count: 0,
                        occurrences: []
                    };
                }
                grouped[fp].count++;
                grouped[fp].lastSeen = error.timestamp;
                grouped[fp].occurrences.push({
                    timestamp: error.timestamp,
                    userId: error.userId,
                    userName: error.userName
                });
                // Keep only last 10 occurrences
                if (grouped[fp].occurrences.length > 10) {
                    grouped[fp].occurrences.shift();
                }
            });

            // Upsert each grouped error
            for (const [fingerprint, errorData] of Object.entries(grouped)) {
                const docRef = db.collection(this.col('telemetry')).doc(fingerprint);
                
                // Try to get existing doc
                const existing = await docRef.get();
                if (existing.exists) {
                    const data = existing.data();
                    batch.update(docRef, {
                        count: firebase.firestore.FieldValue.increment(errorData.count),
                        lastSeen: errorData.lastSeen,
                        occurrences: firebase.firestore.FieldValue.arrayUnion(...errorData.occurrences.slice(-5))
                    });
                } else {
                    batch.set(docRef, {
                        ...errorData,
                        firstSeen: errorData.timestamp
                    });
                }
            }

            await batch.commit();
        } catch (error) {
            // Don't recursively log telemetry errors
            console.warn('Telemetry sync failed:', error.message);
            // Re-add errors to buffer
            this.errorBuffer = [...errorsToSync, ...this.errorBuffer].slice(0, MAX_LOCAL_ERRORS);
        }
    },

    /**
     * Manually log an error
     * @param {string} message - Error message
     * @param {Object} [context] - Additional context
     */
    logError(message, context = {}) {
        this.captureError({
            type: 'manual',
            message: message,
            context: context
        });
    },

    /**
     * Manually log a warning
     * @param {string} message - Warning message
     * @param {Object} [context] - Additional context
     */
    logWarning(message, context = {}) {
        this.captureError({
            type: 'warning',
            message: message,
            context: context
        });
    },

    /**
     * Get all telemetry data (owner only)
     * @returns {Promise<Array>} Telemetry data
     */
    async getTelemetryData() {
        if (AppState.userRole !== 'owner') {
            throw new Error('Unauthorized');
        }

        try {
            const db = this.getDb();
            const snapshot = await db.collection(this.col('telemetry'))
                .orderBy('lastSeen', 'desc')
                .limit(100)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.warn('Failed to get telemetry data:', error.message);
            return [];
        }
    },

    /**
     * Clear telemetry data (owner only)
     * @returns {Promise<void>}
     */
    async clearTelemetryData() {
        if (AppState.userRole !== 'owner') {
            throw new Error('Unauthorized');
        }

        try {
            const db = this.getDb();
            const snapshot = await db.collection(this.col('telemetry')).get();
            
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
        } catch (error) {
            console.warn('Failed to clear telemetry data:', error.message);
            throw error;
        }
    },

    /**
     * Delete a specific error (owner only)
     * @param {string} errorId - Error fingerprint ID
     * @returns {Promise<void>}
     */
    async deleteError(errorId) {
        if (AppState.userRole !== 'owner') {
            throw new Error('Unauthorized');
        }

        try {
            const db = this.getDb();
            await db.collection(this.col('telemetry')).doc(errorId).delete();
        } catch (error) {
            console.warn('Failed to delete error:', error.message);
            throw error;
        }
    }
};

export { TelemetryService };
