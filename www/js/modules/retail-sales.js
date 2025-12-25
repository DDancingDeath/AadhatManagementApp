// ============================================================================
// RETAIL SALES MODULE - CURRENTLY UNUSED
// ============================================================================
// This module is NOT accessible from the UI (no navigation link exists).
// It duplicates the functionality of the Billing tab's Sale mode.
// Kept commented for future reference or potential reactivation.
// ============================================================================

/*
// Retail Sales Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { PrinterService } from '../services/printer.js';
import { generateId } from '../utils/helpers.js';

let retailSaleItems = [];
let pendingWeights = []; // Track weights before adding to bill

export class RetailSalesManager {
    static switchToPurchase() {
        window.app.nav.showTab('billing');
    }

    static async pickContact() {
        try {
            const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
            if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                const name = contact.name && contact.name.length > 0 ? contact.name[0] : '';
                document.getElementById('retailCustomerName').value = name;
            }
        } catch (error) {
            console.error('Contact picker error:', error);
            UIManager.showToast('Contact picker not available');
        }
    }

    static loadItemsDropdown() {
        const select = document.getElementById('retailItem');
        if (!select) return;

        select.innerHTML = '<option value="">Select item</option>';
        AppState.items.forEach((item, index) => {
            const option = document.createElement('option');
            option.value = index;
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            option.textContent = displayName;
            select.appendChild(option);
        });
    }

    static loadItemRates() {
        const itemSelect = document.getElementById('retailItem');
        const rateInput = document.getElementById('retailRate');
        const datalist = document.getElementById('retailRateOptions');
        
        if (!itemSelect || !rateInput || !datalist) return;
        
        const itemIndex = parseInt(itemSelect.value);
        if (isNaN(itemIndex)) {
            datalist.innerHTML = '';
            rateInput.value = '';
            return;
        }
        
        const item = AppState.items[itemIndex];
        if (!item) return;
        
        // Load sale rates
        datalist.innerHTML = '';
        if (item.saleRates && item.saleRates.length > 0) {
            item.saleRates.forEach(rate => {
                if (rate > 0) {
                    const option = document.createElement('option');
                    option.value = rate;
                    datalist.appendChild(option);
                }
            });
            // Auto-fill with first rate
            rateInput.value = item.saleRates[0];
        }
    }

    static addItem() {
        console.log('🔵 addItem() called');
        const itemSelect = document.getElementById('retailItem');
        const rateInput = document.getElementById('retailRate');
        const weightInput = document.getElementById('retailWeight');
        
        if (!itemSelect || !rateInput || !weightInput) return;
        
        const itemIndex = parseInt(itemSelect.value);
        const rate = parseFloat(rateInput.value);
        const weight = parseFloat(weightInput.value);
        
        console.log('📦 Weight entered:', weight, 'Pending weights before:', pendingWeights.length);
        
        if (isNaN(itemIndex) || itemIndex === '') {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        if (!weight || weight <= 0) {
            UIManager.showToast('Please enter a valid weight');
            return;
        }
        
        // Add weight to pending list
        pendingWeights.push(weight);
        console.log('✅ Weight added to pending. Pending weights now:', pendingWeights);
        
        // Update the totals for display
        const totalKg = pendingWeights.reduce((sum, w) => sum + w, 0);
        const totalPackets = pendingWeights.length;
        
        document.getElementById('retailTotalKg').textContent = totalKg.toFixed(1);
        document.getElementById('retailTotalPackets').textContent = totalPackets;
        
        // Clear weight input for next entry
        weightInput.value = '';
        weightInput.focus();
        
        UIManager.hapticFeedback();
    }

    static addToBill() {
        console.log('🟢 addToBill() called');
        const itemSelect = document.getElementById('retailItem');
        const rateInput = document.getElementById('retailRate');
        const weightInput = document.getElementById('retailWeight');
        
        if (!itemSelect || !rateInput) return;
        
        const itemIndex = parseInt(itemSelect.value);
        const rate = parseFloat(rateInput.value);
        
        console.log('📊 Pending weights:', pendingWeights);
        
        // Check if there's a pending weight to add
        const pendingWeight = parseFloat(weightInput?.value);
        if (pendingWeight && pendingWeight > 0) {
            console.log('⚠️ Found pending weight in input:', pendingWeight, '- calling addItem()');
            this.addItem(); // This will add the pending weight to pendingWeights array
        }
        
        // Check if we have any weights
        if (pendingWeights.length === 0) {
            UIManager.showToast('Please add at least one weight');
            return;
        }
        
        if (isNaN(itemIndex)) {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        const item = AppState.items[itemIndex];
        const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        // Calculate totals from pending weights
        const totalKg = pendingWeights.reduce((sum, w) => sum + w, 0);
        const totalPackets = pendingWeights.length;
        const total = totalKg * rate;
        
        retailSaleItems.push({
            itemId: item.id,
            name: displayName,
            rate,
            qty: totalKg,
            packets: totalPackets,
            total,
            timestamp: Date.now()
        });
        
        // Clear pending weights and reset displays
        pendingWeights = [];
        document.getElementById('retailTotalKg').textContent = '0.0';
        document.getElementById('retailTotalPackets').textContent = '0';
        if (weightInput) weightInput.value = '';
        
        this.renderBill();
        UIManager.hapticFeedback();
    }

    static renderBill() {
        const tbody = document.querySelector('#retailSaleTable tbody');
        if (!tbody) return;
        
        tbody.innerHTML = retailSaleItems.map((item, index) => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px;">${item.name}</td>
                <td style="padding: 12px; text-align: center;">₹${item.rate.toFixed(2)}</td>
                <td style="padding: 12px; text-align: center;">${item.qty.toFixed(1)} kg</td>
                <td style="padding: 12px; text-align: right;"><strong>₹${Math.round(item.total)}</strong></td>
            </tr>
        `).join('');
        
        // Update totals
        const saleTotal = retailSaleItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = retailSaleItems.reduce((sum, item) => sum + (item.packets || 0), 0);
        
        document.getElementById('retailSaleTotal').textContent = Math.round(saleTotal);
        document.getElementById('retailAmountReceivable').textContent = Math.round(saleTotal);
        document.getElementById('retailBillTotalPackets').textContent = totalPackets;
        
        this.updatePaymentTotal();
    }

    static updatePaymentTotal() {
        const saleTotal = parseFloat(document.getElementById('retailAmountReceivable')?.textContent || 0);
        const onlinePayment = parseFloat(document.getElementById('retailOnlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('retailCashPayment')?.value || 0);
        
        const totalReceived = onlinePayment + cashPayment;
        const due = Math.max(0, saleTotal - totalReceived);
        
        document.getElementById('retailTotalReceived').textContent = Math.round(totalReceived);
        document.getElementById('retailDueAmount').value = Math.round(due);
    }

    static fillReceivable(type) {
        const saleTotal = parseFloat(document.getElementById('retailAmountReceivable')?.textContent || 0);
        const onlineInput = document.getElementById('retailOnlinePayment');
        const cashInput = document.getElementById('retailCashPayment');
        const onlineCheckbox = document.getElementById('retailOnlineCheckbox');
        const cashCheckbox = document.getElementById('retailCashCheckbox');
        
        if (type === 'online' && onlineCheckbox?.checked) {
            if (onlineInput) onlineInput.value = Math.round(saleTotal);
            if (cashInput) cashInput.value = '0';
            if (cashCheckbox) cashCheckbox.checked = false;
        } else if (type === 'cash' && cashCheckbox?.checked) {
            if (cashInput) cashInput.value = Math.round(saleTotal);
            if (onlineInput) onlineInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
        }
        
        this.updatePaymentTotal();
    }

    static async saveSale() {
        if (retailSaleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        const saleTotal = parseFloat(document.getElementById('retailSaleTotal')?.textContent || 0);
        const amountReceivable = parseFloat(document.getElementById('retailAmountReceivable')?.textContent || 0);
        const onlinePayment = parseFloat(document.getElementById('retailOnlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('retailCashPayment')?.value || 0);
        const dueAmount = parseFloat(document.getElementById('retailDueAmount')?.value || 0);
        const customerName = document.getElementById('retailCustomerName')?.value || '';
        const comments = document.getElementById('retailComments')?.value || '';
        
        const sale = {
            id: generateId(),
            items: retailSaleItems,
            saleTotal,
            amountReceivable,
            payment: {
                online: onlinePayment,
                cash: cashPayment,
                due: dueAmount
            },
            customerName,
            comments,
            isRetail: true,
            date: new Date().toISOString(),
            userId: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            userName: AppState.userName || 'User',
            timestamp: Date.now()
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.saveRetailSale(sale);
            
            // Clear form
            retailSaleItems = [];
            pendingWeights = [];
            this.renderBill();
            
            document.getElementById('retailCustomerName').value = '';
            document.getElementById('retailOnlinePayment').value = '';
            document.getElementById('retailCashPayment').value = '';
            document.getElementById('retailDueAmount').value = '';
            document.getElementById('retailComments').value = '';
            document.getElementById('retailOnlineCheckbox').checked = false;
            document.getElementById('retailCashCheckbox').checked = false;
            document.getElementById('retailDueCheckbox').checked = false;
            document.getElementById('retailTotalKg').textContent = '0.0';
            document.getElementById('retailTotalPackets').textContent = '0';
            
            UIManager.hideLoading();
            UIManager.showToast('Sale saved successfully!');
            UIManager.hapticFeedback('success');
            
        } catch (error) {
            console.error('Save sale error:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to save sale');
        }
    }

    static async shareWhatsApp() {
        if (retailSaleItems.length === 0) {
            UIManager.showToast('No items to share');
            return;
        }
        
        const customerName = document.getElementById('retailCustomerName')?.value || 'Customer';
        const saleTotal = parseFloat(document.getElementById('retailSaleTotal')?.textContent || 0);
        
        let message = `*Sale Bill*\n`;
        message += `Customer: ${customerName}\n`;
        message += `Date: ${new Date().toLocaleString('en-IN')}\n\n`;
        message += `*Items:*\n`;
        
        retailSaleItems.forEach(item => {
            message += `${item.name}\n`;
            message += `  Rate: ₹${item.rate.toFixed(2)} × ${item.qty.toFixed(1)}kg = ₹${Math.round(item.total)}\n`;
        });
        
        message += `\n*Total: ₹${Math.round(saleTotal)}*`;
        
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    }

    static async printSale() {
        // Collect sale data before saving
        if (retailSaleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        const saleData = {
            items: retailSaleItems,
            saleTotal: parseFloat(document.getElementById('retailSaleTotal')?.textContent || 0),
            customerName: document.getElementById('retailCustomerName')?.value || '',
            isRetail: true,
            date: new Date().toISOString()
        };
        
        try {
            // Save the sale
            await this.saveSale();
            
            // Print the sale data we collected
            await PrinterService.printBill(saleData);
            
            UIManager.showToast('Sale saved and printed!');
        } catch (error) {
            console.error('Print error:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }
}
*/

// ============================================================================
// END OF COMMENTED RETAIL SALES MODULE
// ============================================================================
