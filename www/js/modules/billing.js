// -------------------- BILLING MODULE --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { PrinterService } from '../services/printer.js';
import { formatCurrency, debounce, generateId } from '../utils/helpers.js';
import { DEFAULT_SETTINGS } from '../utils/constants.js';

// Bill state
let billItems = [];
let saleItems = [];
let weights = [];
let saleWeights = [];

const BillingManager = {
    // -------------------- MODE TOGGLE --------------------
    
    currentMode: 'purchase', // 'purchase' or 'sale'
    
    switchMode(mode, event) {
        const purchaseSection = document.getElementById('purchaseSection');
        const saleSection = document.getElementById('saleSection');
        const purchaseBtn = document.getElementById('purchaseModeBtn');
        const saleBtn = document.getElementById('saleModeBtn');
        
        if (!purchaseSection || !saleSection) return;
        
        // Update button states
        if (event) {
            const buttons = document.querySelectorAll('.filter-btn');
            buttons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.background = '';
                btn.style.borderColor = '';
            });
            event.currentTarget.classList.add('active');
        }
        
        if (mode === 'sale') {
            // Switch to sale mode
            this.currentMode = 'sale';
            purchaseSection.style.display = 'none';
            saleSection.style.display = 'block';
            
            // Style sale button green when active
            if (saleBtn.classList.contains('active')) {
                saleBtn.style.background = '#22c55e';
                saleBtn.style.borderColor = '#22c55e';
            }
            
            // Load sale dropdown
            this.loadSaleItemsDropdown();
        } else {
            // Switch to purchase mode
            this.currentMode = 'purchase';
            saleSection.style.display = 'none';
            purchaseSection.style.display = 'block';
            
            // Purchase button uses default blue when active
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
        console.log('📋 loadSaleItemsDropdown called');
        const select = document.getElementById('saleItem');
        if (!select) {
            console.error('❌ saleItem select not found!');
            return;
        }
        console.log('✅ saleItem select found, loading items...');
        
        select.innerHTML = '';
        
        console.log('📦 Loading items into sale dropdown, count:', AppState.items.length);
        
        AppState.items.forEach((item, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            opt.textContent = displayName;
            select.appendChild(opt);
        });
        
        console.log('✅ Sale dropdown populated with', select.options.length, 'items');
        
        if (AppState.items.length > 0) {
            this.loadSaleRates();
        }
        this.clearSaleWeights();
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
                console.log(`Loading ${item.rates.length} rates for ${item.name}:`, item.rates);
                item.rates.forEach(rate => {
                    const option = document.createElement('option');
                    option.value = rate;
                    rateDatalist.appendChild(option);
                });
                
                // Set first rate as default
                rateInput.value = item.rates[0];
                console.log(`✅ Loaded ${item.rates.length} rate options`);
            } else {
                console.log('No rates found for item:', item);
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
                // Optionally set first sale rate as default (commented out to allow custom entry)
                // rateInput.value = item.saleRates[0];
            } else {
                // No sale rates available, leave datalist empty and input blank
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
                    <td>₹${Math.round(item.total)}</td>
                    <td><button onclick="window.app.billing.deleteBillItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                </tr>
            `;
        }).join('');
        
        // Update totals
        const billTotal = billItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = billItems.reduce((sum, item) => sum + item.weights.length, 0);
        
        if (billTotalSpan) billTotalSpan.textContent = Math.round(billTotal);
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
            grandTotalElement.textContent = Math.round(grandTotal);
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
            totalPaymentElement.textContent = Math.round(totalPaid);
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
            
            // Reset form completely
            if (document.getElementById('customerName')) {
                document.getElementById('customerName').value = '';
            }
            if (document.getElementById('onlinePayment')) {
                document.getElementById('onlinePayment').value = '';
            }
            if (document.getElementById('cashPayment')) {
                document.getElementById('cashPayment').value = '';
            }
            if (document.getElementById('dueAmount')) {
                document.getElementById('dueAmount').value = '';
            }
            if (document.getElementById('manualLaborCharges')) {
                document.getElementById('manualLaborCharges').value = '0';
            }
            if (document.getElementById('billComments')) {
                document.getElementById('billComments').value = '';
            }
            if (document.getElementById('onlineCheckbox')) {
                document.getElementById('onlineCheckbox').checked = false;
            }
            if (document.getElementById('cashCheckbox')) {
                document.getElementById('cashCheckbox').checked = false;
            }
            if (document.getElementById('dueCheckbox')) {
                document.getElementById('dueCheckbox').checked = false;
            }
            
            // Reset totals
            this.updateTotals();
            
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
        UIManager.hapticFeedback();
        
        // If auto-add flag is set and this is the first/only weight, add to bill directly
        if (autoAddToBill && saleWeights.length === 1) {
            await this.addToSalesBill(true);
        }
    },
    
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
                        <button class="weight-chip-remove" onclick="window.app.billing.removeSaleWeight(${i})">×</button>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    removeSaleWeight(index) {
        saleWeights.splice(index, 1);
        this.renderSaleWeights();
        UIManager.hapticFeedback();
    },
    
    clearSaleWeights() {
        saleWeights = [];
        this.renderSaleWeights();
        UIManager.hapticFeedback();
    },
    
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
        
        // Use accumulated weights if available, otherwise fall back to single weight input
        let qty;
        let packets;
        
        if (saleWeights.length > 0) {
            qty = saleWeights.reduce((sum, w) => sum + w, 0);
            packets = saleWeights.length;
        } else {
            const singleWeight = parseFloat(weightInput?.value);
            if (!singleWeight || singleWeight <= 0) {
                UIManager.showToast('Please add weights or enter a quantity');
                return;
            }
            qty = singleWeight;
            packets = 1;
        }
        
        const item = AppState.items[itemIndex];
        if (!item) {
            UIManager.showToast('Item not found');
            return;
        }
        
        const itemName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        // Check stock - stock is keyed by item ID
        const stockItem = AppState.stock?.[item.id] || AppState.stock?.[item.name];
        console.log('Stock check:', { 
            itemId: item.id,
            itemName: item.name,
            stockItem, 
            availableStock: stockItem?.quantity,
            requestedQty: qty
        });
        
        if (!stockItem || stockItem.quantity < qty) {
            const available = stockItem?.quantity || 0;
            UIManager.showToast(`Insufficient stock! Available: ${available}kg`);
            return;
        }
        
        const total = qty * rate;
        
        saleItems.push({
            itemId: item.id,
            name: itemName,
            rate,
            qty,
            packets,
            total,
            timestamp: Date.now()
        });
        
        this.renderSalesBill();
        
        // Clear weights and reset inputs
        saleWeights = [];
        this.renderSaleWeights();
        
        itemSelect.selectedIndex = 0;
        rateInput.value = '';
        if (weightInput) weightInput.value = '';
        
        // Focus back to item selection
        itemSelect.focus();
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${itemName} to sale`);
    },
    
    renderSalesBill() {
        const tbody = document.querySelector('#saleTable tbody');
        const totalSalePacketsSpan = document.getElementById('totalSalePacketsInBill');
        const saleTotalSpan = document.getElementById('saleTotal');
        
        if (!tbody) return;
        
        if (saleItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No items in bill</td></tr>';
            if (saleTotalSpan) saleTotalSpan.textContent = '0';
            if (totalSalePacketsSpan) totalSalePacketsSpan.textContent = '0';
            this.updateSaleTotals();
            this.updateSaleRunningTotal();
            return;
        }
        
        tbody.innerHTML = saleItems.map((item, index) => `
            <tr>
                <td>${item.name}</td>
                <td>₹${item.rate.toFixed(2)}</td>
                <td>${item.qty.toFixed(1)} kg</td>
                <td>₹${Math.round(item.total)}</td>
                <td><button onclick="window.app.billing.removeSaleItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
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
        
        if (saleTotalEl) saleTotalEl.textContent = Math.round(total);
        if (amountReceivableEl) amountReceivableEl.textContent = Math.round(total);
        
        this.updateSalePaymentTotal();
    },

    updateSaleRunningTotal() {
        const totalQty = saleItems.reduce((sum, item) => sum + item.qty, 0);
        const packetCount = saleItems.length;
        
        const runningTotalEl = document.getElementById('saleRunningTotal');
        const packetCountEl = document.getElementById('salePacketCount');
        
        if (runningTotalEl) runningTotalEl.textContent = totalQty.toFixed(1);
        if (packetCountEl) packetCountEl.textContent = packetCount;
    },
    
    updateSalePaymentTotal() {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
        const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
        
        const totalReceived = saleOnline + saleCash;
        
        const totalReceivedEl = document.getElementById('totalReceived');
        
        if (totalReceivedEl) totalReceivedEl.textContent = Math.round(totalReceived);
        // Don't auto-populate due amount - user enters manually (parity with purchase)
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
    
    fillSalePayableAmount(type) {
        const salesTotal = parseFloat(document.getElementById('salesBillTotal')?.textContent || 0);
        const onlineInput = document.getElementById('saleOnlinePayment');
        const cashInput = document.getElementById('saleCashPayment');
        
        if (type === 'online' && onlineInput) {
            onlineInput.value = Math.round(salesTotal);
            if (cashInput) cashInput.value = '0';
        } else if (type === 'cash' && cashInput) {
            cashInput.value = Math.round(salesTotal);
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
            userId: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            userName: AppState.userName || 'User',
            timestamp: Date.now()
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.saveSale(sale);
            
            // Stock will be automatically recalculated from sales
            
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
            // Reset total received display
            if (document.getElementById('totalReceived')) {
                document.getElementById('totalReceived').textContent = '0';
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
        
        message += `\n*Purchase Total: ₹${Math.round(total)}*\n`;
        if (laborCharges > 0) {
            message += `Labor Charges: ₹${Math.round(laborCharges)}\n`;
            message += `*Total Payable: ₹${Math.round(grandTotal)}*`;
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
        
        message += `\n*Total: ₹${Math.round(salesTotal)}*`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },
    
    async printSale() {
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        // Collect sale data before saving
        const saleTotal = parseFloat(document.getElementById('saleTotal')?.textContent || 0);
        const totalPackets = parseInt(document.getElementById('totalSalePacketsInBill')?.textContent || 0);
        
        const saleData = {
            items: saleItems.map(item => ({
                name: item.name,
                rate: item.rate,
                qty: item.qty,
                total: item.total,
                weights: item.weights || [item.qty]
            })),
            billTotal: saleTotal,
            amountPayable: saleTotal,
            totalPackets: totalPackets,
            customerName: document.getElementById('saleCustomerName')?.value || '',
            isPurchase: false,
            laborCharges: 0,
            date: new Date().toISOString()
        };
        
        try {
            // Save the sale
            await this.completeSale();
            
            // Print the sale data we collected
            await PrinterService.printBill(saleData);
            
            UIManager.showToast('Sale saved and printed!');
        } catch (error) {
            console.error('Print error:', error);
            UIManager.showToast('Error: ' + error.message);
        }
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
    },
    
    getSaleWeights() {
        return saleWeights;
    }
};

export { BillingManager };
