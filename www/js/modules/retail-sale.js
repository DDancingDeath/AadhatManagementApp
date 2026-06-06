/**
 * @fileoverview Retail Sale module for managing retail sale transactions
 * Handles retail sale creation, weight tracking, and completing sales
 * @module modules/retail-sale
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { PrinterService } from '../services/printer.js';
import { AuditService } from '../services/audit.js';
import { Helpers } from '../utils/helpers.js';
import { computeStockShortfalls, formatShortfallMessage } from '../utils/stock-check.js';

/**
 * @type {Array<Object>} Current items for sale mode
 * @private
 */
let saleItems = [];

/**
 * @type {Array<number>} Weight entries for sale mode
 * @private
 */
let saleWeights = [];

/**
 * Retail Sale Manager - Handles all retail sale operations
 * @namespace RetailSaleManager
 */
const RetailSaleManager = {
    /**
     * Reference to parent billing manager for shared operations
     * @type {Object}
     */
    billingManager: null,

    /**
     * Initialize with reference to billing manager
     * @param {Object} billingManager - The parent billing manager
     */
    init(billingManager) {
        this.billingManager = billingManager;
    },

    // -------------------- WEIGHT MANAGEMENT --------------------

    /**
     * Add a weight entry
     * @async
     * @param {boolean} autoAddToBill - Whether to auto-add to bill after adding weight
     */
    async addSaleWeight(autoAddToBill = false) {
        const weightInput = document.getElementById('saleWeight');
        const weight = parseFloat(weightInput?.value);
        
        if (!weight || weight <= 0) {
            UIManager.showToast('Please enter a valid weight');
            return;
        }
        
        saleWeights.push(weight);
        weightInput.value = '';
        weightInput.focus();
        
        this.renderSaleWeights();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
        
        if (autoAddToBill && saleWeights.length === 1) {
            await this.addToSalesBill(true);
        }
    },

    /**
     * Render the sale weights display
     */
    renderSaleWeights() {
        const container = document.getElementById('saleWeightsDisplay');
        if (!container) return;
        
        const totalWeightsSpan = document.getElementById('saleRunningTotal');
        const totalPacketsSpan = document.getElementById('salePacketCount');
        
        if (saleWeights.length === 0) {
            container.innerHTML = '';
            if (totalWeightsSpan) totalWeightsSpan.textContent = '0';
            if (totalPacketsSpan) totalPacketsSpan.textContent = '0';
            return;
        }
        
        const total = saleWeights.reduce((sum, w) => sum + w, 0);
        
        if (totalWeightsSpan) totalWeightsSpan.textContent = total.toFixed(1);
        if (totalPacketsSpan) totalPacketsSpan.textContent = saleWeights.length;
        
        container.innerHTML = `
            <div class="weights-compact-list">
                ${saleWeights.map((w, i) => `
                    <div class="weight-chip">
                        <span>${w.toFixed(1)}</span>
                        <button class="weight-chip-remove" onclick="window.app.retailSale.removeSaleWeight(${i})">×</button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Remove a sale weight by index
     * @param {number} index - Index of weight to remove
     */
    removeSaleWeight(index) {
        saleWeights.splice(index, 1);
        this.renderSaleWeights();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
    },

    /**
     * Clear all sale weights
     */
    clearSaleWeights() {
        saleWeights = [];
        this.renderSaleWeights();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
    },

    // -------------------- SALE BILL MANAGEMENT --------------------

    /**
     * Add current item to sales bill
     * @async
     * @param {boolean} autoAdd - Whether this is an auto-add
     */
    async addToSalesBill(autoAdd = false) {
        const itemSelect = document.getElementById('saleItem');
        const rateInput = document.getElementById('saleRate');
        const weightInput = document.getElementById('saleWeight');
        
        if (!itemSelect || !rateInput) return;
        
        const itemIndex = parseInt(itemSelect.value);
        const rate = parseFloat(rateInput.value);
        
        if (itemIndex === undefined || itemIndex === '' || isNaN(itemIndex)) {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        let qty;
        let packets;
        let allWeights = [];
        
        const typedWeight = parseFloat(weightInput?.value);
        const hasTypedWeight = typedWeight && typedWeight > 0;
        
        if (saleWeights.length > 0 || hasTypedWeight) {
            allWeights = [...saleWeights];
            if (hasTypedWeight) {
                allWeights.push(typedWeight);
            }
            
            qty = allWeights.reduce((sum, w) => sum + w, 0);
            packets = allWeights.length;
        } else {
            UIManager.showToast('Please add weights or enter a quantity');
            return;
        }
        
        const item = AppState.items[itemIndex];
        if (!item) {
            UIManager.showToast('Item not found');
            return;
        }
        
        const itemName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        const total = Math.round(qty * rate);
        
        saleItems.push({
            itemId: item.id,
            name: itemName,
            rate,
            qty,
            packets,
            weights: allWeights,
            total,
            timestamp: Date.now()
        });
        
        this.renderSalesBill();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        
        // Clear weights and reset inputs
        saleWeights = [];
        this.renderSaleWeights();
        
        itemSelect.selectedIndex = 0;
        rateInput.value = '';
        if (weightInput) weightInput.value = '';
        
        itemSelect.focus();
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${itemName} to sale`);
    },

    /**
     * Render the sales bill table
     */
    renderSalesBill() {
        const tbody = document.querySelector('#saleTable tbody');
        const totalSalePacketsSpan = document.getElementById('totalSalePacketsInBill');
        const saleTotalSpan = document.getElementById('saleTotal');
        const saleWeightBreakdownSection = document.getElementById('saleWeightBreakdownSection');
        
        if (!tbody) return;
        
        if (saleItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No items in bill</td></tr>';
            if (saleTotalSpan) saleTotalSpan.textContent = '0';
            if (totalSalePacketsSpan) totalSalePacketsSpan.textContent = '0';
            if (saleWeightBreakdownSection) saleWeightBreakdownSection.innerHTML = '';
            this.updateSaleTotals();
            this.updateSaleRunningTotal();
            return;
        }
        
        // Render weight breakdown for items with 2 or more packets
        if (saleWeightBreakdownSection) {
            const itemsWithMultipleWeights = saleItems.filter(item => item.weights && item.weights.length >= 2);
            
            if (itemsWithMultipleWeights.length > 0) {
                saleWeightBreakdownSection.innerHTML = itemsWithMultipleWeights.map(item => {
                    const weightsPerLine = 6;
                    const weightLines = [];
                    for (let i = 0; i < item.weights.length; i += weightsPerLine) {
                        const lineWeights = item.weights.slice(i, i + weightsPerLine);
                        weightLines.push(lineWeights.map(w => parseFloat(w).toFixed(1)).join('&nbsp;&nbsp;'));
                    }
                    
                    return `
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #22c55e;">
                            <div style="font-weight: 600; margin-bottom: 6px; color: #333;">
                                ${item.name} (${item.weights.length} packets, ${item.qty.toFixed(1)} kg)
                            </div>
                            <div style="font-family: monospace; font-size: 14px; line-height: 1.4; color: #555;">
                                ${weightLines.join('<br>')}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                saleWeightBreakdownSection.innerHTML = '';
            }
        }
        
        // Render bill items table
        tbody.innerHTML = saleItems.map((item, index) => `
            <tr style="cursor: pointer;" onclick="window.app.retailSale.editSaleItem(${index})">
                <td>${item.name}</td>
                <td>₹${item.rate.toFixed(2)}</td>
                <td>${item.qty.toFixed(1)} kg</td>
                <td>₹${Math.round(item.total)}</td>
                <td><button onclick="event.stopPropagation(); window.app.retailSale.removeSaleItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
            </tr>
        `).join('');
        
        // Update totals
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = saleItems.reduce((sum, item) => sum + (item.packets || 1), 0);
        
        if (saleTotalSpan) saleTotalSpan.textContent = Math.round(salesTotal);
        if (totalSalePacketsSpan) totalSalePacketsSpan.textContent = totalPackets;
        
        this.updateSaleTotals();
        this.updateSaleRunningTotal();
        this.updateSalePaymentTotal();
    },

    /**
     * Remove a sale item by index
     * @param {number} index - Index of item to remove
     */
    removeSaleItem(index) {
        saleItems.splice(index, 1);
        this.renderSalesBill();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
    },

    /**
     * Edit a sale item
     * @param {number} index - Index of item to edit
     */
    editSaleItem(index) {
        const currentItem = Helpers.getInputText('saleItem');
        const currentRate = Helpers.getInputNumber('saleRate');
        
        if (currentItem && currentRate && saleWeights.length > 0) {
            this.addToSalesBill(true);
        }
        
        const item = saleItems[index];
        if (!item) return;
        
        saleItems.splice(index, 1);
        this.renderSalesBill();
        
        const itemIndex = AppState.items.findIndex(i => i.id === item.itemId || i.name === item.name);
        if (itemIndex !== -1) {
            document.getElementById('saleItem').value = itemIndex;
            if (this.billingManager) this.billingManager.loadSaleRates();
            
            setTimeout(() => {
                document.getElementById('saleRate').value = item.rate;
            }, 50);
        }
        
        if (item.qty && item.packets) {
            if (item.weights && item.weights.length > 0) {
                saleWeights = [...item.weights];
            } else {
                const avgWeight = item.qty / item.packets;
                saleWeights = Array(item.packets).fill(avgWeight);
            }
        } else {
            saleWeights = [item.qty];
        }
        this.renderSaleWeights();
        
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
        UIManager.showToast('Item loaded for editing');
    },

    // -------------------- TOTALS --------------------

    /**
     * Update sale totals display
     */
    updateSaleTotals() {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        
        const saleTotalEl = document.getElementById('saleTotal');
        const amountReceivableEl = document.getElementById('amountReceivable');
        
        if (saleTotalEl) saleTotalEl.textContent = Math.round(total);
        if (amountReceivableEl) amountReceivableEl.textContent = Math.round(total);
        
        this.updateSalePaymentTotal();
    },

    /**
     * Update sale running total display
     */
    updateSaleRunningTotal() {
        const totalQty = saleItems.reduce((sum, item) => sum + item.qty, 0);
        const packetCount = saleItems.length;
        
        const runningTotalEl = document.getElementById('saleRunningTotal');
        const packetCountEl = document.getElementById('salePacketCount');
        
        if (runningTotalEl) runningTotalEl.textContent = totalQty.toFixed(1);
        if (packetCountEl) packetCountEl.textContent = packetCount;
    },

    /**
     * Update sale payment total display
     */
    updateSalePaymentTotal() {
        const saleOnline = Helpers.getInputInt('saleOnlinePayment');
        const saleCash = Helpers.getInputInt('saleCashPayment');
        
        const totalReceived = saleOnline + saleCash;
        
        const totalReceivedEl = document.getElementById('totalReceived');
        if (totalReceivedEl) totalReceivedEl.textContent = Math.round(totalReceived);
    },

    /**
     * Fill receivable amount based on payment type
     * @param {'online'|'cash'|'due'} type - Payment type
     */
    fillReceivableAmount(type) {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        const onlineInput = document.getElementById('saleOnlinePayment');
        const cashInput = document.getElementById('saleCashPayment');
        const dueInput = document.getElementById('saleDueAmount');
        const onlineCheckbox = document.getElementById('saleOnlineCheckbox');
        const cashCheckbox = document.getElementById('saleCashCheckbox');
        const dueCheckbox = document.getElementById('saleDueCheckbox');
        
        if (type === 'online' && onlineCheckbox?.checked) {
            if (onlineInput) onlineInput.value = Math.round(total);
            if (cashInput) cashInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (cashCheckbox) cashCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'cash' && cashCheckbox?.checked) {
            if (cashInput) cashInput.value = Math.round(total);
            if (onlineInput) onlineInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'due' && dueCheckbox?.checked) {
            if (dueInput) dueInput.value = Math.round(total);
            if (onlineInput) onlineInput.value = '0';
            if (cashInput) cashInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (cashCheckbox) cashCheckbox.checked = false;
        }
        
        this.updateSalePaymentTotal();
    },

    // -------------------- COMPLETE SALE --------------------

    /**
     * Generate sale bill number
     * @async
     * @returns {Promise<string>} Generated bill number
     */
    async generateBillNumber() {
        return Helpers.generateBillNumber('S', 'retailSales');
    },

    /**
     * Complete the sale
     * @async
     * @returns {Promise<Object>} The saved sale
     */
    async completeSale() {
        // Check if in edit mode
        if (this.billingManager?.editingBillIndex !== undefined) {
            return this.billingManager.saveEditedBill();
        }
        
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }

        // Warn (but don't hard-block) when a sale exceeds recorded stock.
        // An oversell pushes running stock into negative, which the cost-
        // basis logic in calculateStock() handles correctly but which the
        // user almost always wants to know about before saving.
        const shortfalls = computeStockShortfalls(saleItems);
        if (shortfalls.length > 0) {
            const message = formatShortfallMessage(shortfalls);
            const proceed = await UIManager.showModal(message, 'Stock Shortfall', true);
            if (!proceed) {
                return;
            }
        }

        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        const saleOnline = Helpers.getInputInt('saleOnlinePayment');
        const saleCash = Helpers.getInputInt('saleCashPayment');
        const saleDue = Helpers.getInputInt('saleDueAmount');
        const saleCustomer = Helpers.getInputText('saleCustomerName');
        const saleComments = Helpers.getInputText('saleComments');
        const printComments = document.getElementById('salePrintComments')?.checked || false;
        
        if (saleOnline === 0 && saleCash === 0 && saleDue === 0) {
            UIManager.showToast('Please enter at least one payment method (Cash, Online, or Due)');
            return;
        }
        
        const totalPackets = saleItems.reduce((sum, item) => sum + (item.packets || 0), 0);
        
        const billNumber = await Helpers.generateBillNumber('S', 'retailSales');
        
        const sale = {
            id: Helpers.generateId(),
            billNumber,
            items: saleItems,
            total: salesTotal,
            totalPackets: totalPackets,
            onlinePayment: saleOnline,
            cashPayment: saleCash,
            dueAmount: saleDue,
            customerName: saleCustomer,
            comments: saleComments,
            printComments: printComments,
            type: 'retail',
            isPurchase: false,
            date: new Date().toISOString(),
            userId: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            userName: AppState.userName || 'User',
            timestamp: Date.now(),
            payment: {
                online: saleOnline,
                cash: saleCash,
                due: saleDue,
                total: saleOnline + saleCash + saleDue
            }
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.saveRetailSale(sale);
            
            await AuditService.log(AuditService.ACTIONS.CREATE_SALE, {
                billNumber: sale.billNumber,
                total: sale.total,
                customerName: sale.customerName || 'N/A',
                itemCount: sale.items.length,
                source: 'billing-tab'
            });
            
            if (this.billingManager) {
                await this.billingManager.updateItemFrequency(saleItems, 'sale');
            }
            
            // Clear sale
            saleItems = [];
            this.renderSalesBill();
            
            // Reset form
            this.resetForm();
            
            // Delete auto-save
            if (this.billingManager) {
                await this.billingManager.deleteAutoSave();
            }
            
            UIManager.hideLoading();
            UIManager.showToast('Sale completed successfully!');
            UIManager.hapticFeedback('success');
            
            return sale;
            
        } catch (error) {
            UIManager.hideLoading();
            UIManager.showToast('Failed to complete sale: ' + error.message);
            console.error('Complete sale error:', error);
            throw error;
        }
    },

    /**
     * Reset the sale form
     */
    resetForm() {
        const fields = ['saleCustomerName', 'saleOnlinePayment', 'saleCashPayment', 'saleDueAmount', 'saleComments'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        ['saleOnlineCheckbox', 'saleCashCheckbox', 'saleDueCheckbox', 'salePrintComments'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        
        const totalReceivedEl = document.getElementById('totalReceived');
        if (totalReceivedEl) totalReceivedEl.textContent = '0';
    },

    /**
     * Clear the current sale
     */
    clearSale() {
        saleItems = [];
        saleWeights = [];
        this.renderSalesBill();
        this.renderSaleWeights();
        this.resetForm();
        if (this.billingManager) this.billingManager.deleteAutoSave();
    },

    // -------------------- SHARING & PRINTING --------------------

    /**
     * Share sale via WhatsApp
     * @async
     */
    async shareSaleWhatsApp() {
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        const customer = document.getElementById('saleCustomerName')?.value || 'Customer';
        
        let message = `*Sale Bill*\n\n`;
        message += `Customer: ${customer}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;
        message += `*Items:*\n`;
        
        saleItems.forEach(item => {
            message += `${item.name}\n`;
            message += `  Rate: ₹${item.rate.toFixed(2)} × ${item.qty.toFixed(2)}kg = ₹${item.total.toFixed(2)}\n`;
        });
        
        message += `\n*Total: ₹${Math.round(salesTotal)}*`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },

    /**
     * Print and complete sale
     * @async
     */
    async printSale() {
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        try {
            const savedSale = await this.completeSale();
            
            if (!savedSale) {
                return;
            }
            
            await PrinterService.printBill(savedSale);
            
            UIManager.showToast('Sale saved and printed!');
        } catch (error) {
            console.error('Print sale error:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    },

    /**
     * Pick contact for sale
     * @async
     */
    async pickSaleContact() {
        await Helpers.pickContact('saleCustomerName');
    },

    // -------------------- STATE ACCESS --------------------

    /**
     * Get current sale items
     * @returns {Array<Object>} Sale items
     */
    getSaleItems() {
        return saleItems;
    },

    /**
     * Set sale items (for recovery/editing)
     * @param {Array<Object>} items - Items to set
     */
    setSaleItems(items) {
        saleItems = items || [];
    },

    /**
     * Get current sale weights
     * @returns {Array<number>} Sale weights
     */
    getSaleWeights() {
        return saleWeights;
    },

    /**
     * Set sale weights (for recovery/editing)
     * @param {Array<number>} w - Weights to set
     */
    setSaleWeights(w) {
        saleWeights = w || [];
    }
};

export { RetailSaleManager };
