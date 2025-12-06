// Settings Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';

export class SettingsManager {
    static loadSettings() {
        const { settings } = AppState.getState();
        
        document.getElementById('settingHeavyWeight').value = settings.heavyWeightThreshold;
        document.getElementById('settingLaborRate').value = settings.laborRate;
        document.getElementById('settingAutoLabor').checked = settings.autoLaborEnabled;
        document.getElementById('settingShowHindi').checked = settings.showHindi || false;
        
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
            const { printerSettings } = AppState.getState();
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
        const state = AppState.getState();
        
        state.settings.heavyWeightThreshold = Number(document.getElementById('settingHeavyWeight').value) || 30;
        state.settings.laborRate = Number(document.getElementById('settingLaborRate').value) || 6;
        state.settings.autoLaborEnabled = document.getElementById('settingAutoLabor').checked;
        state.settings.showHindi = document.getElementById('settingShowHindi').checked;
        
        localStorage.setItem('settings', JSON.stringify(state.settings));
        
        UIManager.hapticFeedback('light');
        UIManager.showToast('Settings saved successfully');
        
        window.app.items.renderItems();
        window.app.items.loadItemsDropdown();
    }

    static async clearAllData() {
        const confirmed = await UIManager.showModal(
            'Are you sure you want to delete ALL data? This cannot be undone!',
            'Clear All Data',
            true
        );
        
        if (confirmed) {
            localStorage.clear();
            location.reload();
        }
    }

    static toggleBluetoothPrinter() {
        const enabled = document.getElementById('settingBluetoothEnabled').checked;
        const state = AppState.getState();
        state.printerSettings.enabled = enabled;
        localStorage.setItem('printerSettings', JSON.stringify(state.printerSettings));
        
        const section = document.getElementById('bluetoothPrinterSection');
        if (section) {
            section.style.display = enabled ? 'block' : 'none';
        }
        
        this.updatePrinterStatus();
    }

    static async scanBluetoothDevices() {
        try {
            UIManager.hapticFeedback('light');
            
            if (!window.Capacitor || !window.Capacitor.Plugins.CapacitorThermalPrinter) {
                await UIManager.showModal('Bluetooth is only available in the mobile app.\n\nWeb printing will be used instead.');
                return;
            }
            
            const devices = await window.app.printer.scanDevices();
            this.displayBluetoothDevices(devices);
        } catch (error) {
            await UIManager.showModal('Failed to scan devices: ' + error.message);
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
        
        devices.forEach(device => {
            const deviceCard = document.createElement('div');
            deviceCard.style.cssText = 'background: #f5f5f5; padding: 12px; margin: 8px 0; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
            const address = device.address || device.deviceId || device.id;
            const name = device.name || 'Unknown Device';
            deviceCard.innerHTML = `
                <div>
                    <strong>${name}</strong><br>
                    <small style="color: #666;">${address}</small>
                </div>
                <button class="add-item-btn" onclick="app.settings.connectToPrinter('${address}', '${name}')">Connect</button>
            `;
            container.appendChild(deviceCard);
        });
    }

    static async connectToPrinter(deviceId, deviceName) {
        try {
            UIManager.hapticFeedback('medium');
            await window.app.printer.connect(deviceId);
            
            const state = AppState.getState();
            state.printerSettings.deviceId = deviceId;
            state.printerSettings.deviceName = deviceName;
            localStorage.setItem('printerSettings', JSON.stringify(state.printerSettings));
            
            this.updatePrinterStatus();
            UIManager.showToast('✓ Connected to ' + deviceName);
            
            const container = document.getElementById('bluetoothDevicesList');
            if (container) container.innerHTML = '';
            
        } catch (error) {
            await UIManager.showModal('Failed to connect: ' + error.message);
        }
    }

    static async disconnectPrinter() {
        try {
            UIManager.hapticFeedback('light');
            await window.app.printer.disconnect();
            
            const state = AppState.getState();
            state.printerSettings.deviceId = null;
            state.printerSettings.deviceName = null;
            localStorage.setItem('printerSettings', JSON.stringify(state.printerSettings));
            
            this.updatePrinterStatus();
            UIManager.showToast('Printer disconnected');
        } catch (error) {
            await UIManager.showModal('Failed to disconnect: ' + error.message);
        }
    }

    static updatePrinterStatus() {
        const { printerSettings } = AppState.getState();
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
