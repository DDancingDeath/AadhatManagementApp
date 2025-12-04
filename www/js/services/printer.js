// -------------------- BLUETOOTH PRINTER MANAGER --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';

class BluetoothPrinterManager {
    constructor() {
        this.device = null;
        this.characteristic = null;
    }

    async connect(deviceId = null) {
        try {
            if (!navigator.bluetooth) {
                throw new Error('Bluetooth not supported on this device');
            }

            const options = {
                filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
            };

            this.device = await navigator.bluetooth.requestDevice(options);
            const server = await this.device.gatt.connect();
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            this.characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

            AppState.printerSettings.deviceId = this.device.id;
            AppState.printerSettings.deviceName = this.device.name;
            AppState.printerSettings.enabled = true;
            localStorage.setItem('printerSettings', JSON.stringify(AppState.printerSettings));

            return true;
        } catch (error) {
            console.error('Bluetooth connection error:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
        this.device = null;
        this.characteristic = null;
        AppState.printerSettings.enabled = false;
        AppState.printerSettings.deviceId = null;
        AppState.printerSettings.deviceName = null;
        localStorage.setItem('printerSettings', JSON.stringify(AppState.printerSettings));
    }

    async print(escposData) {
        if (!this.characteristic) {
            throw new Error('Printer not connected');
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(escposData);
        
        const chunkSize = 512;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            await this.characteristic.writeValue(chunk);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    generateESCPOS(billData) {
        const ESC = '\x1B';
        const GS = '\x1D';
        let output = '';

        // Initialize printer
        output += ESC + '@';
        
        // Center align
        output += ESC + 'a' + String.fromCharCode(1);
        
        // Store name (bold, large)
        output += ESC + 'E' + String.fromCharCode(1);
        output += GS + '!' + String.fromCharCode(0x11);
        output += 'AADHAT MANAGEMENT\n';
        output += GS + '!' + String.fromCharCode(0);
        output += ESC + 'E' + String.fromCharCode(0);
        
        // Bill type and date
        output += '\n';
        output += billData.type.toUpperCase() + ' BILL\n';
        output += new Date(billData.date).toLocaleString('en-IN') + '\n';
        
        // Separator
        output += '================================\n';
        
        // Customer/Supplier info
        output += ESC + 'a' + String.fromCharCode(0);
        if (billData.customer) {
            output += 'Customer: ' + billData.customer + '\n';
        }
        if (billData.phone) {
            output += 'Phone: ' + billData.phone + '\n';
        }
        
        output += '================================\n';
        
        // Items
        output += 'Item         Qty    Rate   Amount\n';
        output += '--------------------------------\n';
        
        billData.items.forEach(item => {
            const name = item.name.substring(0, 12).padEnd(12);
            const qty = item.quantity.toFixed(2).padStart(6);
            const rate = item.rate.toFixed(0).padStart(6);
            const amount = (item.quantity * item.rate).toFixed(0).padStart(8);
            output += `${name} ${qty} ${rate} ${amount}\n`;
        });
        
        output += '================================\n';
        
        // Totals
        output += `Subtotal:        Rs. ${billData.total.toFixed(2)}\n`;
        
        if (billData.labourCharges > 0) {
            output += `Labour Charges:  Rs. ${billData.labourCharges.toFixed(2)}\n`;
        }
        
        output += ESC + 'E' + String.fromCharCode(1);
        output += `Grand Total:     Rs. ${billData.grandTotal.toFixed(2)}\n`;
        output += ESC + 'E' + String.fromCharCode(0);
        
        // Payment info
        if (billData.payment) {
            output += '--------------------------------\n';
            billData.payment.forEach(p => {
                output += `${p.method}:  Rs. ${p.amount.toFixed(2)}\n`;
            });
            if (billData.paymentTotal) {
                output += `Paid:         Rs. ${billData.paymentTotal.toFixed(2)}\n`;
                const due = billData.grandTotal - billData.paymentTotal;
                if (due > 0) {
                    output += `Due:          Rs. ${due.toFixed(2)}\n`;
                } else if (due < 0) {
                    output += `Return:       Rs. ${Math.abs(due).toFixed(2)}\n`;
                }
            }
        }
        
        // Footer
        output += '\n';
        output += ESC + 'a' + String.fromCharCode(1);
        output += 'Thank You!\n';
        output += 'Visit Again\n';
        
        // Cut paper
        output += '\n\n\n';
        output += GS + 'V' + String.fromCharCode(66) + String.fromCharCode(3);
        
        return output;
    }
}

const PrinterService = {
    manager: new BluetoothPrinterManager(),

    async scanDevices() {
        try {
            await this.manager.connect();
            this.updateStatus();
            UIManager.showToast('Printer connected successfully!');
        } catch (error) {
            console.error('Printer scan error:', error);
            UIManager.showToast('Failed to connect printer: ' + error.message);
        }
    },

    async disconnect() {
        try {
            await this.manager.disconnect();
            this.updateStatus();
            UIManager.showToast('Printer disconnected');
        } catch (error) {
            console.error('Disconnect error:', error);
            UIManager.showToast('Failed to disconnect: ' + error.message);
        }
    },

    async print(billData) {
        try {
            const escpos = this.manager.generateESCPOS(billData);
            await this.manager.print(escpos);
            return true;
        } catch (error) {
            console.error('Print error:', error);
            throw error;
        }
    },

    updateStatus() {
        const statusDiv = document.getElementById('printerStatus');
        const connectBtn = document.getElementById('connectPrinterBtn');
        const disconnectBtn = document.getElementById('disconnectPrinterBtn');
        
        if (AppState.printerSettings.enabled && AppState.printerSettings.deviceName) {
            if (statusDiv) {
                statusDiv.textContent = `Connected: ${AppState.printerSettings.deviceName}`;
                statusDiv.style.color = 'green';
            }
            if (connectBtn) connectBtn.style.display = 'none';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
        } else {
            if (statusDiv) {
                statusDiv.textContent = 'Not Connected';
                statusDiv.style.color = 'red';
            }
            if (connectBtn) connectBtn.style.display = 'inline-block';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
        }
    },

    async testPrint() {
        try {
            const testBill = {
                type: 'TEST',
                date: new Date().toISOString(),
                customer: 'Test Customer',
                phone: '1234567890',
                items: [
                    { name: 'Test Item', quantity: 1, rate: 100 }
                ],
                total: 100,
                labourCharges: 0,
                grandTotal: 100,
                payment: [{ method: 'Cash', amount: 100 }],
                paymentTotal: 100
            };
            
            await this.print(testBill);
            UIManager.showToast('Test print successful!');
        } catch (error) {
            console.error('Test print error:', error);
            UIManager.showToast('Test print failed: ' + error.message);
        }
    }
};

// Export PrinterService
export { PrinterService, BluetoothPrinterManager };
