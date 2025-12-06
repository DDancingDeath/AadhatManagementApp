// -------------------- BILLING MODULE --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { formatCurrency, debounce, generateId } from '../utils/helpers.js';
import { DEFAULT_SETTINGS } from '../utils/constants.js';

// Bill state
let billItems = [];
let saleItems = [];
let weights = [];

const BillingManager = {
    // -------------------- MODE TOGGLE --------------------
    
    currentMode: 'purchase', // 'purchase' or 'sale'
    
    toggleMode() {
        const purchaseSection = document.getElementById('purchaseSection');
        const saleSection = document.getElementById('saleSection');
        const title = document.getElementById('billingTitle');
        const toggleBtn = document.getElementById('modeToggleBtn');
        
        if (!purchaseSection || !saleSection) return;
        
        if (this.currentMode === 'purchase') {
            // Switch to sale mode
            this.currentMode = 'sale';
            purchaseSection.style.display = 'none';
            saleSection.style.display = 'block';
            title.textContent = 'Sale Entry';
            toggleBtn.innerHTML = '📦 Switch to Purchase';
            
            // Load sale dropdown
            this.loadSaleItemsDropdown();
        } else {
            // Switch to purchase mode
            this.currentMode = 'purchase';
            saleSection.style.display = 'none';
            purchaseSection.style.display = 'block';
            title.textContent = 'Purchase Entry';
            toggleBtn.innerHTML = '💰 Switch to Sale';
        }
        
        UIManager.hapticFeedback();
    },
    
    // -------------------- ITEMS & RATES LOADING --------------------
    
    loadItemsDropdown() {
        const select = document.getElementById('billItem');
        if (!select) return;
        
        select.innerHTML = '';
        
        AppState.items.forEach((item, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            opt.textContent = displayName;
            select.appendChild(opt);
        });
        
        if (AppState.items.length > 0) {
            this.loadRates();
        }
        this.clearWeights();
    },
    
    loadSaleItemsDropdown() {
        const select = document.getElementById('saleItem');
        if (!select) return;
        
        select.innerHTML = '';
        
        AppState.items.forEach((item, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            opt.textContent = displayName;
            select.appendChild(opt);
        });
        
        if (AppState.items.length > 0) {
            this.loadSaleRates();
        }
    },
    
    loadRates() {
        const itemIndex = document.getElementById('billItem')?.value;
        const rateInput = document.getElementById('billRate');
        const rateDatalist = document.getElementById('rateOptions');
        
        if (!rateInput || !rateDatalist) return;
        
        rateDatalist.innerHTML = '';
        rateInput.value = '';
        rateInput.placeholder = 'Select or enter rate';
        
        if (itemIndex !== undefined && itemIndex !== '') {
            const item = AppState.items[parseInt(itemIndex)];
            if (item && item.rates && item.rates.length > 0) {
                item.rates.forEach(rate => {
                    const option = document.createElement('option');
                    option.value = rate;
                    rateDatalist.appendChild(option);
                });
                
                // Set first rate as default
                rateInput.value = item.rates[0];
            }
        }
    },
    
    loadSaleRates() {
        const itemIndex = document.getElementById('saleItem')?.value;
        const rateInput = document.getElementById('saleRate');
        const rateDatalist = document.getElementById('saleRateOptions');
        
        if (!rateInput || !rateDatalist) return;
        
        rateDatalist.innerHTML = '';
        rateInput.value = '';
        rateInput.placeholder = 'Select or enter rate';
        
        if (itemIndex !== undefined && itemIndex !== '') {
            const item = AppState.items[parseInt(itemIndex)];
            if (item && item.saleRates && item.saleRates.length > 0) {
                item.saleRates.forEach(rate => {
                    const option = document.createElement('option');
                    option.value = rate;
                    rateDatalist.appendChild(option);
                });
                
                // Set first sale rate as default
                rateInput.value = item.saleRates[0];
            } else if (item && item.rates && item.rates.length > 0) {
                // Fallback to purchase rates if no sale rates
                item.rates.forEach(rate => {
                    const option = document.createElement('option');
                    option.value = rate;
                    rateDatalist.appendChild(option);
                });
                rateInput.value = item.rates[0];
            }
        }
    },
    
    // -------------------- WEIGHT MANAGEMENT --------------------
    
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
        UIManager.hapticFeedback();
        
        // If auto-add flag is set and this is the first/only weight, add to bill directly
        if (autoAddToBill && weights.length === 1) {
            await this.addToBill(true);
        }
    },
    
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
                        <button class="weight-chip-remove" onclick="window.app.billing.removeWeight(${i})">×</button>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    removeWeight(index) {
        weights.splice(index, 1);
        this.renderWeights();
        UIManager.hapticFeedback();
    },
    
    clearWeights() {
        weights = [];
        this.renderWeights();
        UIManager.hapticFeedback();
    },
    
    // -------------------- PURCHASE BILL MANAGEMENT --------------------
    
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
        const total = qty * rate;
        
        const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        billItems.push({
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
        
        // Reset form
        const newWeightInput = document.getElementById('newWeight');
        if (newWeightInput) {
            newWeightInput.value = '';
            newWeightInput.focus();
        }
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${displayName} to bill`);
    },
    
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
                        weightLines.push(lineWeights.map(w => w.toFixed(1)).join(' '));
                    }
                    
                    return `
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #007bff;">
                            <div style="font-weight: 600; margin-bottom: 8px; color: #333;">
                                ${item.name} (${item.weights.length} packets, ${item.qty.toFixed(1)} kg)
                            </div>
                            <div style="font-family: monospace; font-size: 13px; line-height: 1.6; color: #555;">
                                ${weightLines.join('<br>')}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                weightBreakdownSection.innerHTML = '';
            }
        }
        
        // Render bill items table (without weight breakdown in rows)
        tbody.innerHTML = billItems.map((item, index) => {
            return `
                <tr>
                    <td>${item.name}</td>
                    <td>₹${item.rate.toFixed(2)}</td>
                    <td>${item.qty.toFixed(1)} kg</td>
                    <td>₹${item.total.toFixed(2)}</td>
                    <td><button onclick="window.app.billing.deleteBillItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                </tr>
            `;
        }).join('');
        
        // Update totals
        const billTotal = billItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = billItems.reduce((sum, item) => sum + item.weights.length, 0);
        
        if (billTotalSpan) billTotalSpan.textContent = billTotal.toFixed(2);
        if (totalPacketsInBillSpan) totalPacketsInBillSpan.textContent = totalPackets;
        
        this.updateTotals();
    },
    
    deleteBillItem(index) {
        billItems.splice(index, 1);
        this.renderBill();
        UIManager.hapticFeedback();
    },
    
    updateTotals() {
        const billTotal = parseFloat(document.getElementById('billTotal')?.textContent || 0);
        const totalPackets = parseInt(document.getElementById('totalPacketsInBill')?.textContent || 0);
        const autoLaborCheckbox = document.getElementById('autoLaborCharge');
        const laborCalculationSpan = document.getElementById('laborCalculation');
        const laborChargesInput = document.getElementById('manualLaborCharges');
        
        // Calculate labor charges if auto-labor is enabled
        let laborCharges = 0;
        if (autoLaborCheckbox?.checked) {
            const laborRate = 6; // Default labor rate
            laborCharges = laborRate * totalPackets;
            if (laborChargesInput) {
                laborChargesInput.value = laborCharges.toFixed(0);
                laborChargesInput.disabled = false;
            }
            if (laborCalculationSpan) {
                laborCalculationSpan.textContent = `${laborRate} × ${totalPackets}`;
            }
        } else {
            if (laborChargesInput) {
                laborChargesInput.value = '0';
                laborChargesInput.disabled = true;
            }
            if (laborCalculationSpan) {
                laborCalculationSpan.textContent = '';
            }
        }
        
        // Calculate grand total (subtract labor charges for purchase if checkbox is checked)
        if (autoLaborCheckbox?.checked) {
            laborCharges = parseFloat(laborChargesInput?.value || 0);
        }
        const grandTotal = billTotal - laborCharges;
        
        const grandTotalElement = document.getElementById('amountPayable');
        if (grandTotalElement) {
            grandTotalElement.textContent = grandTotal.toFixed(2);
        }
        
        this.updatePaymentTotal();
    },
    
    updatePaymentTotal() {
        const grandTotal = parseFloat(document.getElementById('amountPayable')?.textContent || 0);
        const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
        
        // Total paid should only include online and cash, not due
        const totalPaid = onlinePayment + cashPayment;
        
        const totalPaymentElement = document.getElementById('totalPayment');
        if (totalPaymentElement) {
            totalPaymentElement.textContent = totalPaid.toFixed(2);
        }
    },
    
    fillPayableAmount(type) {
        const grandTotal = parseFloat(document.getElementById('amountPayable')?.textContent || 0);
        const onlineInput = document.getElementById('onlinePayment');
        const cashInput = document.getElementById('cashPayment');
        const dueInput = document.getElementById('dueAmount');
        const onlineCheckbox = document.getElementById('onlineCheckbox');
        const cashCheckbox = document.getElementById('cashCheckbox');
        const dueCheckbox = document.getElementById('dueCheckbox');
        
        if (type === 'online' && onlineCheckbox?.checked) {
            if (onlineInput) onlineInput.value = grandTotal.toFixed(2);
            if (cashInput) cashInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (cashCheckbox) cashCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'cash' && cashCheckbox?.checked) {
            if (cashInput) cashInput.value = grandTotal.toFixed(2);
            if (onlineInput) onlineInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'due' && dueCheckbox?.checked) {
            if (dueInput) dueInput.value = grandTotal.toFixed(2);
            if (onlineInput) onlineInput.value = '0';
            if (cashInput) cashInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (cashCheckbox) cashCheckbox.checked = false;
        }
        
        this.updatePaymentTotal();
    },
    
    // -------------------- SAVE & PRINT --------------------
    
    async saveBillToHistory() {
        if (billItems.length === 0) {
            UIManager.showToast('No items in bill');
            return;
        }
        
        const billTotal = parseFloat(document.getElementById('billTotal').textContent);
        const laborCharges = parseFloat(document.getElementById('manualLaborCharges')?.value || 0);
        const totalPackets = parseInt(document.getElementById('totalPacketsInBill').textContent);
        const grandTotal = parseFloat(document.getElementById('amountPayable').textContent);
        const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
        const dueAmount = parseFloat(document.getElementById('dueAmount')?.value || 0);
        const customerName = document.getElementById('customerName')?.value || '';
        const comments = document.getElementById('billComments')?.value || '';
        
        // Get labor calculation string if auto-labor was used
        const laborCalculationSpan = document.getElementById('laborCalculation');
        const laborCalc = laborCalculationSpan?.textContent || null;
        
        const bill = {
            id: generateId(),
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
            isPurchase: true,
            date: new Date().toISOString(),
            userId: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            timestamp: Date.now()
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.saveBill(bill);
            
            // Clear bill
            billItems = [];
            weights = [];
            this.renderBill();
            this.renderWeights();
            
            // Reset form
            if (document.getElementById('customerName')) {
                document.getElementById('customerName').value = '';
            }
            if (document.getElementById('onlinePayment')) {
                document.getElementById('onlinePayment').value = '0';
            }
            if (document.getElementById('cashPayment')) {
                document.getElementById('cashPayment').value = '0';
            }
            if (document.getElementById('laborCharges')) {
                document.getElementById('laborCharges').value = '0';
            }
            
            UIManager.hideLoading();
            UIManager.showToast('Bill saved successfully!');
            UIManager.hapticFeedback('success');
            
        } catch (error) {
            UIManager.hideLoading();
            UIManager.showToast('Failed to save bill: ' + error.message);
            console.error('Save bill error:', error);
        }
    },
    
    // -------------------- SALES BILL MANAGEMENT --------------------
    
    async addToSalesBill() {
        const itemSelect = document.getElementById('saleItem');
        const rateInput = document.getElementById('saleRate');
        const weightInput = document.getElementById('saleWeight');
        
        if (!itemSelect || !rateInput || !weightInput) return;
        
        const itemIndex = parseInt(itemSelect.value);
        const rate = parseFloat(rateInput.value);
        const qty = parseFloat(weightInput.value);
        
        if (itemIndex === undefined || itemIndex === '' || isNaN(itemIndex)) {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        if (!qty || qty <= 0) {
            UIManager.showToast('Please enter a valid quantity');
            return;
        }
        
        const item = AppState.items[itemIndex];
        if (!item) {
            UIManager.showToast('Item not found');
            return;
        }
        
        const itemName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        // Check stock
        const stock = AppState.database.stock?.find(s => s.itemName === item.name);
        if (!stock || stock.quantity < qty) {
            const available = stock?.quantity || 0;
            UIManager.showToast(`Insufficient stock! Available: ${available}kg`);
            return;
        }
        
        const total = qty * rate;
        
        saleItems.push({
            name: itemName,
            rate,
            qty,
            total,
            timestamp: Date.now()
        });
        
        this.renderSalesBill();
        
        // Reset inputs
        weightInput.value = '';
        weightInput.focus();
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${itemName} to sale`);
    },
    
    renderSalesBill() {
        const tbody = document.querySelector('#saleTable tbody');
        if (!tbody) return;
        
        if (saleItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No items added</td></tr>';
            this.updateSaleTotals();
            return;
        }
        
        tbody.innerHTML = saleItems.map((item, index) => `
            <tr>
                <td>${item.name}</td>
                <td>₹${item.rate.toFixed(2)}</td>
                <td>${item.qty.toFixed(2)} kg</td>
                <td>₹${item.total.toFixed(2)}</td>
                <td>
                    <button class="delete-btn" onclick="window.app.billing.removeSaleItem(${index})" title="Remove">🗑️</button>
                </td>
            </tr>
        `).join('');
        
        this.updateSaleTotals();
        
        // Update total
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        document.getElementById('salesBillTotal').textContent = salesTotal.toFixed(2);
        
        this.updateSalePaymentTotal();
    },
    
    removeSalesItem(index) {
        saleItems.splice(index, 1);
        this.renderSalesBill();
        this.updateSaleTotals();
    },
    
    removeSaleItem(index) {
        saleItems.splice(index, 1);
        this.renderSalesBill();
        UIManager.hapticFeedback();
    },
    
    updateSaleTotals() {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        
        const saleTotalEl = document.getElementById('saleTotal');
        const amountReceivableEl = document.getElementById('amountReceivable');
        
        if (saleTotalEl) saleTotalEl.textContent = total.toFixed(2);
        if (amountReceivableEl) amountReceivableEl.textContent = total.toFixed(2);
        
        this.updateSalePaymentTotal();
    },
    
    updateSalePaymentTotal() {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
        const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
        
        const totalReceived = saleOnline + saleCash;
        const balance = total - totalReceived;
        
        const totalReceivedEl = document.getElementById('totalReceived');
        const saleDueEl = document.getElementById('saleDueAmount');
        
        if (totalReceivedEl) totalReceivedEl.textContent = totalReceived.toFixed(2);
        if (saleDueEl) saleDueEl.value = balance > 0 ? balance.toFixed(2) : 0;
    },
    
    fillReceivableAmount(type) {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        const onlineInput = document.getElementById('saleOnlinePayment');
        const cashInput = document.getElementById('saleCashPayment');
        const dueInput = document.getElementById('saleDueAmount');
        const onlineCheckbox = document.getElementById('saleOnlineCheckbox');
        const cashCheckbox = document.getElementById('saleCashCheckbox');
        const dueCheckbox = document.getElementById('saleDueCheckbox');
        
        if (type === 'online' && onlineCheckbox?.checked) {
            if (onlineInput) onlineInput.value = total.toFixed(2);
            if (cashInput) cashInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (cashCheckbox) cashCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'cash' && cashCheckbox?.checked) {
            if (cashInput) cashInput.value = total.toFixed(2);
            if (onlineInput) onlineInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'due' && dueCheckbox?.checked) {
            if (dueInput) dueInput.value = total.toFixed(2);
            if (onlineInput) onlineInput.value = '0';
            if (cashInput) cashInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (cashCheckbox) cashCheckbox.checked = false;
        }
        
        this.updateSalePaymentTotal();
    },
    
    fillSalePayableAmount(type) {
        const salesTotal = parseFloat(document.getElementById('salesBillTotal')?.textContent || 0);
        const onlineInput = document.getElementById('saleOnlinePayment');
        const cashInput = document.getElementById('saleCashPayment');
        
        if (type === 'online' && onlineInput) {
            onlineInput.value = salesTotal.toFixed(2);
            if (cashInput) cashInput.value = '0';
        } else if (type === 'cash' && cashInput) {
            cashInput.value = salesTotal.toFixed(2);
            if (onlineInput) onlineInput.value = '0';
        }
        
        this.updateSalePaymentTotal();
    },
    
    async completeSale() {
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
        const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
        const saleDue = parseFloat(document.getElementById('saleDueAmount')?.value || 0);
        const saleCustomer = document.getElementById('saleCustomerName')?.value || '';
        const saleComments = document.getElementById('saleComments')?.value || '';
        
        const sale = {
            id: generateId(),
            items: saleItems,
            total: salesTotal,
            onlinePayment: saleOnline,
            cashPayment: saleCash,
            dueAmount: saleDue,
            customerName: saleCustomer,
            comments: saleComments,
            isPurchase: false,
            date: new Date().toISOString(),
            userId: AppState.auth.uid,
            timestamp: Date.now()
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.saveSale(sale);
            
            // Update stock
            for (const item of saleItems) {
                await FirebaseService.reduceStock(item.name, item.qty);
            }
            
            // Clear sale
            saleItems = [];
            this.renderSalesBill();
            
            // Reset form
            if (document.getElementById('saleCustomerName')) {
                document.getElementById('saleCustomerName').value = '';
            }
            if (document.getElementById('saleOnlinePayment')) {
                document.getElementById('saleOnlinePayment').value = '0';
            }
            if (document.getElementById('saleCashPayment')) {
                document.getElementById('saleCashPayment').value = '0';
            }
            if (document.getElementById('saleDueAmount')) {
                document.getElementById('saleDueAmount').value = '0';
            }
            if (document.getElementById('saleComments')) {
                document.getElementById('saleComments').value = '';
            }
            if (document.getElementById('saleOnlineCheckbox')) {
                document.getElementById('saleOnlineCheckbox').checked = false;
            }
            if (document.getElementById('saleCashCheckbox')) {
                document.getElementById('saleCashCheckbox').checked = false;
            }
            if (document.getElementById('saleDueCheckbox')) {
                document.getElementById('saleDueCheckbox').checked = false;
            }
            
            UIManager.hideLoading();
            UIManager.showToast('Sale completed successfully!');
            UIManager.hapticFeedback('success');
            
        } catch (error) {
            UIManager.hideLoading();
            UIManager.showToast('Failed to complete sale: ' + error.message);
            console.error('Complete sale error:', error);
        }
    },
    
    // Contact picker helpers
    async pickContact() {
        try {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
                if (contacts && contacts.length > 0) {
                    const contact = contacts[0];
                    const nameInput = document.getElementById('customerName');
                    if (nameInput && contact.name && contact.name.length > 0) {
                        nameInput.value = contact.name[0];
                    }
                }
            } else {
                UIManager.showToast('Contact picker not supported');
            }
        } catch (error) {
            console.error('Pick contact error:', error);
        }
    },
    
    async pickSaleContact() {
        try {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
                if (contacts && contacts.length > 0) {
                    const contact = contacts[0];
                    const nameInput = document.getElementById('saleCustomerName');
                    if (nameInput && contact.name && contact.name.length > 0) {
                        nameInput.value = contact.name[0];
                    }
                }
            } else {
                UIManager.showToast('Contact picker not supported');
            }
        } catch (error) {
            console.error('Pick contact error:', error);
        }
    },
    
    async shareWhatsApp() {
        if (billItems.length === 0) {
            UIManager.showToast('No items in bill');
            return;
        }
        
        const total = billItems.reduce((sum, item) => sum + item.total, 0);
        const laborCharges = parseFloat(document.getElementById('manualLaborCharges')?.value || 0);
        const grandTotal = total + laborCharges;
        const customer = document.getElementById('customerName')?.value || 'Customer';
        
        let message = `*Purchase Bill*\n\n`;
        message += `Customer: ${customer}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;
        message += `*Items:*\n`;
        
        billItems.forEach(item => {
            message += `${item.name}\n`;
            message += `  Rate: ₹${item.rate.toFixed(2)} × ${item.qty.toFixed(2)}kg = ₹${item.total.toFixed(2)}\n`;
        });
        
        message += `\n*Purchase Total: ₹${total.toFixed(2)}*\n`;
        if (laborCharges > 0) {
            message += `Labor Charges: ₹${laborCharges.toFixed(2)}\n`;
            message += `*Total Payable: ₹${grandTotal.toFixed(2)}*`;
        }
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },
    
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
        
        message += `\n*Total: ₹${salesTotal.toFixed(2)}*`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },
    
    async printSale() {
        UIManager.showToast('Print functionality coming soon');
    },
    
    // Expose state for access
    getBillItems() {
        return billItems;
    },
    
    getSaleItems() {
        return saleItems;
    },
    
    getWeights() {
        return weights;
    }
};

export { BillingManager };
