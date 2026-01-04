/**
 * @fileoverview Settings Module
 * Handles application settings including display, labor rates, dark mode,
 * printer configuration, data management, and audit logs
 * @module modules/settings
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { AuditService } from '../services/audit.js';

/**
 * Settings Manager - Manages application settings
 * @class SettingsManager
 */
export class SettingsManager {
    /**
     * Load settings from AppState and populate form fields
     * Configures visibility based on user role
     */
    static loadSettings() {
        const { settings } = AppState;
        
        document.getElementById('settingHeavyWeight').value = settings.heavyWeightThreshold;
        document.getElementById('settingLaborRate').value = settings.laborRate;
        document.getElementById('settingAutoLabor').checked = settings.autoLaborEnabled;
        document.getElementById('settingShowHindi').checked = settings.showHindi || false;
        
        // Show data management section only for owners
        const dataManagementSection = document.getElementById('dataManagementSection');
        if (dataManagementSection) {
            const isOwner = AppState.userRole === 'owner';
            dataManagementSection.style.display = isOwner ? 'block' : 'none';
        }
        
        // Show audit logs section only for owners
        const auditLogsSection = document.getElementById('auditLogsSection');
        if (auditLogsSection) {
            auditLogsSection.style.display = AppState.userRole === 'owner' ? 'block' : 'none';
        }
        
        // Show storage section only for owners
        const storageSection = document.getElementById('storageSection');
        if (storageSection) {
            storageSection.style.display = AppState.userRole === 'owner' ? 'block' : 'none';
        }
        
        // Update email display
        const userEmail = document.getElementById('userEmail');
        if (userEmail && AppState.currentUser?.email) {
            userEmail.textContent = AppState.currentUser.email;
        }
        
        const darkModeCheckbox = document.getElementById('settingDarkMode');
        if (darkModeCheckbox) {
            const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
            darkModeCheckbox.checked = darkModeEnabled;
            if (darkModeEnabled) {
                document.body.classList.add('dark-mode');
            }
        }
        
        const bluetoothCheckbox = document.getElementById('settingBluetoothEnabled');
        if (bluetoothCheckbox) {
            const { printerSettings } = AppState;
            bluetoothCheckbox.checked = printerSettings.enabled || false;
            const section = document.getElementById('bluetoothPrinterSection');
            if (section) {
                section.style.display = printerSettings.enabled ? 'block' : 'none';
            }
        }
        
        this.updatePrinterStatus();
    }

    /**
     * Toggle dark mode on/off
     * Persists preference to localStorage
     */
    static toggleDarkMode() {
        const enabled = document.getElementById('settingDarkMode').checked;
        localStorage.setItem('darkMode', enabled);
        
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        UIManager.hapticFeedback('light');
        UIManager.showToast(enabled ? 'Dark mode enabled' : 'Dark mode disabled');
    }

    /**
     * Save current settings to AppState and localStorage
     * Updates related UI components after save
     */
    static saveSettings() {
        AppState.settings.heavyWeightThreshold = Number(document.getElementById('settingHeavyWeight').value) || 30;
        AppState.settings.laborRate = Number(document.getElementById('settingLaborRate').value) || 6;
        AppState.settings.autoLaborEnabled = document.getElementById('settingAutoLabor').checked;
        AppState.settings.showHindi = document.getElementById('settingShowHindi').checked;
        
        localStorage.setItem('settings', JSON.stringify(AppState.settings));
        
        UIManager.hapticFeedback('light');
        UIManager.showToast('Settings saved successfully');
        
        window.app.items.render();
        window.app.billing.loadItemsDropdown();
    }

