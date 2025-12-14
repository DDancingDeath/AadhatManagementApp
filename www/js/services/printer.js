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

    _createDrawingUtils(ctx, config) {
        return {
            drawCenter: (text, y, font, bold = false) => {
                ctx.font = `${bold ? 'bold ' : ''}${font.size}px Arial`;
                ctx.fillStyle = '#000000';
                const textWidth = ctx.measureText(text).width;
                ctx.fillText(text, (config.width - textWidth) / 2, y);
                return y + font.size + config.spacing.tiny;
            },
            
            drawLeft: (text, y, font) => {
                ctx.font = `${font.weight} ${font.size}px Arial`;
                ctx.fillStyle = '#000000';
                ctx.fillText(text, 2, y);
                return y + font.size + config.spacing.tiny;
            },
            
            drawLine: (y, thickness = 2, sidePadding = 10) => {
                ctx.fillStyle = '#000000';
                ctx.fillRect(sidePadding, y, config.width - sidePadding * 2, thickness);
                return y;
            },
            
            drawRow: (texts, y, font, alignments = ['left']) => {
                ctx.font = `${font.weight} ${font.size}px Arial`;
                ctx.fillStyle = '#000000';
                texts.forEach((text, i) => {
                    ctx.textAlign = alignments[i] || 'left';
                    ctx.fillText(text, Object.values(config.columns)[i], y);
                });
                ctx.textAlign = 'left';
                return y + config.spacing.line;
            }
        };
    }

    _drawWeightsBreakdown(ctx, billData, utils, y) {
        ctx.font = `${DEFAULT_SETTINGS.fontSize || 18}px Arial`;
        
        billData.items.forEach(item => {
            if (item.weights && item.weights.length > 1) {
                const itemObj = AppState.items.find(i => i.id === item.itemId || i.name === item.name);
                const displayName = (itemObj && itemObj.hindiName) ? itemObj.hindiName : item.name;
                
                y = utils.drawLeft(`${displayName} (${item.weights.length} पैकेट, ${item.qty.toFixed(1)} kg)`, y, { size: 18, weight: 'bold' });
                
                const weightsText = item.weights.map(w => w.toFixed(1)).join(' ');
                const maxWidth = 380;
                ctx.font = '16px Arial';
                const words = weightsText.split(' ');
                let line = '';
                
                for (let i = 0; i < words.length; i++) {
                    const testLine = line + (line ? ' ' : '') + words[i];
                    const metrics = ctx.measureText(testLine);
                    
                    if (metrics.width > maxWidth && line) {
                        y = utils.drawLeft(line, y, { size: 16, weight: 'normal' });
                        line = words[i];
                    } else {
                        line = testLine;
                    }
                }
                if (line) {
                    y = utils.drawLeft(line, y, { size: 16, weight: 'normal' });
                }
                y += 10;
            }
        });
        
        return y;
    }

    _drawReceiptHeader(ctx, config, utils, y) {
        y = utils.drawCenter('Receipt', y, config.fonts.title, true);
        // y += 4;
        
        // Date/time
        const dateTime = new Date().toLocaleDateString('en-IN') + ' ' + 
                        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        y = utils.drawCenter(dateTime, y, config.fonts.subtext);
        y += config.spacing.section;
        
        return y;
    }

    _drawCustomerInfo(billData, utils, y) {
        if (billData.customerName) {
            y = utils.drawLeft('Customer: ' + billData.customerName, y, { size: 18, weight: 'normal' });
            y += 8;
        }
        return y;
    }

    _drawItemsTable(ctx, billData, config, utils, y) {
        // Table header
        ctx.font = `bold ${config.fonts.header.size}px Arial`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.fillText('वस्तु', config.columns.item, y);
        ctx.fillText('दर(₹)', config.columns.rate, y);
        ctx.fillText('मात्रा(kg)', config.columns.quantity, y);
        ctx.fillText('कुल(₹)', config.columns.total, y);
        y += config.spacing.line;
        
        // Items
        ctx.font = `${config.fonts.body.size}px Arial`;
        billData.items.forEach(item => {
            const itemObj = AppState.items.find(i => i.id === item.itemId || i.name === item.name);
            const displayName = (itemObj && itemObj.hindiName) ? itemObj.hindiName : item.name;
            
            ctx.textAlign = 'left';
            ctx.fillText(displayName.substring(0, 11), config.columns.item, y);
            ctx.fillText(item.rate.toString(), config.columns.rate, y);
            ctx.fillText(item.qty.toString(), config.columns.quantity, y);
            ctx.fillText(item.total.toString(), config.columns.total, y);
            y += config.spacing.line;
        });
        
        // Add spacing before totals
        y += 12;
        
        return y;
    }

    _drawTotalsSection(ctx, billData, config, utils, y) {
        ctx.font = `${config.fonts.body.size}px Arial`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        
        // Subtotal
        ctx.fillText('कुल:', config.padding.left, y);
        const totalText = '₹' + billData.billTotal;
        const totalWidth = ctx.measureText(totalText).width;
        ctx.fillText(totalText, config.width - totalWidth - config.padding.left, y);
        y += config.spacing.line;
        
        // Labor charges
        if (billData.isPurchase && billData.laborCharges > 0) {
            ctx.fillText('मजदूरी:', config.padding.left, y);
            const laborText = billData.laborCalc 
                ? `${billData.laborCalc} = ₹${billData.laborCharges}`
                : `₹${billData.laborCharges}`;
            const laborWidth = ctx.measureText(laborText).width;
            ctx.fillText(laborText, config.width - laborWidth - config.padding.left, y);
            y += config.spacing.line;
        }
        
        // Add spacing before grand total
        y += 8;
        
        // Grand total
        ctx.font = `bold ${config.fonts.total.size}px Arial`;
        ctx.fillText('कुल भुगतान:', config.padding.left, y);
        const amountPayable = billData.amountPayable || billData.grandTotal || 
                             (billData.billTotal - (billData.laborCharges || 0));
        const payableText = '₹' + amountPayable.toFixed(2);
        const payableWidth = ctx.measureText(payableText).width;
        ctx.fillText(payableText, config.width - payableWidth - config.padding.left, y);
        y += config.spacing.line;
        
        // Due amount (बकाया)
        const dueAmount = billData.payment?.due || billData.dueAmount || 0;
        if (dueAmount > 0) {
            y += 4; // Small gap
            ctx.font = `${config.fonts.body.size}px Arial`;
            ctx.fillText('बकाया:', config.padding.left, y);
            const dueText = '₹' + dueAmount.toFixed(2);
            const dueWidth = ctx.measureText(dueText).width;
            ctx.fillText(dueText, config.width - dueWidth - config.padding.left, y);
            y += config.spacing.line;
        }
        
        return y;
    }

    async generateBillCanvas(billData) {
        const config = {
            width: 384, // 58mm thermal printer width
            padding: { left: 0, right: 0, side: 0 },
            fonts: {
                title: { size: 26, weight: 'bold' },
                header: { size: 20, weight: 'bold' },
                body: { size: 19, weight: 'normal' },
                subtext: { size: 18, weight: 'normal' },
                small: { size: 16, weight: 'normal' },
                total: { size: 21, weight: 'bold' }
            },
            columns: { item: 2, rate: 100, quantity: 190, total: 320 },
            spacing: { line: 24, section: 12, small: 8, tiny: 6 },
            lines: { thin: 1.5, normal: 2, bold: 3 }
        };

        // Create temporary canvas
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = config.width;
        tempCanvas.height = 2000;
        
        // Initialize with white background
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.fillStyle = '#000000';
        
        // Drawing utilities
        const utils = this._createDrawingUtils(tempCtx, config);
        let y = 20;

        // Draw receipt sections
        y = this._drawWeightsBreakdown(tempCtx, billData, utils, y);
        y += config.spacing.section;
        
        y = this._drawReceiptHeader(tempCtx, config, utils, y);
        y = this._drawCustomerInfo(billData, utils, y);
        y = this._drawItemsTable(tempCtx, billData, config, utils, y);
        y = this._drawTotalsSection(tempCtx, billData, config, utils, y);
        
        // Copy to final canvas with exact height
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = config.width;
        finalCanvas.height = y;
        const finalCtx = finalCanvas.getContext('2d');
        
        // Copy only the used portion from temp canvas
        finalCtx.drawImage(tempCanvas, 0, 0, config.width, y, 0, 0, config.width, y);
        
        return finalCanvas;
    }

    async write(billData) {
        if (!this.device) {
            throw new Error('Not connected to device');
        }

        if (!window.bluetoothSerial) {
            throw new Error('Bluetooth Serial plugin not available');
        }
        
        console.log('[WRITE] Generating bill canvas...');
        
        try {
            const finalCanvas = await this.generateBillCanvas(billData);
            
            console.log('[WRITE] Converting to bitmap...');
            
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
                const retry = confirm('Bluetooth print failed. Show bill preview?');
                if (retry) {
                    return await this.showBillPreview(billData);
                }
                throw error;
            }
        } else {
            // No Bluetooth printer - show preview
            return await this.showBillPreview(billData);
        }
    },

    async showBillPreview(billData) {
        try {
            // Generate canvas using the same method as Bluetooth printing
            const canvas = await this.manager.generateBillCanvas(billData);
            
            // Convert canvas to data URL
            const dataUrl = canvas.toDataURL('image/png');
            
            // Show in a modal or preview element
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
            `;
            
            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.cssText = `
                max-width: 90%;
                max-height: 80vh;
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            `;
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = `
                margin-top: 20px;
                padding: 12px 24px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
            `;
            closeBtn.onclick = () => document.body.removeChild(modal);
            
            modal.appendChild(img);
            modal.appendChild(closeBtn);
            document.body.appendChild(modal);
            
            return true;
        } catch (error) {
            console.error('Preview generation failed:', error);
            UIManager.showToast('Failed to generate bill preview');
            return false;
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
