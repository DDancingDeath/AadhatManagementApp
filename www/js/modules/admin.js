/**
 * @fileoverview Admin Manager - Unified admin panel for Configure, Users, and Data management
 * Owner-only access to system configuration
 * @module modules/admin
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';

/**
 * Admin Manager - Unified admin panel
 * @namespace AdminManager
 */
const AdminManager = {
    /**
     * Current active tab
     * @type {string}
     */
    activeTab: 'configure',

    /**
     * Storage stats data
     * @type {Object|null}
     */
    storageStats: null,

    /**
     * Initialize admin panel
     */
    async init() {
        if (AppState.userRole !== 'owner') {
            UIManager.showToast('Access denied', 'error');
            return;
        }
        this.renderTabs();
        this.renderContent();
    },

    /**
     * Render the tab buttons
     */
    renderTabs() {
        const container = document.getElementById('adminTabsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="filter-buttons" style="margin-bottom: 16px;">
                <button class="filter-btn ${this.activeTab === 'configure' ? 'active' : ''}" 
                        onclick="window.app.admin.showTab('configure')">
                    🔧 Configure
                </button>
                <button class="filter-btn ${this.activeTab === 'users' ? 'active' : ''}" 
                        onclick="window.app.admin.showTab('users')">
                    👥 Users
                </button>
                <button class="filter-btn ${this.activeTab === 'data' ? 'active' : ''}" 
                        onclick="window.app.admin.showTab('data')">
                    📊 Data
                </button>
            </div>
        `;
    },

    /**
     * Switch tab
     * @param {string} tab - Tab name
     */
    showTab(tab) {
        this.activeTab = tab;
        this.renderTabs();
        this.renderContent();
    },

    /**
     * Render content based on active tab
     */
    renderContent() {
        switch (this.activeTab) {
            case 'configure':
                this.renderConfigure();
                break;
            case 'users':
                this.renderUsers();
                break;
            case 'data':
                this.renderData();
                break;
        }
    },

    /**
     * Render Configure tab
     */
    renderConfigure() {
        const container = document.getElementById('adminContainer');
        if (!container) return;

        // Get current settings
        const heavyWeight = localStorage.getItem('heavyWeightThreshold') || '30';
        const laborRate = localStorage.getItem('laborChargeRate') || '6';
        const autoLabor = localStorage.getItem('autoLaborCharges') !== 'false';

        container.innerHTML = `
            <div class="settings-card">
                <h3>Labor Charges</h3>
                
                <label>Heavy Packet Weight Threshold (kg):</label>
                <input type="number" inputmode="decimal" id="adminHeavyWeight" 
                       placeholder="30" value="${heavyWeight}" 
                       onchange="window.app.admin.saveConfigure()" />
                <p class="setting-description">Packets above this weight will incur labor charges</p>

                <label>Labor Charge per Heavy Packet (₹):</label>
                <input type="number" inputmode="decimal" id="adminLaborRate" 
                       placeholder="6" value="${laborRate}" 
                       onchange="window.app.admin.saveConfigure()" />
                <p class="setting-description">Amount charged for each heavy packet</p>

                <label class="checkbox-label">
                    <input type="checkbox" id="adminAutoLabor" 
                           ${autoLabor ? 'checked' : ''} 
                           onchange="window.app.admin.saveConfigure()">
                    <span>Enable automatic labor charges by default</span>
                </label>
            </div>
        `;
    },

    /**
     * Save configure settings
     */
    saveConfigure() {
        const heavyWeight = document.getElementById('adminHeavyWeight')?.value || '30';
        const laborRate = document.getElementById('adminLaborRate')?.value || '6';
        const autoLabor = document.getElementById('adminAutoLabor')?.checked;

        localStorage.setItem('heavyWeightThreshold', heavyWeight);
        localStorage.setItem('laborChargeRate', laborRate);
        localStorage.setItem('autoLaborCharges', autoLabor);

        // Also update the settings page inputs if they exist
        const settingHeavyWeight = document.getElementById('settingHeavyWeight');
        const settingLaborRate = document.getElementById('settingLaborRate');
        const settingAutoLabor = document.getElementById('settingAutoLabor');
        
        if (settingHeavyWeight) settingHeavyWeight.value = heavyWeight;
        if (settingLaborRate) settingLaborRate.value = laborRate;
        if (settingAutoLabor) settingAutoLabor.checked = autoLabor;

        UIManager.showToast('Settings saved');
    },

    /**
     * Render Users tab
     */
    async renderUsers() {
        const container = document.getElementById('adminContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="settings-card">
                <h3>Pending Registrations</h3>
                <p class="setting-description">Approve new users and assign their roles</p>
                <div id="adminPendingUsers">
                    <p style="text-align: center; color: #888;">Loading...</p>
                </div>
            </div>
            
            <div class="settings-card">
                <h3>Active Users</h3>
                <p class="setting-description">Manage existing user roles</p>
                <div id="adminActiveUsers">
                    <p style="text-align: center; color: #888;">Loading...</p>
                </div>
            </div>
        `;

        await this.loadUsers();
    },

    /**
     * Load users from Firestore
     */
    async loadUsers() {
        try {
            const db = firebase.firestore();
            const col = window.getCollection ? window.getCollection('users') : 'users';
            const snapshot = await db.collection(col).orderBy('createdAt', 'desc').get();
            
            const pendingUsers = [];
            const activeUsers = [];
            
            snapshot.forEach(doc => {
                const user = { id: doc.id, ...doc.data() };
                // Match logic from users.js: pending if status is pending OR no role assigned
                if (user.status === 'pending' || !user.role) {
                    pendingUsers.push(user);
                } else {
                    activeUsers.push(user);
                }
            });

            this.renderPendingUsers(pendingUsers);
            this.renderActiveUsers(activeUsers);
        } catch (error) {
            console.error('Error loading users:', error);
            UIManager.showToast('Failed to load users', 'error');
        }
    },

    /**
     * Render pending users list
     * @param {Array} users - Pending users
     */
    renderPendingUsers(users) {
        const container = document.getElementById('adminPendingUsers');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = `
                <div class="admin-empty">
                    <span class="admin-empty-icon">✅</span>
                    <p>No pending registrations</p>
                </div>
            `;
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="pending-user-card">
                <div class="user-card-header">
                    <div>
                        <div class="user-name">${user.name || 'Unknown'}</div>
                        <div class="user-email">${user.email}</div>
                    </div>
                    <span class="user-role-badge pending">Pending</span>
                </div>
                <div class="user-actions">
                    <select id="role-${user.id}">
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                    </select>
                    <button class="btn-approve" onclick="window.app.admin.approveUser('${user.id}')">
                        ✓ Approve
                    </button>
                    <button class="btn-reject" onclick="window.app.admin.rejectUser('${user.id}')">
                        ✕ Reject
                    </button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Render active users list
     * @param {Array} users - Active users
     */
    renderActiveUsers(users) {
        const container = document.getElementById('adminActiveUsers');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = `
                <div class="admin-empty">
                    <span class="admin-empty-icon">👤</span>
                    <p>No active users</p>
                </div>
            `;
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="active-user-card">
                <div class="user-card-header">
                    <div>
                        <div class="user-name">${user.name || 'Unknown'}</div>
                        <div class="user-email">${user.email}</div>
                    </div>
                    <span class="user-role-badge ${user.role}">${user.role}</span>
                </div>
                <div class="user-actions">
                    <button class="btn-change-role" onclick="window.app.admin.showChangeRole('${user.id}', '${user.name}', '${user.role}')">
                        Change Role
                    </button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Approve a user
     * @param {string} userId - User ID
     */
    async approveUser(userId) {
        const roleSelect = document.getElementById(`role-${userId}`);
        const role = roleSelect?.value || 'staff';

        try {
            UIManager.showLoading();
            const db = firebase.firestore();
            const col = window.getCollection ? window.getCollection('users') : 'users';
            
            await db.collection(col).doc(userId).update({
                status: 'approved',
                role: role,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: AppState.currentUser?.uid
            });

            UIManager.showToast(`User approved as ${role}`);
            await this.loadUsers();
        } catch (error) {
            console.error('Error approving user:', error);
            UIManager.showToast('Failed to approve user', 'error');
        } finally {
            UIManager.hideLoading();
        }
    },

    /**
     * Reject a user
     * @param {string} userId - User ID
     */
    async rejectUser(userId) {
        const confirmed = await UIManager.showModal(
            'Are you sure you want to reject this user?',
            'Reject User',
            true
        );
        if (!confirmed) return;

        try {
            UIManager.showLoading();
            const db = firebase.firestore();
            const col = window.getCollection ? window.getCollection('users') : 'users';
            
            await db.collection(col).doc(userId).delete();

            UIManager.showToast('User rejected');
            await this.loadUsers();
        } catch (error) {
            console.error('Error rejecting user:', error);
            UIManager.showToast('Failed to reject user', 'error');
        } finally {
            UIManager.hideLoading();
        }
    },

    /**
     * Show change role dialog
     * @param {string} userId - User ID
     * @param {string} userName - User name
     * @param {string} currentRole - Current role
     */
    async showChangeRole(userId, userName, currentRole) {
        const roles = ['staff', 'manager'];
        const newRole = currentRole === 'staff' ? 'manager' : 'staff';
        
        const confirmed = await UIManager.showModal(
            `Change ${userName}'s role from ${currentRole} to ${newRole}?`,
            'Change Role',
            true
        );
        if (!confirmed) return;

        try {
            UIManager.showLoading();
            const db = firebase.firestore();
            const col = window.getCollection ? window.getCollection('users') : 'users';
            
            await db.collection(col).doc(userId).update({
                role: newRole
            });

            UIManager.showToast(`Role changed to ${newRole}`);
            await this.loadUsers();
        } catch (error) {
            console.error('Error changing role:', error);
            UIManager.showToast('Failed to change role', 'error');
        } finally {
            UIManager.hideLoading();
        }
    },

    /**
     * Render Data tab
     */
    renderData() {
        const container = document.getElementById('adminContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="settings-card">
                <h3>📊 Storage Usage</h3>
                <p class="setting-description">View database storage statistics</p>
                <button class="add-item-btn" onclick="window.app.admin.loadStorageStats()" style="padding: 8px 16px; margin-bottom: 12px;">
                    🔄 Calculate Storage
                </button>
                <div id="adminStorageStats"></div>
            </div>

            <div class="settings-card danger-zone">
                <h4>⚠️ Danger Zone</h4>
                <p>Permanently delete all business data. This cannot be undone!</p>
                <button class="danger-btn" onclick="window.app.admin.clearAllData()">
                    🗑️ Clear All Data
                </button>
            </div>
        `;

        // If we have cached stats, show them
        if (this.storageStats) {
            this.displayStorageStats(this.storageStats);
        }
    },

    /**
     * Load storage statistics
     */
    async loadStorageStats() {
        try {
            UIManager.showLoading();
            const db = firebase.firestore();
            
            const collections = [
                { name: 'items', label: 'Items', icon: '📦' },
                { name: 'purchases', label: 'Purchases', icon: '📥' },
                { name: 'retailSales', label: 'Retail Sales', icon: '🛒' },
                { name: 'wholesaleSales', label: 'Wholesale Sales', icon: '📤' },
                { name: 'expenses', label: 'Expenses', icon: '💳' },
                { name: 'stockAdjustments', label: 'Stock Adjustments', icon: '📊' },
                { name: 'withdrawals', label: 'Withdrawals', icon: '💸' },
                { name: 'cashManagement', label: 'Cash Management', icon: '💰' },
                { name: 'users', label: 'Users', icon: '👥' },
                { name: 'auditLogs', label: 'Audit Logs', icon: '📋' },
                { name: 'telemetry', label: 'Telemetry', icon: '🔬' }
            ];

            let totalDocs = 0;
            const breakdown = [];

            for (const col of collections) {
                try {
                    const colName = window.getCollection ? window.getCollection(col.name) : col.name;
                    const snapshot = await db.collection(colName).get();
                    const count = snapshot.size;
                    totalDocs += count;
                    breakdown.push({
                        ...col,
                        count: count
                    });
                } catch (e) {
                    breakdown.push({
                        ...col,
                        count: 0
                    });
                }
            }

            // Rough estimate: ~1KB per document average
            const estimatedSizeKB = totalDocs * 1;
            const estimatedSize = estimatedSizeKB > 1024 
                ? (estimatedSizeKB / 1024).toFixed(1) + ' MB'
                : estimatedSizeKB + ' KB';

            this.storageStats = {
                totalDocs,
                estimatedSize,
                breakdown
            };

            this.displayStorageStats(this.storageStats);
        } catch (error) {
            console.error('Error loading storage stats:', error);
            UIManager.showToast('Failed to load storage stats', 'error');
        } finally {
            UIManager.hideLoading();
        }
    },

    /**
     * Display storage statistics
     * @param {Object} stats - Storage stats
     */
    displayStorageStats(stats) {
        const container = document.getElementById('adminStorageStats');
        if (!container) return;

        container.innerHTML = `
            <div class="storage-grid">
                <div class="storage-stat-card">
                    <div class="storage-stat-value">${stats.totalDocs}</div>
                    <div class="storage-stat-label">Total Documents</div>
                </div>
                <div class="storage-stat-card">
                    <div class="storage-stat-value">${stats.estimatedSize}</div>
                    <div class="storage-stat-label">Estimated Size</div>
                </div>
            </div>
            <div style="background: var(--light-bg, #f5f5f5); border-radius: 8px; padding: 12px;">
                ${stats.breakdown.map(col => `
                    <div class="collection-item">
                        <span class="collection-name">
                            <span>${col.icon}</span>
                            <span>${col.label}</span>
                        </span>
                        <span class="collection-count">${col.count}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Clear all data
     */
    async clearAllData() {
        // Show collection selection modal
        const collections = [
            { id: 'purchases', name: 'Purchases' },
            { id: 'retailSales', name: 'Retail Sales' },
            { id: 'wholesaleSales', name: 'Wholesale Sales' },
            { id: 'expenses', name: 'Expenses' },
            { id: 'stockAdjustments', name: 'Stock Adj.' },
            { id: 'withdrawals', name: 'Withdrawals' },
            { id: 'cashManagement', name: 'Cash Mgmt' },
            { id: 'autoSaves', name: 'Auto Saves' },
            { id: 'drafts', name: 'Drafts' },
            { id: 'itemFrequency', name: 'Item Freq.' },
            { id: 'items', name: 'Items ⚠️' },
            { id: 'users', name: 'Users ⚠️' }
        ];
        
        const modalHTML = `
            <div style="text-align: left;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: bold; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #ddd;">
                    <input type="checkbox" id="selectAllCollections" style="width: 16px; height: 16px;">
                    <span style="font-size: 14px;">Select All</span>
                </label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px;">
                    ${collections.map((col, i) => `
                        <label style="display: flex; align-items: center; gap: 6px; padding: 3px 0; cursor: pointer;">
                            <input type="checkbox" class="collection-checkbox" data-collection="${col.id}" ${i < 10 ? 'checked' : ''} style="width: 14px; height: 14px;">
                            <span style="font-size: 13px; ${i >= 10 ? 'color: #e74c3c;' : ''}">${col.name}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <p style="color: #e74c3c; margin-top: 10px; font-size: 12px; text-align: center;">⚠️ Cannot be undone!</p>
        `;
        
        // Setup select all handler after modal is shown
        setTimeout(() => {
            const selectAll = document.getElementById('selectAllCollections');
            if (selectAll) {
                selectAll.addEventListener('change', (e) => {
                    const checkboxes = document.querySelectorAll('.collection-checkbox');
                    checkboxes.forEach(cb => cb.checked = e.target.checked);
                });
            }
        }, 100);
        
        // Show modal and get selected collections before it closes
        let selectedCollections = [];
        
        const confirmed = await new Promise((resolve) => {
            UIManager.showModalWithHtml(modalHTML, 'Clear Data', true).then((result) => {
                if (result) {
                    // Capture checkbox values while modal content still exists
                    const checkboxes = document.querySelectorAll('.collection-checkbox:checked');
                    selectedCollections = Array.from(checkboxes).map(cb => cb.dataset.collection);
                }
                resolve(result);
            });
        });
        
        if (!confirmed) return;
        
        if (selectedCollections.length === 0) {
            UIManager.showToast('No collections selected');
            return;
        }
        
        // Second confirmation
        const finalConfirm = await UIManager.showModal(
            `Are you sure you want to delete ${selectedCollections.length} collection(s)? This CANNOT be undone!`,
            'Final Confirmation',
            true
        );
        
        if (!finalConfirm) return;
        
        UIManager.showLoading();
        
        try {
            const db = firebase.firestore();
            const user = firebase.auth().currentUser;
            
            if (!user) {
                UIManager.showToast('Error: User not authenticated');
                UIManager.hideLoading();
                return;
            }
            
            // Delete selected collections (with environment prefix)
            let deletedCount = 0;
            const getCol = window.getCollection || ((name) => name); // Fallback if not defined
            
            for (const collectionId of selectedCollections) {
                const prefixedCollection = getCol(collectionId);
                const snapshot = await db.collection(prefixedCollection).get();
                if (snapshot.size > 0) {
                    const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
                    await Promise.all(deletePromises);
                    deletedCount += snapshot.size;
                }
            }
            
            // Clear local storage
            localStorage.clear();
            
            // Log audit entry
            if (window.AuditService) {
                await window.AuditService.log(window.AuditService.ACTIONS.CLEAR_DATA, {
                    collections: selectedCollections,
                    recordsDeleted: deletedCount
                });
            }
            
            UIManager.hideLoading();
            UIManager.showToast(`Cleared ${deletedCount} records from ${selectedCollections.length} collections`);
            
            // Reload the page
            setTimeout(() => location.reload(), 1000);
            
        } catch (error) {
            console.error('Error clearing data:', error);
            UIManager.hideLoading();
            UIManager.showToast('Error clearing data: ' + error.message);
        }
    }
};

export { AdminManager };
