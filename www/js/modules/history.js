// History Management Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';

export class HistoryManager {
    static async saveBillToHistory() {
        const billItems = AppState.billItems;
        const settings = AppState.settings;
        
        if (billItems.length === 0) return;

        const laborCharges = Number(document.getElementById("manualLaborCharges").value) || 0;
        const billTotal = Number(document.getElementById("billTotal").textContent);
        const amountPayable = billTotal - laborCharges;
        const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
        const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
        const duePayment = Number(document.getElementById("dueAmount").value) || 0;
        const totalPayment = onlinePayment + cashPayment + duePayment;
        const customerName = document.getElementById("customerName").value.trim();
        const billComments = document.getElementById("billComments").value.trim();
        
        const customerPhone = AppState.customerPhoneNumber || '';        // Update customer options
        if (customerName) {
            this.updateCustomerOptions(customerName);
        }

        const bill = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            customerName: customerName,
            customerPhone: customerPhone,
            comments: billComments,
            items: [...billItems],
            laborCharges: laborCharges,
            billTotal: billTotal,
            total: amountPayable,
            payment: {
                online: onlinePayment,
                cash: cashPayment,
                due: duePayment,
                total: totalPayment
            },
            type: 'purchase'
        };

        await FirebaseService.saveBill(bill);
        
        const state = AppState;
        state.billHistory.unshift(bill);
        await FirebaseService.calculateStockFromBills();
        
        // Update finance overview if on Finance tab
        if (document.getElementById('financeOverview') && document.getElementById('financeOverview').style.display !== 'none') {
            window.app.finance.calculateOverview();
        }
        
        // Clear current bill
        AppState.billItems = [];
        AppState.customerPhoneNumber = '';
        
        document.getElementById("manualLaborCharges").value = 0;
        document.getElementById("onlinePayment").value = "";
        document.getElementById("cashPayment").value = "";
        document.getElementById("dueAmount").value = "";
        document.getElementById("onlineCheckbox").checked = false;
        document.getElementById("cashCheckbox").checked = false;
        document.getElementById("dueCheckbox").checked = false;
        document.getElementById("totalPayment").textContent = 0;
        
        const totalPacketsElement = document.getElementById("totalPacketsInBill");
        if (totalPacketsElement) totalPacketsElement.textContent = 0;

        const laborCalcElement = document.getElementById("laborCalculation");
        if (laborCalcElement) laborCalcElement.textContent = `${settings.laborRate} × 0`;
        
        window.app.billing.renderBill();
        window.app.billing.updateTotals();
        window.app.outstanding.renderDue();
        
        // Clear customer fields
        document.getElementById("customerName").value = "";
        document.getElementById("billComments").value = "";
        
        // Clear draft
        UIManager.clearBillDraft();
        
