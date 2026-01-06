// Audit Logging Service
import { AppState } from '../utils/state.js';

export class AuditService {
    // Retention period in days
    static RETENTION_DAYS = 90;
    
    static ACTIONS = {
        // Bills
        CREATE_BILL: 'CREATE_BILL',
        DELETE_BILL: 'DELETE_BILL',
        EDIT_BILL: 'EDIT_BILL',
        
        // Sales
        CREATE_SALE: 'CREATE_SALE',
        DELETE_SALE: 'DELETE_SALE',
        EDIT_SALE: 'EDIT_SALE',
        
        // Items
        CREATE_ITEM: 'CREATE_ITEM',
        DELETE_ITEM: 'DELETE_ITEM',
        EDIT_ITEM: 'EDIT_ITEM',
        
        // Payments
        RECORD_PAYMENT: 'RECORD_PAYMENT',
        UPDATE_PAYMENT: 'UPDATE_PAYMENT',
        CLEAR_DUE: 'CLEAR_DUE',
        
        // Stock
        ADJUST_STOCK: 'ADJUST_STOCK',
        
        // Finance
        RECORD_WITHDRAWAL: 'RECORD_WITHDRAWAL',
        RECORD_EXPENSE: 'RECORD_EXPENSE',
        
        // Data Management
        CLEAR_DATA: 'CLEAR_DATA',
        
        // Auth
        LOGIN: 'LOGIN',
        LOGOUT: 'LOGOUT'
    };

    static async log(action, details = {}) {
        try {
            const db = firebase.firestore();
            const user = firebase.auth().currentUser;
            
            const auditEntry = {
                action,
                userId: user?.uid || 'unknown',
                userName: AppState.userName || 'Unknown User',
                userRole: AppState.userRole || 'unknown',
                details: typeof details === 'string' ? { message: details } : details,
                timestamp: Date.now(),
                date: new Date().toISOString()
            };
            
            await db.collection(window.getCollection ? window.getCollection('auditLogs') : 'auditLogs').add(auditEntry);
            
        } catch (error) {
            // Don't let audit failures break the app
            console.error('[AUDIT ERROR]', error);
        }
    }

    static async getRecentLogs(limit = 50) {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection(window.getCollection ? window.getCollection('auditLogs') : 'auditLogs')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error fetching audit logs:', error);
            return [];
        }
    }

    static async getLogsByUser(userId, limit = 50) {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection(window.getCollection ? window.getCollection('auditLogs') : 'auditLogs')
                .where('userId', '==', userId)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error fetching user audit logs:', error);
            return [];
        }
    }

    static async getLogsByAction(action, limit = 50) {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection(window.getCollection ? window.getCollection('auditLogs') : 'auditLogs')
                .where('action', '==', action)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error fetching action audit logs:', error);
            return [];
        }
    }

    /**
     * Clean up old audit logs beyond retention period
     * Called automatically when app loads (for owners only)
     */
    static async cleanupOldLogs() {
        try {
            // Only owners can delete logs
            if (AppState.userRole !== 'owner') {
                return { deleted: 0, skipped: true };
            }
            
            const db = firebase.firestore();
            const cutoffDate = Date.now() - (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
            
            // Get logs older than retention period
            const snapshot = await db.collection(window.getCollection ? window.getCollection('auditLogs') : 'auditLogs')
                .where('timestamp', '<', cutoffDate)
                .limit(100) // Process in batches to avoid timeout
                .get();
            
            if (snapshot.empty) {
                return { deleted: 0 };
            }
            
            // Delete in batch
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            
            return { deleted: snapshot.size };
            
        } catch (error) {
            console.error('[AUDIT] Cleanup error:', error);
            return { deleted: 0, error: error.message };
        }
    }
}
