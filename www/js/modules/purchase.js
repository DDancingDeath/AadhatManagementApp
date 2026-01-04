/**
 * @fileoverview Purchase module for managing purchase transactions
 * Handles purchase bill creation, weight tracking, and saving
 * @module modules/purchase
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { AuditService } from '../services/audit.js';
import { Helpers } from '../utils/helpers.js';

/**
 * @type {Array<Object>} Current bill items for purchase mode
 * @private
 */
let billItems = [];

/**
 * @type {Array<number>} Weight entries for purchase mode
 * @private
 */
let weights = [];

/**
 * Purchase Manager - Handles all purchase operations
 * @namespace PurchaseManager
 */
const PurchaseManager = {
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
    async addWeight(autoAddToBill = false) {
        const weightInput = document.getElementById('newWeight');
        const weight = parseFloat(weightInput?.value);
        
        if (!weight || weight <= 0) {
            UIManager.showToast('Please enter a valid weight');
            return;
        }
        
        weights.push(weight);
        weightInput.value = '';
        weightInput.focus();
        
        this.renderWeights();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
        
        if (autoAddToBill && weights.length === 1) {
            await this.addToBill(true);
        }
    },

    /**
     * Render the weights display
     */
    renderWeights() {
        const container = document.getElementById('weightsDisplay');
        if (!container) return;
        
        const totalWeightsSpan = document.getElementById('totalWeights');
        const totalPacketsSpan = document.getElementById('totalPackets');
        
        if (weights.length === 0) {
            container.innerHTML = '';
            if (totalWeightsSpan) totalWeightsSpan.textContent = '0';
            if (totalPacketsSpan) totalPacketsSpan.textContent = '0';
            return;
        }
        
        const total = weights.reduce((sum, w) => sum + w, 0);
        
        if (totalWeightsSpan) totalWeightsSpan.textContent = total.toFixed(1);
        if (totalPacketsSpan) totalPacketsSpan.textContent = weights.length;
        
        container.innerHTML = `
            <div class="weights-compact-list">
                ${weights.map((w, i) => `
                    <div class="weight-chip">
                        <span>${w.toFixed(1)}</span>
                        <button class="weight-chip-remove" onclick="window.app.purchase.removeWeight(${i})">×</button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Remove a weight by index
     * @param {number} index - Index of weight to remove
     */
    removeWeight(index) {
        weights.splice(index, 1);
        this.renderWeights();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
    },

    /**
     * Clear all weights
     */
    clearWeights() {
        weights = [];
        this.renderWeights();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
    },

    // -------------------- BILL MANAGEMENT --------------------

    /**
     * Add current item to bill
     * @async
     * @param {boolean} autoAdd - Whether this is an auto-add
     */
    async addToBill(autoAdd = false) {
        const itemSelect = document.getElementById('billItem');
        const rateInput = document.getElementById('billRate');
        const weightInput = document.getElementById('newWeight');
        
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
        
        // If there's a weight typed in the input but not added, add it first
        const pendingWeight = parseFloat(weightInput?.value);
        if (pendingWeight && pendingWeight > 0) {
            weights.push(pendingWeight);
            weightInput.value = '';
            this.renderWeights();
        }
        
        if (weights.length === 0) {
            UIManager.showToast('Please add at least one weight');
            return;
        }
        
        const item = AppState.items[itemIndex];
        if (!item) {
            UIManager.showToast('Item not found');
            return;
        }
        
        const qty = weights.reduce((sum, w) => sum + w, 0);
        const total = Math.round(qty * rate);
        
        const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        billItems.push({
            itemId: item.id,
            name: displayName,
            rate,
            qty,
            total,
            weights: [...weights],
            timestamp: Date.now()
        });
        
        // Clear inputs
        weights = [];
        this.renderWeights();
        this.renderBill();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        
        // Reset form
        const newWeightInput = document.getElementById('newWeight');
        if (newWeightInput) {
            newWeightInput.value = '';
            newWeightInput.focus();
        }
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${displayName} to bill`);
    },

    /**
     * Render the bill table
     */
    renderBill() {
        const tbody = document.querySelector('#billTable tbody');
        const weightBreakdownSection = document.getElementById('weightBreakdownSection');
        if (!tbody) return;
        
        const totalPacketsInBillSpan = document.getElementById('totalPacketsInBill');
        const billTotalSpan = document.getElementById('billTotal');
        
        if (billItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No items in bill</td></tr>';
            if (billTotalSpan) billTotalSpan.textContent = '0';
            if (totalPacketsInBillSpan) totalPacketsInBillSpan.textContent = '0';
            if (weightBreakdownSection) weightBreakdownSection.innerHTML = '';
            this.updateTotals();
            return;
        }
        
        // Render weight breakdown for items with 2 or more packets
        if (weightBreakdownSection) {
            const itemsWithMultipleWeights = billItems.filter(item => item.weights.length >= 2);
            
            if (itemsWithMultipleWeights.length > 0) {
                weightBreakdownSection.innerHTML = itemsWithMultipleWeights.map(item => {
                    const weightsPerLine = 6;
                    const weightLines = [];
                    for (let i = 0; i < item.weights.length; i += weightsPerLine) {
                        const lineWeights = item.weights.slice(i, i + weightsPerLine);
                        weightLines.push(lineWeights.map(w => parseFloat(w).toFixed(1)).join('&nbsp;&nbsp;'));
                    }
                    
                    return `
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #007bff;">
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
                weightBreakdownSection.innerHTML = '';
            }
        }
        
        // Render bill items table
        tbody.innerHTML = billItems.map((item, index) => {
            return `
                <tr style="cursor: pointer;" onclick="window.app.purchase.editBillItem(${index})">
                    <td>${item.name}</td>
                    <td>₹${item.rate.toFixed(2)}</td>
                    <td>${item.qty.toFixed(1)} kg</td>
                    <td>₹${Math.round(item.total)}</td>
                    <td><button onclick="event.stopPropagation(); window.app.purchase.deleteBillItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                </tr>
            `;
        }).join('');
        
        // Update totals
        const billTotal = billItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = billItems.reduce((sum, item) => sum + item.weights.length, 0);
        
        // Calculate heavy packets
        const heavyWeightThreshold = AppState.settings?.heavyWeightThreshold || 30;
        const totalHeavyPackets = billItems.reduce((sum, item) => {
            const heavyCount = item.weights.filter(w => w > heavyWeightThreshold).length;
            return sum + heavyCount;
        }, 0);
        
        if (billTotalSpan) billTotalSpan.textContent = Math.round(billTotal);
        if (totalPacketsInBillSpan) totalPacketsInBillSpan.textContent = totalPackets;
        
        // Don't clear manually set flag when in edit mode
        const laborChargesInput = document.getElementById('manualLaborCharges');
        if (laborChargesInput && this.billingManager?.editingBillIndex === undefined) {
            delete laborChargesInput.dataset.manuallySet;
        }
        
        this.updateTotals(totalHeavyPackets);
    },

    /**
     * Delete a bill item by index
     * @param {number} index - Index of item to delete
     */
    deleteBillItem(index) {
        billItems.splice(index, 1);
        this.renderBill();
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
    },

    /**
     * Edit a bill item
     * @param {number} index - Index of item to edit
     */
    editBillItem(index) {
        const currentItem = Helpers.getInputText('billItem');
        const currentRate = Helpers.getInputNumber('billRate');
        
        if (currentItem && currentRate && weights.length > 0) {
            this.addToBill(true);
        }
        
        const item = billItems[index];
        if (!item) return;
        
        billItems.splice(index, 1);
        this.renderBill();
        
        const itemIndex = AppState.items.findIndex(i => i.id === item.itemId || i.name === item.name);
        if (itemIndex !== -1) {
            document.getElementById('billItem').value = itemIndex;
            if (this.billingManager) this.billingManager.loadRates();
            
            setTimeout(() => {
                document.getElementById('billRate').value = item.rate;
            }, 50);
        }
        
        weights = item.weights || [];
        this.renderWeights();
        
        if (this.billingManager) this.billingManager.triggerAutoSave();
        UIManager.hapticFeedback();
        UIManager.showToast('Item loaded for editing');
    },

    // -------------------- TOTALS --------------------

    /**
     * Update totals display
     * @param {number} heavyPacketsCount - Number of heavy packets for labor calculation
     */
    updateTotals(heavyPacketsCount = 0) {
        const billTotal = Helpers.getElementInt('billTotal');
        const autoLaborCheckbox = document.getElementById('autoLaborCharge');
        const laborCalculationSpan = document.getElementById('laborCalculation');
        const laborChargesInput = document.getElementById('manualLaborCharges');
        
        let laborCharges = 0;
        if (autoLaborCheckbox?.checked) {
            const laborRate = AppState.settings?.laborRate || 6;
            const autoCalculatedLabor = laborRate * heavyPacketsCount;
            
            if (laborChargesInput && !laborChargesInput.dataset.manuallySet && this.billingManager?.editingBillIndex === undefined) {
                laborChargesInput.value = autoCalculatedLabor.toFixed(0);
            }
            
            if (laborChargesInput) {
                laborChargesInput.disabled = false;
                laborChargesInput.style.opacity = '1';
                laborChargesInput.style.cursor = 'text';
            }
            if (laborCalculationSpan) {
                laborCalculationSpan.textContent = `${laborRate} × ${heavyPacketsCount}`;
            }
            
            laborCharges = parseFloat(laborChargesInput?.value || 0);
        } else {
            if (laborChargesInput) {
                laborChargesInput.value = '0';
                laborChargesInput.disabled = true;
                laborChargesInput.style.opacity = '0.5';
                laborChargesInput.style.cursor = 'not-allowed';
            }
            if (laborCalculationSpan) {
                laborCalculationSpan.textContent = '';
            }
            laborCharges = 0;
        }
        
        const grandTotal = billTotal - laborCharges;
        
        const grandTotalElement = document.getElementById('amountPayable');
        if (grandTotalElement) {
            grandTotalElement.textContent = Math.round(grandTotal);
        }
        
        this.updatePaymentTotal();
    },

    /**
     * Update payment total display
     */
    updatePaymentTotal() {
        const onlinePayment = Helpers.getInputInt('onlinePayment');
        const cashPayment = Helpers.getInputInt('cashPayment');
        
        const totalPaid = onlinePayment + cashPayment;
        
        const totalPaymentElement = document.getElementById('totalPayment');
        if (totalPaymentElement) {
            totalPaymentElement.textContent = Math.round(totalPaid);
        }
    },

    /**
     * Fill payable amount based on payment type
     * @param {'online'|'cash'|'due'} type - Payment type
     */
    fillPayableAmount(type) {
        const grandTotal = Helpers.getElementInt('amountPayable');
        const onlineInput = document.getElementById('onlinePayment');
        const cashInput = document.getElementById('cashPayment');
        const dueInput = document.getElementById('dueAmount');
        const onlineCheckbox = document.getElementById('onlineCheckbox');
        const cashCheckbox = document.getElementById('cashCheckbox');
        const dueCheckbox = document.getElementById('dueCheckbox');
        
        if (type === 'online' && onlineCheckbox?.checked) {
            if (onlineInput) onlineInput.value = Math.round(grandTotal);
            if (cashInput) cashInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (cashCheckbox) cashCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'cash' && cashCheckbox?.checked) {
            if (cashInput) cashInput.value = Math.round(grandTotal);
            if (onlineInput) onlineInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'due' && dueCheckbox?.checked) {
            if (dueInput) dueInput.value = Math.round(grandTotal);
            if (onlineInput) onlineInput.value = '0';
            if (cashInput) cashInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (cashCheckbox) cashCheckbox.checked = false;
        }
        
        this.updatePaymentTotal();
    },

    // -------------------- SAVE PURCHASE --------------------

    /**
     * Generate bill number
     * @async
     * @returns {Promise<string>} Generated bill number
     */
    async generateBillNumber() {
        const prefix = 'P';
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        
        try {
            const snapshot = await db.collection('purchases')
                .where('timestamp', '>=', todayStart.getTime())
                .where('timestamp', '<', todayEnd.getTime())
                .get();
            
            const nextNum = snapshot.size + 1;
            return `${prefix}${dateStr}-${String(nextNum).padStart(3, '0')}`;
        } catch (error) {
            console.error('Error generating bill number:', error);
            return `${prefix}${dateStr}-${Date.now().toString().slice(-3)}`;
        }
    },

    /**
     * Save bill to history
     * @async
     * @returns {Promise<Object>} The saved bill
     */
    async saveBillToHistory() {
        // Check if in edit mode
        if (this.billingManager?.editingBillIndex !== undefined) {
            return this.billingManager.saveEditedBill();
        }
        
        if (billItems.length === 0) {
            UIManager.showToast('No items in bill');
            return;
        }
        
        const billTotal = Helpers.getElementInt('billTotal');
        const laborCharges = Helpers.getInputInt('manualLaborCharges');
        const totalPackets = Helpers.getElementInt('totalPacketsInBill');
        const grandTotal = Helpers.getElementInt('amountPayable');
        const onlinePayment = Helpers.getInputInt('onlinePayment');
        const cashPayment = Helpers.getInputInt('cashPayment');
        const dueAmount = Helpers.getInputInt('dueAmount');
        const customerName = Helpers.getInputText('customerName');
        const comments = Helpers.getInputText('billComments');
        
        if (onlinePayment === 0 && cashPayment === 0 && dueAmount === 0) {
            UIManager.showToast('Please enter at least one payment method (Cash, Online, or Due)');
            return;
        }
        
        const autoLaborCheckbox = document.getElementById('autoLaborCharge');
        const laborChargesInput = document.getElementById('manualLaborCharges');
        const laborCalculationSpan = document.getElementById('laborCalculation');
        const laborCalc = (autoLaborCheckbox?.checked && !laborChargesInput?.dataset.manuallySet) 
            ? laborCalculationSpan?.textContent || null 
            : null;
        
        const billNumber = await this.generateBillNumber();
        
        const bill = {
            id: Helpers.generateId(),
            billNumber,
            items: billItems,
            billTotal,
            laborCharges,
            laborCalc,
            totalPackets,
            grandTotal,
            amountPayable: grandTotal,
            onlinePayment,
            cashPayment,
            dueAmount,
            customerName,
            comments,
            type: 'purchase',
            isPurchase: true,
            date: new Date().toISOString(),
            userId: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            timestamp: Date.now(),
            payment: {
                online: onlinePayment,
                cash: cashPayment,
                due: dueAmount,
                total: onlinePayment + cashPayment + dueAmount
            }
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.savePurchase(bill);
            
            await AuditService.log(AuditService.ACTIONS.CREATE_BILL, {
                billNumber: bill.billNumber,
                total: bill.billTotal,
                customerName: bill.customerName || 'N/A',
                itemCount: bill.items.length
            });
            
            if (this.billingManager) {
                await this.billingManager.updateItemFrequency(billItems, 'purchase');
            }
            
            // Clear bill
            billItems = [];
            weights = [];
            this.renderBill();
            this.renderWeights();
            
            // Reset form
            this.resetForm();
            
            // Delete auto-save
            if (this.billingManager) {
                await this.billingManager.deleteAutoSave();
            }
            
            UIManager.hideLoading();
            UIManager.showToast('Bill saved successfully!');
            UIManager.hapticFeedback('success');
            
            return bill;
            
        } catch (error) {
            UIManager.hideLoading();
            UIManager.showToast('Failed to save bill: ' + error.message);
            console.error('Save bill error:', error);
            throw error;
        }
    },

    /**
     * Reset the purchase form
     */
    resetForm() {
        const fields = ['customerName', 'onlinePayment', 'cashPayment', 'dueAmount', 'manualLaborCharges', 'billComments'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = id === 'manualLaborCharges' ? '0' : '';
        });
        
        ['onlineCheckbox', 'cashCheckbox', 'dueCheckbox'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        
        this.updateTotals();
    },

    /**
     * Clear the current bill
     */
    clearBill() {
        billItems = [];
        weights = [];
        this.renderBill();
        this.renderWeights();
        this.resetForm();
        if (this.billingManager) this.billingManager.deleteAutoSave();
    },

    // -------------------- SHARING --------------------

    /**
     * Share bill via WhatsApp
     * @async
     */
    async shareWhatsApp() {
        if (billItems.length === 0) {
            UIManager.showToast('No items in bill');
            return;
        }
        
        const total = billItems.reduce((sum, item) => sum + item.total, 0);
        const laborCharges = Helpers.getInputInt('manualLaborCharges');
        const grandTotal = total - laborCharges;
        const customer = Helpers.getInputText('customerName') || 'Customer';
        
        let message = `*Purchase Bill*\n\n`;
        message += `Customer: ${customer}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;
        message += `*Items:*\n`;
        
        billItems.forEach(item => {
            message += `${item.name}\n`;
            message += `  Rate: ₹${item.rate.toFixed(2)} × ${item.qty.toFixed(2)}kg = ₹${item.total.toFixed(2)}\n`;
        });
        
        message += `\n*Purchase Total: ₹${Math.round(total)}*\n`;
        if (laborCharges > 0) {
            message += `Labor Charges: ₹${Math.round(laborCharges)}\n`;
            message += `*Total Payable: ₹${Math.round(grandTotal)}*`;
        }
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },

    // -------------------- STATE ACCESS --------------------

    /**
     * Get current bill items
     * @returns {Array<Object>} Bill items
     */
    getBillItems() {
        return billItems;
    },

    /**
     * Set bill items (for recovery/editing)
     * @param {Array<Object>} items - Items to set
     */
    setBillItems(items) {
        billItems = items || [];
    },

    /**
     * Get current weights
     * @returns {Array<number>} Weights
     */
    getWeights() {
        return weights;
    },

    /**
     * Set weights (for recovery/editing)
     * @param {Array<number>} w - Weights to set
     */
    setWeights(w) {
        weights = w || [];
    }
};

export { PurchaseManager };