        // Reset item dropdown
        window.app.items.loadItemsDropdown();
    }

    static updateCustomerOptions(newCustomer) {
        const billHistory = AppState.billHistory;
        const uniqueCustomers = [...new Set(
            billHistory
                .filter(b => b.customerName)
                .map(b => b.customerName)
        )];
        
        if (newCustomer && !uniqueCustomers.includes(newCustomer)) {
            uniqueCustomers.unshift(newCustomer);
        }
        
        const datalist = document.getElementById('customerOptions');
        if (datalist) {
            datalist.innerHTML = uniqueCustomers.map(name => `<option value="${name}">`).join('');
        }
    }

    static renderHistory() {
        const billHistory = AppState.billHistory;
        const container = document.getElementById("historyList");
        
        if (!billHistory || billHistory.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No purchase history yet</p>';
            return;
        }

        container.innerHTML = "";

        billHistory.forEach((bill, billIndex) => {
            const div = document.createElement("div");
            div.className = "history-item";
            
            const totalPackets = bill.items.reduce((sum, item) => sum + (item.packets || 0), 0);
            const totalWeight = bill.items.reduce((sum, item) => sum + (item.qty || 0), 0);
            
            const paymentParts = [];
            if (bill.payment) {
                if (bill.payment.online > 0) paymentParts.push(`Online: ₹${bill.payment.online}`);
                if (bill.payment.cash > 0) paymentParts.push(`Cash: ₹${bill.payment.cash}`);
                if (bill.payment.due > 0) paymentParts.push(`Due: ₹${bill.payment.due}`);
            }
            const paymentHTML = paymentParts.length > 0 ? `
                <div class="history-payment">
                    ${paymentParts.join(' | ')}
                </div>
            ` : '';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: #007bff; text-decoration: underline;" onclick="window.app.history.reprintBill(${billIndex})">Bill #${bill.id}</span>${bill.customerName ? ` • <strong>${bill.customerName}</strong>` : ''}
                    <span style="color: #007bff; font-weight: 700;">₹ ${bill.total}</span>
                </div>
                <div class="history-date">${bill.date}${bill.createdByName ? ` • By: <strong>${bill.createdByName}</strong>` : ''}</div>
                <div class="history-summary">
                    ${bill.items.map(item => item.name).join(', ')} • ${totalPackets} packets • ${totalWeight}kg
                </div>
                ${paymentHTML}
            `;
            
            container.appendChild(div);
        });
    }

    static async reprintBill(index) {
        const billHistory = AppState.billHistory;
        const bill = billHistory[index];
        if (!bill) {
            UIManager.showModal('Bill not found');
            return;
        }
        
        const itemsHTML = bill.items.map(item => {
            const weightsDisplay = item.weights ? item.weights.map(w => `${w}kg`).join(', ') : '';
            return `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.packets || 0}</td>
                    <td>${weightsDisplay}</td>
                    <td>${item.qty || 0} kg</td>
                    <td>₹${item.rate}</td>
                    <td><strong>₹${item.total}</strong></td>
                </tr>
            `;
        }).join('');
        
        const payment = bill.payment || {};
        const paymentHTML = (payment.online > 0 || payment.cash > 0 || payment.due > 0) ? `
            <div class="bill-payment-section">
                <h4>Payment Details</h4>
                ${payment.online > 0 ? `<div class="bill-payment-row"><span>Online:</span><strong>₹${payment.online}</strong></div>` : ''}
                ${payment.cash > 0 ? `<div class="bill-payment-row"><span>Cash:</span><strong>₹${payment.cash}</strong></div>` : ''}
                ${payment.due > 0 ? `<div class="bill-payment-row" style="color: #dc3545;"><span>Due:</span><strong>₹${payment.due}</strong></div>` : ''}
            </div>
        ` : '';
        
        const content = `
            <div class="bill-info-section">
                ${bill.customerName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Customer:</div>
                        <div class="bill-info-value"><strong>${bill.customerName}</strong></div>
                    </div>
                ` : ''}
                <div class="bill-info-row">
                    <div class="bill-info-label">Date:</div>
                    <div class="bill-info-value">${bill.date}</div>
                </div>
                ${bill.createdByName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Created By:</div>
                        <div class="bill-info-value">${bill.createdByName}</div>
                    </div>
                ` : ''}
            </div>
            
            <table class="bill-items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th style="text-align: center;">Packets</th>
                        <th>Weights</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                </tbody>
            </table>
            
            <div class="bill-totals-section">
                <div class="bill-totals-row">
                    <span>Bill Total:</span>
                    <strong>₹${bill.total}</strong>
                </div>
                ${bill.laborCharges > 0 ? `
                    <div class="bill-totals-row">
                        <span>Labor Charges:</span>
                        <strong>₹${bill.laborCharges}</strong>
                    </div>
                    <div class="bill-totals-row total">
                        <span>Amount Payable:</span>
                        <strong>₹${(bill.total - bill.laborCharges).toFixed(2)}</strong>
                    </div>
                ` : ''}
            </div>
            
            ${paymentHTML}
        `;
        
        document.getElementById('billDetailsTitle').textContent = `Purchase Bill #${bill.id}`;
        document.getElementById('billDetailsContent').innerHTML = content;
        document.getElementById('billDetailsOverlay').classList.add('active');
    }

    static closeBillDetails() {
        document.getElementById('billDetailsOverlay').classList.remove('active');
    }
}
