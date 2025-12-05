// -------------------- BLUETOOTH PRINTER MANAGER --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { DEFAULT_SETTINGS } from '../utils/constants.js';

class BluetoothPrinterManager {
    constructor() {
        this.device = null;
        this.printerName = null;
    }

    async scan() {
        if (!window.bluetoothSerial) {
            throw new Error('Bluetooth Serial plugin not available');
        }
        
        return new Promise((resolve, reject) => {
            UIManager.showLoading();
            window.bluetoothSerial.list(
                (devices) => {
                    UIManager.hideLoading();
                    console.log('[SCAN] Found devices:', devices);
                    resolve(devices);
                },
                (error) => {
                    UIManager.hideLoading();
                    console.error('[SCAN] Error:', error);
                    reject(error);
                }
            );
        });
    }

    async connect(deviceId, deviceName = null) {
        try {
            if (!window.bluetoothSerial) {
                throw new Error('Bluetooth Serial plugin not available');
            }
            
            UIManager.showLoading();
            console.log('[CONNECT] Connecting to:', deviceId);
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.connect(
                    deviceId,
                    () => {
                        UIManager.hideLoading();
                        console.log('[CONNECT] Connected successfully');
                        this.device = deviceId;
                        this.printerName = deviceName;
                        resolve(true);
                    },
                    (error) => {
                        UIManager.hideLoading();
                        console.error('[CONNECT] Error:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            UIManager.hideLoading();
            console.error('[CONNECT] Error:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.device && window.bluetoothSerial) {
            try {
                return new Promise((resolve) => {
                    window.bluetoothSerial.disconnect(
                        () => {
                            this.device = null;
                            this.printerName = null;
                            console.log('[DISCONNECT] Disconnected');
                            resolve();
                        },
                        () => {
                            // Even if disconnect fails, clear state
                            this.device = null;
                            this.printerName = null;
                            resolve();
                        }
                    );
                });
            } catch (error) {
                console.error('[DISCONNECT] Error:', error);
            }
        }
    }

    async write(billData) {
        if (!this.device) {
            throw new Error('Not connected to device');
        }

        if (!window.bluetoothSerial) {
            throw new Error('Bluetooth Serial plugin not available');
        }
        
        console.log('[WRITE] Building receipt as image...');
        
        try {
            // STEP 1: Create large temporary canvas for drawing
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set canvas size for 58mm thermal printer (384 pixels width)
            const width = 384;
            let y = 30;
            tempCanvas.width = width;
            tempCanvas.height = 2000; // Large temporary canvas
            
            // White background with black text
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.fillStyle = '#000000';
            
            // Helper function to draw centered text
            const drawCenter = (text, yPos, fontSize = 20, bold = false) => {
                tempCtx.font = `${bold ? 'bold ' : ''}${fontSize}px Arial`;
                tempCtx.fillStyle = '#000000';
                const textWidth = tempCtx.measureText(text).width;
                tempCtx.fillText(text, (width - textWidth) / 2, yPos);
                return yPos + fontSize + 6;
            };
            
            // Helper function to draw left-aligned text
            const drawLeft = (text, yPos, fontSize = 18) => {
                tempCtx.font = `${fontSize}px Arial`;
                tempCtx.fillStyle = '#000000';
                tempCtx.fillText(text, 15, yPos);
                return yPos + fontSize + 6;
            };
            
            // Helper function to add spacing (no lines)
            const addSpacing = (yPos, space = 12) => {
                return yPos + space;
            };
            
            // Build receipt content on temporary canvas
            
            // STEP 1: Show weights breakdown FIRST for items with multiple weights
            tempCtx.font = '18px Arial';
            tempCtx.fillStyle = '#000000';
            
            billData.items.forEach(item => {
                if (item.weights && item.weights.length > 1) {
                    // Item name with weight count
                    y = drawLeft(`${item.name} (${item.weights.length} वजन)`, y, 18);
                    
                    // Show weights 6 per line
                    for (let i = 0; i < item.weights.length; i += 6) {
                        const weightsLine = item.weights.slice(i, i + 6)
                            .map(w => w.toFixed(1))
                            .join(' ');
                        y = drawLeft(weightsLine, y, 16);
                    }
                    
                    y = addSpacing(y, 8);
                }
            });
            
            // STEP 2: Receipt header
            const receiptY = y;
            y = drawCenter('Receipt', y, 26, true);
            // Draw underline for Receipt
            tempCtx.fillStyle = '#000000';
            const receiptWidth = tempCtx.measureText('Receipt').width;
            tempCtx.fillRect((width - receiptWidth) / 2, receiptY + 2, receiptWidth, 2);
            
            y = drawCenter(new Date().toLocaleDateString('en-IN') + ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), y, 18);
            y = addSpacing(y, 12);
            
            // Customer name if provided
            if (billData.customerName) {
                y = drawLeft('Customer: ' + billData.customerName, y, 18);
                y += 8;
            }
            
            // Table header
            tempCtx.font = 'bold 20px Arial';
            tempCtx.fillStyle = '#000000';
            tempCtx.fillText('वस्तु', 15, y);
            tempCtx.fillText('दर', 140, y);
            tempCtx.fillText('मात्रा', 220, y);
            tempCtx.fillText('कुल', 310, y);
            y += 24;
            y = addSpacing(y, 8);
            
            // Items summary (without weight breakdown in line)
            tempCtx.font = '18px Arial';
            billData.items.forEach(item => {
                const weightsStr = item.qty + 'kg';
                
                tempCtx.fillStyle = '#000000';
                tempCtx.fillText(item.name.substring(0, 11), 15, y);
                tempCtx.fillText('₹' + item.rate, 140, y);
                tempCtx.fillText(weightsStr, 220, y);
                tempCtx.fillText('₹' + item.total, 310, y);
                y += 24;
            });
            
            y = addSpacing(y, 12);
            
            // Totals with proper alignment
            tempCtx.font = '18px Arial';
            tempCtx.fillStyle = '#000000';
            tempCtx.fillText('कुल:', 15, y);
            const totalText = '₹' + billData.billTotal;
            const totalWidth = tempCtx.measureText(totalText).width;
            tempCtx.fillText(totalText, width - totalWidth - 15, y);
            y += 24;
            
            if (billData.isPurchase && billData.laborCharges > 0) {
                tempCtx.fillText('मजदूरी:', 15, y);
                
                // Show calculation only if auto-calculated, else show just the amount
                const settings = AppState.settings || DEFAULT_SETTINGS;
                if (billData.isAutoLabor) {
                    const totalPackets = billData.totalPackets || 0;
                    const laborText = settings.laborRate + ' × ' + totalPackets + ' = ₹' + billData.laborCharges;
                    const laborWidth = tempCtx.measureText(laborText).width;
                    tempCtx.fillText(laborText, width - laborWidth - 15, y);
                } else {
                    const laborText = '₹' + billData.laborCharges;
                    const laborWidth = tempCtx.measureText(laborText).width;
                    tempCtx.fillText(laborText, width - laborWidth - 15, y);
                }
                
                y += 24;
            }
            
            tempCtx.fillText('पैकेट:', 15, y);
            const packetText = String(billData.totalPackets);
            const packetWidth = tempCtx.measureText(packetText).width;
            tempCtx.fillText(packetText, width - packetWidth - 15, y);
            y += 24;
            
            y = addSpacing(y, 12);
            
            // Grand total
            y = drawCenter('कुल भुगतान: ₹' + billData.amountPayable, y, 24, true);
            
            console.log('[WRITE] Drawing complete, height:', y);
            
            // STEP 2: Copy to final canvas with exact height
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = width;
            finalCanvas.height = y;
            const finalCtx = finalCanvas.getContext('2d');
            
            // Copy only the used portion from temp canvas
            finalCtx.drawImage(tempCanvas, 0, 0, width, y, 0, 0, width, y);
            
            console.log('[WRITE] Canvas rendered, converting to bitmap...');
            
            // Get image data from FINAL canvas
            const imageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const pixels = imageData.data;
            
            // Convert to 1-bit monochrome bitmap
            const threshold = 128;
            const bytesPerLine = Math.ceil(finalCanvas.width / 8);
            const bitmapData = [];
            
            for (let y = 0; y < finalCanvas.height; y++) {
                const line = new Array(bytesPerLine).fill(0);
                
                for (let x = 0; x < finalCanvas.width; x++) {
                    const pixelIndex = (y * finalCanvas.width + x) * 4;
                    const r = pixels[pixelIndex];
                    const g = pixels[pixelIndex + 1];
                    const b = pixels[pixelIndex + 2];
                    
                    // Convert to grayscale and apply threshold
                    const gray = (r + g + b) / 3;
                    
                    // Black pixels on canvas should print as black
                    // ESC/POS: bit 1 = black dot, bit 0 = white/no print
                    if (gray < threshold) {
                        const byteIndex = Math.floor(x / 8);
                        const bitIndex = 7 - (x % 8);
                        line[byteIndex] |= (1 << bitIndex);
                    }
                }
                
                bitmapData.push(...line);
            }
            
            console.log('[WRITE] Bitmap created:', bitmapData.length, 'bytes for', finalCanvas.height, 'lines');
            
            // Build ESC/POS commands for image printing
            const commands = [];
            
            // Initialize printer
            commands.push(0x1B, 0x40); // ESC @
            
            // Center align
            commands.push(0x1B, 0x61, 0x01); // ESC a 1
            
            // Use GS v 0 command for raster bitmap printing
            // Format: GS v 0 m xL xH yL yH d1...dk
            // m = mode (0 = normal)
            // xL xH = width in bytes (little endian)
            // yL yH = height in dots (little endian)
            
            commands.push(0x1D, 0x76, 0x30, 0x00); // GS v 0 m
            
            // Width in bytes (little endian)
            commands.push(bytesPerLine & 0xFF);
            commands.push((bytesPerLine >> 8) & 0xFF);
            
            // Height in dots (little endian)
            commands.push(finalCanvas.height & 0xFF);
            commands.push((finalCanvas.height >> 8) & 0xFF);
            
            // Add bitmap data
            commands.push(...bitmapData);
            
            // Feed paper and cut
            commands.push(0x1B, 0x64, 0x03); // ESC d 3 - feed 3 lines
            commands.push(0x1D, 0x56, 0x41, 0x03); // GS V A 3 - partial cut
            
            console.log('[WRITE] Sending', commands.length, 'bytes to printer...');
            
            // Convert to Uint8Array for binary transmission
            const commandBytes = new Uint8Array(commands);
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.write(
                    commandBytes,
                    () => {
                        console.log('[WRITE] Print successful!');
                        resolve(true);
                    },
                    (error) => {
                        console.error('[WRITE] Print failed:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            console.error('[WRITE] Print failed:', error);
            throw error;
        }
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
                customerName: 'Test Customer',
                items: [
                    { name: 'Test Item', qty: 10, rate: 100, total: 1000, weights: [10] }
                ],
                billTotal: 1000,
                laborCharges: 6,
                totalPackets: 1,
                amountPayable: 1006,
                isPurchase: true,
                isAutoLabor: true
            };
            
            await this.manager.write(testBill);
            UIManager.showToast('Test print successful!');
        } catch (error) {
            console.error('Test print error:', error);
            UIManager.showToast('Test print failed: ' + error.message);
        }
    },

    async printBill(billData) {
        // Try Bluetooth first if available and connected
        if (this.manager.device && window.bluetoothSerial) {
            try {
                await this.manager.write(billData);
                return true;
            } catch (error) {
                console.error('Bluetooth print failed:', error);
                const retry = confirm('Bluetooth print failed. Use web print instead?');
                if (retry) {
                    return await this.printViaWeb(billData);
                }
                throw error;
            }
        } else {
            // Fall back to web print
            return await this.printViaWeb(billData);
        }
    },

    async printViaWeb(billData) {
        // Build bill items HTML
        let billItemsHTML = billData.items.map(item => {
            let weightsDisplay = '';
            if (item.weights) {
                if (item.weights.length === 1) {
                    weightsDisplay = `${item.qty}kg`;
                } else {
                    weightsDisplay = `(${item.weights.join('+')}) = ${item.qty}kg`;
                }
            }
            
            return `
                <tr>
                    <td>${item.name}</td>
                    <td>₹${item.rate}</td>
                    <td>${weightsDisplay}</td>
                    <td>₹${item.total}</td>
                </tr>
            `;
        }).join("");

        // Labor display
        let laborDisplay = '';
        if (billData.isPurchase && billData.laborCharges > 0) {
            if (billData.isAutoLabor && billData.laborCalc) {
                laborDisplay = `<div><span>मजदूरी:</span><span>${billData.laborCalc} = ₹${billData.laborCharges}</span></div>`;
            } else {
                laborDisplay = `<div><span>मजदूरी:</span><span>₹${billData.laborCharges}</span></div>`;
            }
        }

        const printContent = `
            <html>
            <head>
                <title>Bill</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border-bottom: 1px solid #ccc; padding: 8px; text-align: center; }
                    h2 { text-align: center; text-decoration: underline; }
                    .totals { margin-top: 30px; font-size: 16px; }
                    .totals div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                    .grand-total { font-size: 20px; font-weight: bold; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; }
                </style>
            </head>
            <body>
                <h2>${billData.duePayment > 0 ? 'RECEIPT' : (billData.isPurchase ? 'PURCHASE RECEIPT' : 'SALE RECEIPT')}</h2>
                ${billData.customerName ? `<p style="text-align: center; margin: 10px 0; font-size: 16px;"><strong>Customer:</strong> ${billData.customerName}</p>` : ''}
                <table>
                    <tr><th>वस्तु</th><th>दर</th><th>मात्रा</th><th>कुल</th></tr>
                    ${billItemsHTML}
                </table>

                <div class="totals">
                    <div><span>कुल:</span><span>₹${billData.billTotal}</span></div>
                    ${laborDisplay}
                    <div><span>पैकेट:</span><span>${billData.totalPackets}</span></div>
                    <div class="grand-total"><span>${billData.isPurchase ? 'कुल भुगतान:' : 'कुल प्राप्त:'}</span><span>₹${billData.amountPayable}</span></div>
                </div>
            </body>
            </html>
        `;

        // Create a hidden iframe for printing
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(printContent);
        doc.close();
        
        // Wait for content to load, then print
        await new Promise(resolve => {
            iframe.contentWindow.focus();
            setTimeout(() => {
                iframe.contentWindow.print();
                setTimeout(() => {
                    document.body.removeChild(iframe);
                    resolve();
                }, 100);
            }, 250);
        });

        return true;
    }
};

// Create singleton instance
const printerManager = new BluetoothPrinterManager();

// Export PrinterService and manager
export { PrinterService, BluetoothPrinterManager, printerManager };
