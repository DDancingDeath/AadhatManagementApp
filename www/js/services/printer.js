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
            const errorMsg = 'Bluetooth Serial plugin not available';
            console.error('[SCAN]', errorMsg);
            throw new Error(errorMsg);
        }
        
        // Request Bluetooth permissions on Android 12+
        if (window.cordova && window.cordova.plugins && window.cordova.plugins.permissions) {
            const permissions = window.cordova.plugins.permissions;
            const permissionsToRequest = [
                permissions.BLUETOOTH_SCAN || 'android.permission.BLUETOOTH_SCAN',
                permissions.BLUETOOTH_CONNECT || 'android.permission.BLUETOOTH_CONNECT',
                permissions.ACCESS_FINE_LOCATION || 'android.permission.ACCESS_FINE_LOCATION'
            ];
            
            try {
                // Check each permission individually
                for (const permission of permissionsToRequest) {
                    await new Promise((resolve, reject) => {
                        permissions.checkPermission(permission, (status) => {
                            if (status.hasPermission) {
                                resolve();
                            } else {
                                permissions.requestPermission(
                                    permission,
                                    (result) => {
                                        if (result.hasPermission) {
                                            resolve();
                                        } else {
                                            reject(new Error('Permission denied: ' + permission));
                                        }
                                    },
                                    () => reject(new Error('Failed to request permission: ' + permission))
                                );
                            }
                        }, () => {
                            // Permission check failed, try to request anyway
                            permissions.requestPermission(
                                permission,
                                (result) => {
                                    if (result.hasPermission) {
                                        resolve();
                                    } else {
                                        reject(new Error('Permission denied: ' + permission));
                                    }
                                },
                                () => reject(new Error('Failed to request permission: ' + permission))
                            );
                        });
                    });
                }
            } catch (permError) {
                console.error('[SCAN] Permission error:', permError);
                throw new Error('Bluetooth permissions required. Please grant all permissions when prompted, or enable them manually in app settings.');
            }
        }
        
        return new Promise((resolve, reject) => {
            UIManager.showLoading();
            
            try {
                window.bluetoothSerial.list(
                    (devices) => {
                        UIManager.hideLoading();
                        resolve(devices || []);
                    },
                    (error) => {
                        UIManager.hideLoading();
                        const errorMsg = error || 'Failed to scan for devices';
                        console.error('[SCAN] Error:', errorMsg);
                        reject(new Error(errorMsg));
                    }
                );
            } catch (error) {
                UIManager.hideLoading();
                const errorMsg = 'Bluetooth scan failed: ' + error.message;
                console.error('[SCAN] Exception:', error);
                reject(new Error(errorMsg));
            }
        });
    }

    async connect(deviceId, deviceName = null) {
        try {
            if (!window.bluetoothSerial) {
                const errorMsg = 'Bluetooth Serial plugin not available';
                console.error('[CONNECT]', errorMsg);
                throw new Error(errorMsg);
            }
            
            UIManager.showLoading();
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.connect(
                    deviceId,
                    () => {
                        UIManager.hideLoading();
                        this.device = deviceId;
                        this.printerName = deviceName;
                        resolve(true);
                    },
                    (error) => {
                        UIManager.hideLoading();
                        const errorMsg = error || 'Connection failed';
                        console.error('[CONNECT] Error:', errorMsg);
                        reject(new Error(errorMsg));
                    }
                );
            });
        } catch (error) {
            UIManager.hideLoading();
            const errorMsg = 'Connection failed: ' + error.message;
            console.error('[CONNECT] Exception:', error);
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
                
                const weightsText = item.weights.map(w => parseFloat(w).toFixed(1)).join('  ');
                const maxWidth = 380;
                ctx.font = '17px Arial';
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

    _drawReceiptHeader(ctx, billData, config, utils, y) {
        y = utils.drawCenter('Receipt', y, config.fonts.title, true);
        
        // Bill number on left, Date/time on right (same line)
        const dateTime = new Date().toLocaleDateString('en-IN') + ' ' + 
                        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        
        if (billData.billNumber) {
            // Draw bill number on left
            ctx.font = '17px Arial';
            ctx.fillText('Bill: ' + billData.billNumber, config.padding.side, y);
            
            // Draw date/time on right
            const dateWidth = ctx.measureText(dateTime).width;
            ctx.fillText(dateTime, config.width - dateWidth - config.padding.side, y);
            
            y += config.spacing.line;
        } else {
            // If no bill number, center the date/time
            y = utils.drawCenter(dateTime, y, config.fonts.subtext);
        }
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
            ctx.fillText((item.qty || 0).toFixed(1), config.columns.quantity, y);
            ctx.fillText(Math.round(item.total).toString(), config.columns.total, y);
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
        
        // Get the subtotal (purchases use billTotal, sales use total or saleTotal)
        const subtotal = billData.billTotal || billData.saleTotal || billData.total || 0;
        
        // Subtotal
        ctx.fillText('कुल:', config.padding.left, y);
        const totalText = '₹' + Math.round(subtotal);
        const totalWidth = ctx.measureText(totalText).width;
        ctx.fillText(totalText, config.width - totalWidth - config.padding.left, y);
        y += config.spacing.line;
        
        // Labor charges (only for purchases)
        if (billData.isPurchase && billData.laborCharges > 0) {
            if (billData.laborCalc) {
                // Show calculation in middle and amount on right
                ctx.fillText('मजदूरी:', config.padding.left, y);
                const calcWidth = ctx.measureText(billData.laborCalc).width;
                const calcX = (config.width - calcWidth) / 2;
                ctx.fillText(billData.laborCalc, calcX, y);
                const laborText = `₹${billData.laborCharges}`;
                const laborWidth = ctx.measureText(laborText).width;
                ctx.fillText(laborText, config.width - laborWidth - config.padding.left, y);
            } else {
                // No calculation, just show amount
                ctx.fillText('मजदूरी:', config.padding.left, y);
                const laborText = `₹${billData.laborCharges}`;
                const laborWidth = ctx.measureText(laborText).width;
                ctx.fillText(laborText, config.width - laborWidth - config.padding.left, y);
            }
            y += config.spacing.line;
        }
        
        // Add spacing before grand total
        y += 8;
        
        // Grand total - Total bill amount
        ctx.font = `bold ${config.fonts.total.size}px Arial`;
        const grandTotalLabel = 'कुल:';
        ctx.fillText(grandTotalLabel, config.padding.left, y);
        const amountPayable = billData.amountPayable || billData.grandTotal || billData.saleTotal || billData.total ||
                             (subtotal - (billData.laborCharges || 0));
        const payableText = '₹' + Math.round(amountPayable);
        const payableWidth = ctx.measureText(payableText).width;
        ctx.fillText(payableText, config.width - payableWidth - config.padding.left, y);
        y += config.spacing.line;
        
        // Calculate actual received amount (cash + online)
        const cashReceived = Number(billData.payment?.cash) || Number(billData.cashPayment) || 0;
        const onlineReceived = Number(billData.payment?.online) || Number(billData.onlinePayment) || 0;
        const totalReceived = cashReceived + onlineReceived;
        
        // Total Received (कुल प्राप्त / कुल भुगतान)
        y += 4;
        ctx.font = `${config.fonts.body.size}px Arial`;
        const receivedLabel = billData.isPurchase ? 'कुल भुगतान:' : 'कुल प्राप्त:';
        ctx.fillText(receivedLabel, config.padding.left, y);
        const receivedText = '₹' + Math.round(totalReceived);
        const receivedWidth = ctx.measureText(receivedText).width;
        ctx.fillText(receivedText, config.width - receivedWidth - config.padding.left, y);
        y += config.spacing.line;
        
        // Due amount (बकाया)
        const dueAmount = billData.payment?.due || billData.dueAmount || 0;
        if (dueAmount > 0) {
            y += 4; // Small gap
            ctx.font = `bold ${config.fonts.body.size}px Arial`;
            ctx.fillText('बकाया:', config.padding.left, y);
            const dueText = '₹' + Math.round(dueAmount);
            const dueWidth = ctx.measureText(dueText).width;
            ctx.fillText(dueText, config.width - dueWidth - config.padding.left, y);
            y += config.spacing.line;
        }
        
        // Comments - Only print if printComments flag is true and comments exist
        if (billData.printComments && billData.comments && billData.comments.trim()) {
            y += 8; // Gap before comments
            ctx.font = `${config.fonts.body.size}px Arial`;
            
            // Print "Note: <comment>" on the same line, with word wrap if needed
            const noteLabel = 'Note: ';
            const labelWidth = ctx.measureText(noteLabel).width;
            const maxWidth = config.width - config.padding.left - 10;
            const commentText = billData.comments.trim();
            
            // Check if it fits on one line
            const fullText = noteLabel + commentText;
            if (ctx.measureText(fullText).width <= maxWidth) {
                // Fits on one line
                ctx.fillText(fullText, config.padding.left, y);
                y += config.spacing.line;
            } else {
                // Need word wrap - print label first, then wrap remaining text
                ctx.fillText(noteLabel, config.padding.left, y);
                const remainingWidth = maxWidth - labelWidth;
                const words = commentText.split(' ');
                let line = '';
                let firstLine = true;
                
                for (const word of words) {
                    const testLine = line + (line ? ' ' : '') + word;
                    const currentMaxWidth = firstLine ? remainingWidth : maxWidth;
                    const testWidth = ctx.measureText(testLine).width;
                    
                    if (testWidth > currentMaxWidth && line) {
                        if (firstLine) {
                            ctx.fillText(line, config.padding.left + labelWidth, y);
                            firstLine = false;
                        } else {
                            ctx.fillText(line, config.padding.left, y);
                        }
                        y += config.spacing.line - 4;
                        line = word;
                    } else {
                        line = testLine;
                    }
                }
                if (line) {
                    if (firstLine) {
                        ctx.fillText(line, config.padding.left + labelWidth, y);
                    } else {
                        ctx.fillText(line, config.padding.left, y);
                    }
                    y += config.spacing.line;
                }
            }
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
        
        y = this._drawReceiptHeader(tempCtx, billData, config, utils, y);
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
        
        try {
            const finalCanvas = await this.generateBillCanvas(billData);
            const finalCtx = finalCanvas.getContext('2d');
            
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
            
            // Convert to Uint8Array for binary transmission
            const commandBytes = new Uint8Array(commands);
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.write(
                    commandBytes,
                    () => {
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
    
    async generateExpenseCanvas(expense) {
        const config = {
            width: 384,
            padding: { left: 0, right: 0, top: 0, bottom: 0 },
            fonts: {
                header: { size: 24, weight: 'bold' },
                body: { size: 18, weight: 'normal' },
                total: { size: 22, weight: 'bold' }
            },
            spacing: {
                line: 28,
                section: 16
            }
        };
        
        const canvas = document.createElement('canvas');
        canvas.width = config.width;
        
        // Calculate height needed
        let estimatedHeight = 300; // Base height for expense
        canvas.height = estimatedHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        
        let y = 30;
        
        // Receipt Header
        ctx.font = `bold ${config.fonts.header.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('Receipt', config.width / 2, y);
        y += config.fonts.header.size + 10;
        
        // Date and Time
        ctx.font = `${config.fonts.body.size}px Arial`;
        let dateTime;
        let expenseDate;
        
        // Try to parse the date from various possible formats
        if (expense.timestamp) {
            expenseDate = new Date(expense.timestamp);
        } else if (expense.date) {
            // Try parsing the date string
            expenseDate = new Date(expense.date);
        } else {
            expenseDate = new Date();
        }
        
        // Check if date is valid, if not use current date
        if (isNaN(expenseDate.getTime())) {
            expenseDate = new Date();
        }
        
        dateTime = expenseDate.toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        ctx.fillText(dateTime, config.width / 2, y);
        y += config.spacing.line + 10;
        
        // Content in Hindi
        ctx.textAlign = 'left';
        ctx.font = `${config.fonts.body.size}px Arial`;
        
        // Type
        ctx.fillText('Type:', 10, y);
        ctx.fillText(expense.type, 120, y);
        y += config.spacing.line;
        
        // Amount
        ctx.font = `bold ${config.fonts.total.size}px Arial`;
        ctx.fillText('Amount:', 10, y);
        ctx.fillText(`₹${expense.amount}`, 120, y);
        y += config.spacing.line + 5;
        
        ctx.font = `${config.fonts.body.size}px Arial`;
        
        // Person (if available)
        if (expense.personName) {
            ctx.fillText('Name:', 10, y);
            ctx.fillText(expense.personName, 120, y);
            y += config.spacing.line;
        }
        
        y += 20;
        
        // Adjust canvas height to actual content
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = config.width;
        finalCanvas.height = y;
        
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.fillStyle = '#FFFFFF';
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        finalCtx.drawImage(canvas, 0, 0);
        
        return finalCanvas;
    }
    
    async writeExpense(expense) {
        if (!this.device) {
            throw new Error('Not connected to device');
        }

        if (!window.bluetoothSerial) {
            throw new Error('Bluetooth Serial plugin not available');
        }
        
        try {
            const finalCanvas = await this.generateExpenseCanvas(expense);
            const finalCtx = finalCanvas.getContext('2d');
            
            // Get image data
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
                    
                    const gray = (r + g + b) / 3;
                    
                    if (gray < threshold) {
                        const byteIndex = Math.floor(x / 8);
                        const bitIndex = 7 - (x % 8);
                        line[byteIndex] |= (1 << bitIndex);
                    }
                }
                
                bitmapData.push(...line);
            }
            
            // Build ESC/POS commands
            const commands = [];
            
            commands.push(0x1B, 0x40); // Initialize
            commands.push(0x1B, 0x61, 0x01); // Center align
            commands.push(0x1D, 0x76, 0x30, 0x00); // GS v 0 m
            
            commands.push(bytesPerLine & 0xFF);
            commands.push((bytesPerLine >> 8) & 0xFF);
            commands.push(finalCanvas.height & 0xFF);
            commands.push((finalCanvas.height >> 8) & 0xFF);
            
            commands.push(...bitmapData);
            
            commands.push(0x1B, 0x64, 0x03); // Feed 3 lines
            commands.push(0x1D, 0x56, 0x41, 0x03); // Partial cut
            
            const commandBytes = new Uint8Array(commands);
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.write(
                    commandBytes,
                    () => {
                        resolve(true);
                    },
                    (error) => {
                        console.error('[WRITE EXPENSE] Print failed:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            console.error('[WRITE EXPENSE] Print failed:', error);
            throw error;
        }
    }
}

const PrinterService = {
    manager: new BluetoothPrinterManager(),

    async scanDevices() {
        try {
            const devices = await this.manager.scan();
            return devices;
        } catch (error) {
            console.error('Printer scan error:', error);
            UIManager.showToast('Failed to scan devices: ' + error.message);
            throw error;
        }
    },

    async connect(deviceId, deviceName) {
        try {
            await this.manager.connect(deviceId, deviceName);
            this.updateStatus();
            return true;
        } catch (error) {
            console.error('Printer connect error:', error);
            UIManager.showToast('Failed to connect: ' + error.message);
            throw error;
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
                UIManager.showToast('✓ Printed successfully');
                return true;
            } catch (error) {
                console.error('Bluetooth print failed:', error);
                UIManager.showToast('Print failed: ' + (error.message || error));
                // Automatically show preview on Bluetooth failure
                return await this.showBillPreview(billData);
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
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                gap: 10px;
                margin-top: 20px;
                justify-content: center;
            `;
            
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download';
            downloadBtn.style.cssText = `
                padding: 12px 24px;
                background: #22c55e;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                min-width: 140px;
            `;
            downloadBtn.onclick = () => {
                // Create a new canvas with padding
                const padding = 20;
                const paddedCanvas = document.createElement('canvas');
                paddedCanvas.width = canvas.width + (padding * 2);
                paddedCanvas.height = canvas.height + (padding * 2);
                
                const paddedCtx = paddedCanvas.getContext('2d');
                paddedCtx.fillStyle = '#FFFFFF';
                paddedCtx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
                paddedCtx.drawImage(canvas, padding, padding);
                
                const billType = billData.isPurchase ? 'purchase' : 'sale';
                const link = document.createElement('a');
                link.download = `${billType}_bill_${billData.id || Date.now()}.png`;
                link.href = paddedCanvas.toDataURL('image/png');
                link.click();
            };
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = `
                padding: 12px 24px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                min-width: 140px;
            `;
            closeBtn.onclick = () => document.body.removeChild(modal);
            
            buttonContainer.appendChild(downloadBtn);
            buttonContainer.appendChild(closeBtn);
            
            modal.appendChild(img);
            modal.appendChild(buttonContainer);
            document.body.appendChild(modal);
            
            return true;
        } catch (error) {
            console.error('Preview generation failed:', error);
            UIManager.showToast('Failed to generate bill preview');
            return false;
        }
    },

    async printExpense(expense) {
        // Try Bluetooth first if available and connected
        if (this.manager.device && window.bluetoothSerial) {
            try {
                await this.manager.writeExpense(expense);
                UIManager.showToast('✓ Expense printed successfully');
                return true;
            } catch (error) {
                console.error('Bluetooth expense print failed:', error);
                UIManager.showToast('Print failed: ' + (error.message || error));
                // Automatically show preview on Bluetooth failure
                return await this.showExpensePreview(expense);
            }
        } else {
            // No Bluetooth printer - show preview
            return await this.showExpensePreview(expense);
        }
    },
    
    async showExpensePreview(expense) {
        try {
            // Generate canvas for expense
            const canvas = await this.manager.generateExpenseCanvas(expense);
            
            // Convert canvas to data URL
            const dataUrl = canvas.toDataURL('image/png');
            
            // Show in a modal
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
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                gap: 10px;
                margin-top: 20px;
                justify-content: center;
            `;
            
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download';
            downloadBtn.style.cssText = `
                padding: 12px 24px;
                background: #22c55e;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                min-width: 140px;
            `;
            downloadBtn.onclick = () => {
                // Create a new canvas with padding
                const padding = 20;
                const paddedCanvas = document.createElement('canvas');
                paddedCanvas.width = canvas.width + (padding * 2);
                paddedCanvas.height = canvas.height + (padding * 2);
                
                const paddedCtx = paddedCanvas.getContext('2d');
                paddedCtx.fillStyle = '#FFFFFF';
                paddedCtx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
                paddedCtx.drawImage(canvas, padding, padding);
                
                const link = document.createElement('a');
                link.download = `expense_${expense.id || Date.now()}.png`;
                link.href = paddedCanvas.toDataURL('image/png');
                link.click();
            };
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = `
                padding: 12px 24px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                min-width: 140px;
            `;
            closeBtn.onclick = () => document.body.removeChild(modal);
            
            buttonContainer.appendChild(downloadBtn);
            buttonContainer.appendChild(closeBtn);
            
            modal.appendChild(img);
            modal.appendChild(buttonContainer);
            
            document.body.appendChild(modal);
            
            // Close on background click
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            };
            
            return true;
        } catch (error) {
            console.error('Failed to show expense preview:', error);
            UIManager.showToast('Failed to generate preview: ' + error.message);
            return false;
        }
    },

    async printWholesaleSale(saleData) {
        // Convert sale data to bill format for printing
        const billData = {
            id: saleData.id || Date.now(),
            billNumber: saleData.billNumber,
            customerName: saleData.customerName || 'Walk-in Customer',
            items: saleData.items.map(item => ({
                name: item.name,
                rate: item.rate,
                qty: item.qty || item.quantity,
                total: item.total
            })),
            total: saleData.total,
            saleTotal: saleData.total,
            grandTotal: saleData.total,
            amountPayable: saleData.total,
            totals: {
                billTotal: saleData.total,
                labor: 0,
                payable: saleData.total
            },
            payment: saleData.payment || {
                online: 0,
                cash: 0,
                due: saleData.total
            },
            payments: {
                online: 0,
                cash: 0,
                due: saleData.total
            },
            comments: saleData.comments || '',
            date: saleData.date || new Date().toLocaleString('en-IN'),
            mode: 'sale',
            isPurchase: false
        };

        // Use the standard printBill method
        return await this.printBill(billData);
    }
};

// Create singleton instance
const printerManager = new BluetoothPrinterManager();

// Export PrinterService and manager
export { PrinterService, BluetoothPrinterManager, printerManager };
