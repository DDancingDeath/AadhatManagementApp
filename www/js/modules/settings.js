// Settings Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';

export class SettingsManager {
    static loadSettings() {
        const { settings } = AppState;
        
        document.getElementById('settingHeavyWeight').value = settings.heavyWeightThreshold;
        document.getElementById('settingLaborRate').value = settings.laborRate;
        document.getElementById('settingAutoLabor').checked = settings.autoLaborEnabled;
        document.getElementById('settingShowHindi').checked = settings.showHindi || false;
        
        // Show data management section only for owners
        const dataManagementSection = document.getElementById('dataManagementSection');
        if (dataManagementSection) {
            dataManagementSection.style.display = AppState.userRole === 'owner' ? 'block' : 'none';
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

    static async clearAllData() {
        // Show collection selection modal
        const collections = [
            { id: 'bills', name: 'Purchases' },
            { id: 'sales', name: 'Sales' },
            { id: 'payments', name: 'Payments' },
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
                console.log('[SETTINGS]', msg);
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
                console.log('[SETTINGS] Button clicked for:', address, name);
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
}
