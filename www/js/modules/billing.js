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
    // -------------------- WEIGHT MANAGEMENT --------------------
    
    async addWeight() {
        const weightInput = document.getElementById('weightInput');
        const weight = parseFloat(weightInput.value);
        
        if (!weight || weight <= 0) {
            UIManager.showToast('Please enter a valid weight');
            return;
        }
        
        weights.push(weight);
        weightInput.value = '';
        weightInput.focus();
        
        this.renderWeights();
        UIManager.hapticFeedback();
    },
    
    renderWeights() {
        const container = document.getElementById('weightsContainer');
        if (!container) return;
        
        if (weights.length === 0) {
            container.innerHTML = '<p class="no-data">No weights added</p>';
            return;
        }
        
        const total = weights.reduce((sum, w) => sum + w, 0);
        
        container.innerHTML = `
            <div class="weights-header">
                <span>Total: ${total.toFixed(2)}kg (${weights.length} packets)</span>
                <button onclick="app.billing.clearWeights()" class="btn-clear">Clear All</button>
            </div>
            <div class="weights-list">
                ${weights.map((w, i) => `
                    <div class="weight-chip">
                        <span>${w.toFixed(2)}kg</span>
                        <button onclick="app.billing.removeWeight(${i})" class="btn-remove">×</button>
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
        const itemSelect = document.getElementById('itemName');
        const rateSelect = document.getElementById('itemRate');
        const customRate = document.getElementById('customRate');
        
        if (!itemSelect || !rateSelect) return;
        
        const itemName = itemSelect.value;
        const rate = parseFloat(customRate.value || rateSelect.value);
        
        if (!itemName) {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        if (weights.length === 0) {
            UIManager.showToast('Please add at least one weight');
            return;
        }
        
        const qty = weights.reduce((sum, w) => sum + w, 0);
        const total = qty * rate;
        
        // Find item's Hindi name
        const item = AppState.database.items.find(i => i.name === itemName);
        const hindiName = item?.hindiName || itemName;
        
        billItems.push({
            name: hindiName,
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
        document.getElementById('weightInput').value = '';
        if (customRate) customRate.value = '';
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${hindiName} to bill`);
        
        // Focus back to weight input
        document.getElementById('weightInput').focus();
    },
    
    renderBill() {
        const container = document.getElementById('billItemsList');
        if (!container) return;
        
        if (billItems.length === 0) {
            container.innerHTML = '<p class="no-data">No items in bill</p>';
            document.getElementById('billTotal').textContent = '0';
            document.getElementById('totalPackets').textContent = '0';
            return;
        }
        
        let html = '<div class="bill-items">';
        billItems.forEach((item, index) => {
            const weightsDisplay = item.weights.length > 1 
                ? `(${item.weights.join(' + ')})` 
                : '';
            
            html += `
                <div class="bill-item">
                    <div class="bill-item-header">
                        <strong>${item.name}</strong>
                        <button onclick="app.billing.deleteBillItem(${index})" class="btn-remove">×</button>
                    </div>
                    <div class="bill-item-details">
                        <span>₹${item.rate} × ${item.qty}kg ${weightsDisplay}</span>
                        <span class="item-total">₹${item.total.toFixed(2)}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
        
        // Update totals
        const billTotal = billItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = billItems.reduce((sum, item) => sum + item.weights.length, 0);
        
        document.getElementById('billTotal').textContent = billTotal.toFixed(2);
        document.getElementById('totalPackets').textContent = totalPackets;
        
        this.updateTotals();
    },
    
    deleteBillItem(index) {
        billItems.splice(index, 1);
        this.renderBill();
        UIManager.hapticFeedback();
    },
    
    updateTotals() {
        const billTotal = parseFloat(document.getElementById('billTotal')?.textContent || 0);
        const totalPackets = parseInt(document.getElementById('totalPackets')?.textContent || 0);
        const laborRateInput = document.getElementById('laborRate');
        const laborChargesInput = document.getElementById('laborCharges');
        
        // Calculate labor charges if auto-labor is enabled
        const settings = AppState.settings || DEFAULT_SETTINGS;
        if (settings.autoCalculateLabor && laborRateInput) {
            const laborRate = parseFloat(laborRateInput.value) || 6;
            const laborCharges = laborRate * totalPackets;
            if (laborChargesInput) {
                laborChargesInput.value = laborCharges.toFixed(2);
            }
        }
        
        // Calculate grand total
        const laborCharges = parseFloat(laborChargesInput?.value || 0);
        const grandTotal = billTotal + laborCharges;
        
        const grandTotalElement = document.getElementById('grandTotal');
        if (grandTotalElement) {
            grandTotalElement.textContent = grandTotal.toFixed(2);
        }
        
        this.updatePaymentTotal();
    },
    
    updatePaymentTotal() {
        const grandTotal = parseFloat(document.getElementById('grandTotal')?.textContent || 0);
        const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
        
        const totalPaid = onlinePayment + cashPayment;
        const balance = grandTotal - totalPaid;
        
        const balanceElement = document.getElementById('paymentBalance');
        if (balanceElement) {
            balanceElement.textContent = balance.toFixed(2);
            balanceElement.className = balance === 0 ? 'balanced' : (balance > 0 ? 'due' : 'excess');
        }
    },
    
    fillPayableAmount(type) {
        const grandTotal = parseFloat(document.getElementById('grandTotal')?.textContent || 0);
        const onlineInput = document.getElementById('onlinePayment');
        const cashInput = document.getElementById('cashPayment');
        
        if (type === 'online' && onlineInput) {
            onlineInput.value = grandTotal.toFixed(2);
            if (cashInput) cashInput.value = '0';
        } else if (type === 'cash' && cashInput) {
            cashInput.value = grandTotal.toFixed(2);
            if (onlineInput) onlineInput.value = '0';
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
        const laborCharges = parseFloat(document.getElementById('laborCharges')?.value || 0);
        const totalPackets = parseInt(document.getElementById('totalPackets').textContent);
        const grandTotal = billTotal + laborCharges;
        const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
        const customerName = document.getElementById('customerName')?.value || '';
        
        const bill = {
            id: generateId(),
            items: billItems,
            billTotal,
            laborCharges,
            totalPackets,
            grandTotal,
            onlinePayment,
            cashPayment,
            customerName,
            isPurchase: true,
            date: new Date().toISOString(),
            userId: AppState.auth.uid,
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
        const itemSelect = document.getElementById('saleItemName');
        const rateInput = document.getElementById('saleItemRate');
        const qtyInput = document.getElementById('saleItemQty');
        
        if (!itemSelect || !rateInput || !qtyInput) return;
        
        const itemName = itemSelect.value;
        const rate = parseFloat(rateInput.value);
        const qty = parseFloat(qtyInput.value);
        
        if (!itemName) {
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
        
        // Check stock
        const stock = AppState.database.stock?.find(s => s.itemName === itemName);
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
        qtyInput.value = '';
        rateInput.value = '';
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${itemName} to sale`);
    },
    
    renderSalesBill() {
        const container = document.getElementById('salesBillItemsList');
        if (!container) return;
        
        if (saleItems.length === 0) {
            container.innerHTML = '<p class="no-data">No items in sale</p>';
            document.getElementById('salesBillTotal').textContent = '0';
            return;
        }
        
        let html = '<div class="bill-items">';
        saleItems.forEach((item, index) => {
            html += `
                <div class="bill-item">
                    <div class="bill-item-header">
                        <strong>${item.name}</strong>
                        <button onclick="app.billing.removeSalesItem(${index})" class="btn-remove">×</button>
                    </div>
                    <div class="bill-item-details">
                        <span>₹${item.rate} × ${item.qty}kg</span>
                        <span class="item-total">₹${item.total.toFixed(2)}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
        
        // Update total
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        document.getElementById('salesBillTotal').textContent = salesTotal.toFixed(2);
        
        this.updateSalePaymentTotal();
    },
    
    removeSalesItem(index) {
        saleItems.splice(index, 1);
        this.renderSalesBill();
        UIManager.hapticFeedback();
    },
    
    updateSalePaymentTotal() {
        const salesTotal = parseFloat(document.getElementById('salesBillTotal')?.textContent || 0);
        const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
        const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
        
        const totalPaid = saleOnline + saleCash;
        const balance = salesTotal - totalPaid;
        
        const balanceElement = document.getElementById('salePaymentBalance');
        if (balanceElement) {
            balanceElement.textContent = balance.toFixed(2);
            balanceElement.className = balance === 0 ? 'balanced' : (balance > 0 ? 'due' : 'excess');
        }
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
        
        const salesTotal = parseFloat(document.getElementById('salesBillTotal').textContent);
        const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
        const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
        const saleCustomer = document.getElementById('saleCustomerName')?.value || '';
        
        const sale = {
            id: generateId(),
            items: saleItems,
            total: salesTotal,
            onlinePayment: saleOnline,
            cashPayment: saleCash,
            customerName: saleCustomer,
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
            
            UIManager.hideLoading();
            UIManager.showToast('Sale completed successfully!');
            UIManager.hapticFeedback('success');
            
        } catch (error) {
            UIManager.hideLoading();
            UIManager.showToast('Failed to complete sale: ' + error.message);
            console.error('Complete sale error:', error);
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
    }
};

export { BillingManager };