    /**
     * Clear all data from selected collections
     * Shows collection selection modal for owner users
     * @async
     */
    static async clearAllData() {
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
                            <input type="checkbox" class="collection-checkbox" data-collection="${col.id}" ${i < 9 ? 'checked' : ''} style="width: 14px; height: 14px;">
                            <span style="font-size: 13px; ${i >= 9 ? 'color: #e74c3c;' : ''}">${col.name}</span>
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
        
        const confirmed = await UIManager.showModalWithHtml(
            modalHTML,
            'Clear Data',
            true
        );
        
        if (!confirmed) return;
        
        // Get selected collections
        const checkboxes = document.querySelectorAll('.collection-checkbox:checked');
        const selectedCollections = Array.from(checkboxes).map(cb => cb.dataset.collection);
        
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
            
            // Delete selected collections
            let deletedCount = 0;
            
            for (const collectionId of selectedCollections) {
                const snapshot = await db.collection(collectionId).get();
                if (snapshot.size > 0) {
                    const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
                    await Promise.all(deletePromises);
                    deletedCount += snapshot.size;
                }
            }
            
            // Clear local storage
            localStorage.clear();
            
            // Log audit entry
            await AuditService.log(AuditService.ACTIONS.CLEAR_DATA, {
                collections: selectedCollections,
                recordsDeleted: deletedCount
            });
            
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

    static toggleBluetoothPrinter() {
        const enabled = document.getElementById('settingBluetoothEnabled').checked;
        AppState.printerSettings.enabled = enabled;
        localStorage.setItem('printerSettings', JSON.stringify(AppState.printerSettings));
        
        const section = document.getElementById('bluetoothPrinterSection');
        if (section) {
            section.style.display = enabled ? 'block' : 'none';
        }
        
        this.updatePrinterStatus();
    }

    static async scanBluetoothDevices() {
        try {
            UIManager.hapticFeedback('light');
            
            if (!window.bluetoothSerial) {
                const msg = 'Bluetooth is only available in the mobile app.\n\nWeb printing will be used instead.';
                await UIManager.showModal(msg);
                return;
            }
            
            const devices = await window.app.printer.scan();
            this.displayBluetoothDevices(devices);
        } catch (error) {
            const errorMsg = 'Failed to scan devices: ' + (error.message || error);
            console.error('[SETTINGS] Scan error:', error);
            await UIManager.showModal(errorMsg);
        }
    }

    static displayBluetoothDevices(devices) {
        const container = document.getElementById('bluetoothDevicesList');
        if (!container) return;
        
        if (!devices || devices.length === 0) {
            container.innerHTML = '<p style="color: #666; padding: 12px;">No devices found. Make sure your printer is powered on and in pairing mode.</p>';
            return;
        }
        
        container.innerHTML = '<div style="margin-top: 12px;"><strong>Available Devices:</strong></div>';
        
        devices.forEach((device, index) => {
            const deviceCard = document.createElement('div');
            deviceCard.style.cssText = 'background: #f5f5f5; padding: 12px; margin: 8px 0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;';
            const address = device.address || device.deviceId || device.id;
            const name = device.name || 'Unknown Device';
            
            // Store device info in a data attribute to avoid quote issues
            deviceCard.setAttribute('data-device-id', address);
            deviceCard.setAttribute('data-device-name', name);
            
            deviceCard.innerHTML = `
                <div>
                    <strong>${name}</strong><br>
                    <small style="color: #666;">${address}</small>
                </div>
                <button class="add-item-btn" data-device-index="${index}">Connect</button>
            `;
            
            // Add click handler to the button
            const button = deviceCard.querySelector('button');
            button.addEventListener('click', () => {
                this.connectToPrinter(address, name);
            });
            
            container.appendChild(deviceCard);
        });
    }

    static async connectToPrinter(deviceId, deviceName) {
        try {
            UIManager.hapticFeedback('medium');
            
            await window.app.printer.connect(deviceId, deviceName);
            
            AppState.printerSettings.deviceId = deviceId;
            AppState.printerSettings.deviceName = deviceName;
            localStorage.setItem('printerSettings', JSON.stringify(AppState.printerSettings));
            
            this.updatePrinterStatus();
            UIManager.showToast('✓ Connected to ' + deviceName);
            
            const container = document.getElementById('bluetoothDevicesList');
            if (container) container.innerHTML = '';
            
        } catch (error) {
            const errorMsg = 'Failed to connect: ' + (error.message || error);
            console.error('[SETTINGS] Connect error:', error);
            await UIManager.showModal(errorMsg);
        }
    }

    static async disconnectPrinter() {
        try {
            UIManager.hapticFeedback('light');
            await window.app.printer.disconnect();
            
            AppState.printerSettings.deviceId = null;
            AppState.printerSettings.deviceName = null;
            localStorage.setItem('printerSettings', JSON.stringify(AppState.printerSettings));
            
            this.updatePrinterStatus();
            UIManager.showToast('Printer disconnected');
        } catch (error) {
            await UIManager.showModal('Failed to disconnect: ' + error.message);
        }
    }

    static updatePrinterStatus() {
        const { printerSettings } = AppState;
        const statusText = document.getElementById('printerStatusText');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const testPrintBtn = document.getElementById('testPrintBtn');
        
        const isConnected = window.app.printer && window.app.printer.device && printerSettings.deviceName;
        
        if (isConnected) {
            if (statusText) {
                statusText.innerHTML = `<span style="color: #4CAF50;">● Connected to ${printerSettings.deviceName}</span>`;
            }
            if (disconnectBtn) disconnectBtn.style.display = 'block';
            if (testPrintBtn) testPrintBtn.style.display = 'block';
        } else {
            if (statusText) {
                statusText.innerHTML = '<span style="color: #999;">○ Not connected</span>';
            }
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            if (testPrintBtn) testPrintBtn.style.display = 'none';
        }
    }

    static async testPrint() {
        if (!window.app.printer || !window.app.printer.device) {
            await UIManager.showModal('Printer not connected');
            return;
        }
        
        try {
            UIManager.hapticFeedback('medium');
            UIManager.showLoading();
            
            const testBillData = {
                isPurchase: true,
                billTotal: 1000,
                laborCharges: 12,
                amountPayable: 988,
                totalPackets: 3,
                onlinePayment: 500,
                cashPayment: 488,
                laborCalc: '(6 × 2)',
                items: [
                    {
                        name: 'Test Item 1',
                        rate: 50,
                        qty: 10,
                        total: 500,
                        weights: [5, 5]
                    },
                    {
                        name: 'Test Item 2',
                        rate: 50,
                        qty: 10,
                        total: 500,
                        weights: [10]
                    }
                ]
            };
            
            await window.app.printer.write(testBillData);
            UIManager.hideLoading();
            UIManager.showToast('✓ Test print sent');
            UIManager.hapticFeedback('heavy');
        } catch (error) {
            UIManager.hideLoading();
            await UIManager.showModal('Test print failed: ' + error.message);
        }
    }

    // Audit Logs Methods
    static auditLogs = [];
    
    static async loadAuditLogs() {
        if (AppState.userRole !== 'owner') {
            UIManager.showToast('Only owners can view audit logs');
            return;
        }
        
        UIManager.showLoading();
        try {
            this.auditLogs = await AuditService.getRecentLogs(100);
            this.renderAuditLogs();
            UIManager.hideLoading();
        } catch (error) {
            console.error('Error loading audit logs:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to load audit logs');
        }
    }
    
    static filterAuditLogs() {
        this.renderAuditLogs();
    }
    
    static renderAuditLogs() {
        const container = document.getElementById('auditLogsList');
        if (!container) return;
        
        const filterAction = document.getElementById('auditFilterAction')?.value || '';
        
        let filteredLogs = this.auditLogs;
        if (filterAction) {
            filteredLogs = this.auditLogs.filter(log => log.action === filterAction);
        }
        
        if (filteredLogs.length === 0) {
            container.innerHTML = '<p style="padding: 16px; text-align: center; color: #888;">No audit logs found</p>';
            return;
        }
        
        container.innerHTML = filteredLogs.map(log => {
            const date = new Date(log.timestamp);
            const formattedDate = date.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const actionIcon = this.getActionIcon(log.action);
            const actionColor = this.getActionColor(log.action);
            const details = this.formatDetails(log.details);
            
            return `
                <div style="padding: 12px; border-bottom: 1px solid #eee; display: flex; gap: 12px; align-items: flex-start;">
                    <span style="font-size: 20px;">${actionIcon}</span>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-weight: 600; color: ${actionColor};">${log.action.replace(/_/g, ' ')}</span>
                            <span style="font-size: 11px; color: #888;">${formattedDate}</span>
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            <strong>${log.userName}</strong> (${log.userRole})
                        </div>
                        ${details ? `<div style="font-size: 11px; color: #888; margin-top: 4px;">${details}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    static getActionIcon(action) {
        const icons = {
            'CREATE_BILL': '📥',
            'DELETE_BILL': '🗑️',
            'CREATE_SALE': '📤',
            'DELETE_SALE': '🗑️',
            'DELETE_ITEM': '🗑️',
            'UPDATE_PAYMENT': '💰',
            'RECORD_PAYMENT': '💰',
            'CLEAR_DATA': '⚠️',
            'LOGIN': '🔑',
            'LOGOUT': '🚪'
        };
        return icons[action] || '📋';
    }
    
    static getActionColor(action) {
        if (action.includes('DELETE') || action === 'CLEAR_DATA') return '#e74c3c';
        if (action.includes('CREATE')) return '#27ae60';
        if (action.includes('PAYMENT')) return '#3498db';
        return '#333';
    }
    
    static formatDetails(details) {
        if (!details || typeof details !== 'object') return '';
        
        const parts = [];
        if (details.billNumber) parts.push(`Bill: ${details.billNumber}`);
        if (details.amount) parts.push(`Amount: ₹${details.amount}`);
        if (details.customer) parts.push(`Customer: ${details.customer}`);
        if (details.itemName) parts.push(`Item: ${details.itemName}`);
        if (details.paymentAmount) parts.push(`Payment: ₹${details.paymentAmount}`);
        if (details.collections) parts.push(`Collections: ${details.collections.join(', ')}`);
        if (details.recordsDeleted) parts.push(`Records: ${details.recordsDeleted}`);
        
        return parts.join(' • ');
    }

    // Storage Stats Methods
    static async loadStorageStats() {
        if (AppState.userRole !== 'owner') {
            UIManager.showToast('Only owners can view storage stats');
            return;
        }
        
        UIManager.showLoading();
        try {
            const db = firebase.firestore();
            const userId = AppState.currentUser?.uid;
            
            if (!userId) {
                UIManager.hideLoading();
                UIManager.showToast('User not logged in');
                return;
            }
            
            // Collections to check
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
                { name: 'autoSaves', label: 'Auto Saves', icon: '💾' },
                { name: 'drafts', label: 'Drafts', icon: '📝' }
            ];
            
            let totalDocs = 0;
            let totalEstimatedBytes = 0;
            const breakdown = [];
            
            for (const col of collections) {
                try {
                    let query;
                    // Some collections filter by userId, others don't
                    if (['users', 'auditLogs'].includes(col.name)) {
                        query = db.collection(col.name);
                    } else {
                        query = db.collection(col.name).where('userId', '==', userId);
                    }
                    
                    const snapshot = await query.get();
                    const docCount = snapshot.size;
                    
                    // Estimate size (rough: 1KB per document average)
                    let estimatedBytes = 0;
                    snapshot.docs.forEach(doc => {
                        const data = JSON.stringify(doc.data());
                        estimatedBytes += data.length * 2; // UTF-16 encoding
                    });
                    
                    totalDocs += docCount;
                    totalEstimatedBytes += estimatedBytes;
                    
                    if (docCount > 0) {
                        breakdown.push({
                            ...col,
                            count: docCount,
                            size: estimatedBytes
                        });
                    }
                } catch (e) {
                    // Silently skip inaccessible collections
                }
            }
            
            // Update UI
            document.getElementById('totalDocuments').textContent = totalDocs.toLocaleString();
            document.getElementById('estimatedSize').textContent = this.formatBytes(totalEstimatedBytes);
            
            // Render breakdown
            const breakdownContainer = document.getElementById('collectionBreakdown');
            if (breakdown.length > 0) {
                breakdownContainer.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 8px; color: #333;">Collection Breakdown:</div>
                    ${breakdown.sort((a, b) => b.count - a.count).map(col => `
                        <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 4px; margin-bottom: 4px;">
                            <span>${col.icon} ${col.label}</span>
                            <span style="color: #666;">${col.count} docs (${this.formatBytes(col.size)})</span>
                        </div>
                    `).join('')}
                `;
            } else {
                breakdownContainer.innerHTML = '<p style="color: #888; text-align: center;">No data found</p>';
            }
            
            document.getElementById('storageStats').style.display = 'block';
            UIManager.hideLoading();
            
        } catch (error) {
            console.error('Error loading storage stats:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to load storage stats');
        }
    }
    
    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}
