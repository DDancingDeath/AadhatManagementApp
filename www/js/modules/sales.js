// Sales Management Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';

export class SalesManager {
    static filterSalesTab(view, evt) {
        const buttons = document.querySelectorAll('#sales .filter-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (evt) evt.target.classList.add('active');
        
        const entrySection = document.getElementById('salesEntrySection');
        const outstandingSection = document.getElementById('salesOutstandingSection');
        
        if (view === 'sales') {
            entrySection.style.display = 'block';
            outstandingSection.style.display = 'none';
        } else {
            entrySection.style.display = 'none';
            outstandingSection.style.display = 'block';
            this.renderSalesOutstanding();
        }
    }

    static updateWholesaleCustomerOptions(newCustomer) {
        const salesHistory = AppState.salesHistory;
        const uniqueCustomers = [...new Set(
            salesHistory
                .filter(s => s.source === 'sales-tab' && s.customerName)
                .map(s => s.customerName)
        )];
        
        if (newCustomer && !uniqueCustomers.includes(newCustomer)) {
            uniqueCustomers.unshift(newCustomer);
        }
        
        const datalist = document.getElementById('wholesaleCustomerOptions');
        if (datalist) {
            datalist.innerHTML = uniqueCustomers.map(name => `<option value="${name}">`).join('');
        }
    }

    static async recordPayment(saleId) {
        const salesHistory = AppState.salesHistory;
        const sale = salesHistory.find(s => s.id == saleId);
        if (!sale) {
            UIManager.showToast('Error: Sale not found');
            return;
        }
        
        const paymentInput = document.getElementById(`payment_${saleId}`);
        const paymentAmount = Number(paymentInput.value) || 0;
        
        if (paymentAmount <= 0) {
            UIManager.showToast('Please enter a valid payment amount');
            return;
        }
        
        const currentReceived = (sale.payment.online || 0) + (sale.payment.cash || 0);
        const outstanding = sale.payment.due || 0;
        
        if (paymentAmount > outstanding) {
            UIManager.showToast('Payment amount exceeds outstanding amount');
            return;
        }
        
        if (!sale.payments) sale.payments = [];
        
        const payment = {
            amount: paymentAmount,
            date: new Date().toLocaleString(),
            recordedBy: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };
        
        sale.payments.push(payment);
        sale.payment.cash = (sale.payment.cash || 0) + paymentAmount;
        sale.payment.total = (sale.payment.online || 0) + sale.payment.cash;
        sale.payment.due = sale.total - sale.payment.total;
        
        try {
            await window.db.collection('sales').doc(String(saleId)).update({
                payments: sale.payments,
                payment: sale.payment
            });
            
            paymentInput.value = '';
            this.renderSalesOutstanding();
            this.renderSalesHistory();
            window.app.outstanding.renderDue();
            UIManager.showToast(`✓ Payment of ₹${paymentAmount} recorded`);
        } catch (error) {
            console.error('Error recording payment:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static async markSaleAsCleared(saleId) {
        const salesHistory = AppState.salesHistory;
        const sale = salesHistory.find(s => s.id == saleId);
        if (!sale) {
            console.error('Sale not found:', saleId);
            UIManager.showToast('Error: Sale not found');
            return;
        }
        
        sale.cleared = true;
        
        try {
            await window.db.collection('sales').doc(String(saleId)).update({ cleared: true });
            
            this.renderSalesOutstanding();
            window.app.outstanding.renderDue();
            UIManager.showToast('✓ Sale marked as cleared');
        } catch (error) {
            console.error('Error updating sale:', error, 'Sale ID:', saleId);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static renderSalesOutstanding() {
        const salesHistory = AppState.salesHistory;
        const container = document.getElementById("salesOutstandingList");
        
        const outstandingSales = salesHistory
            .filter(sale => {
                if (sale.source !== 'sales-tab') return false;
                if (sale.cleared) return false;
                
                const totalReceivable = sale.total || 0;
                const onlineReceived = sale.payment ? (sale.payment.online || 0) : 0;
                const cashReceived = sale.payment ? (sale.payment.cash || 0) : 0;
                const totalReceived = onlineReceived + cashReceived;
                const outstanding = sale.payment?.due || (totalReceivable - totalReceived);
                
                return outstanding > 0;
            })
            .map(sale => {
                const totalReceivable = sale.total || 0;
                const onlineReceived = sale.payment ? (sale.payment.online || 0) : 0;
                const cashReceived = sale.payment ? (sale.payment.cash || 0) : 0;
                const totalReceived = onlineReceived + cashReceived;
                const outstanding = sale.payment?.due || (totalReceivable - totalReceived);
                
                return {
                    ...sale,
                    outstanding: outstanding,
                    totalAmount: totalReceivable,
                    paidAmount: totalReceived
                };
            });
        
        if (outstandingSales.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No outstanding payments</p>';
            return;
        }

        const customerOutstanding = {};
        outstandingSales.forEach(sale => {
            const customer = sale.customerName || 'Unknown';
            if (!customerOutstanding[customer]) {
                customerOutstanding[customer] = {
                    name: customer,
                    totalOutstanding: 0,
                    billCount: 0,
                    sales: []
                };
            }
            customerOutstanding[customer].totalOutstanding += sale.outstanding;
            customerOutstanding[customer].billCount++;
            customerOutstanding[customer].sales.push(sale);
        });

        const sortedCustomers = Object.values(customerOutstanding).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                        <th style="padding: 12px; text-align: left; font-weight: 600;">Customer</th>
                        <th style="padding: 12px; text-align: center; font-weight: 600;">Bills</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600;">Outstanding</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedCustomers.map(customer => `
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 12px;"><strong>${customer.name}</strong></td>
                            <td style="padding: 12px; text-align: center;">${customer.billCount}</td>
                            <td style="padding: 12px; text-align: right; color: #28a745; font-weight: 600;">₹${customer.totalOutstanding.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                    <tr style="background: #e9ecef; font-weight: 700;">
                        <td style="padding: 12px;">Total</td>
                        <td style="padding: 12px; text-align: center;">${outstandingSales.length}</td>
                        <td style="padding: 12px; text-align: right; color: #28a745;">₹${sortedCustomers.reduce((sum, c) => sum + c.totalOutstanding, 0).toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        `;

        sortedCustomers.forEach(customer => {
            const customerSection = document.createElement('div');
            customerSection.style.marginBottom = '30px';
            
            const customerHeader = document.createElement('h5');
            customerHeader.innerHTML = `${customer.name} <span style="color: #28a745;">(₹${customer.totalOutstanding.toFixed(2)})</span>`;
            customerHeader.style.marginBottom = '10px';
            customerHeader.style.padding = '8px 12px';
            customerHeader.style.background = '#e9ecef';
            customerHeader.style.borderRadius = '4px';
            customerSection.appendChild(customerHeader);

            customer.sales.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sale => {
                const div = document.createElement("div");
                div.className = "history-item";
                
                div.innerHTML = `
                    <div class="history-header">
                        <span>Sale #${sale.id}${sale.customerName ? ` • <strong>${sale.customerName}</strong>` : ''}</span>
                        <span style="color: #28a745; font-weight: 700;">Due: ₹${sale.outstanding.toFixed(2)}</span>
                    </div>
                    <div class="history-date">${sale.date}${sale.createdByName ? ` • By: <strong>${sale.createdByName}</strong>` : ''}</div>
                    <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 12px; margin: 12px 0; border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span>Total Receivable:</span>
                            <strong>₹${sale.totalAmount.toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span>Received:</span>
                            <strong>₹${sale.paidAmount.toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-top: 2px solid #17a2b8; padding-top: 6px; margin-top: 6px;">
                            <span style="font-weight: 600;">Outstanding:</span>
                            <strong style="color: #28a745; font-size: 16px;">₹${sale.outstanding.toFixed(2)}</strong>
                        </div>
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #17a2b8;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <label style="font-weight: 500;">Payment (₹):</label>
                                <input type="number" inputmode="decimal" id="payment_${sale.id}" placeholder="Enter amount" style="flex: 1; padding: 6px; border: 1px solid #17a2b8; border-radius: 4px;" />
                                <button onclick="app.sales.recordPayment('${sale.id}')" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Record</button>
                            </div>
                            <div style="display: flex; align-items: center;">
                                <input type="checkbox" id="clear_${sale.id}" onchange="app.sales.markSaleAsCleared('${sale.id}')" style="margin-right: 8px; transform: scale(1.2);" />
                                <label for="clear_${sale.id}" style="cursor: pointer; font-weight: 500;">Mark as Cleared</label>
                            </div>
                        </div>
                    </div>
                `;
                
                customerSection.appendChild(div);
            });
            
            container.appendChild(customerSection);
        });
    }

    static renderSalesHistory() {
        const salesHistory = AppState.salesHistory;
        const container = document.getElementById("salesHistoryList");
        
        const salesTabHistory = salesHistory.filter(sale => sale.source === 'sales-tab');
        
        if (salesTabHistory.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No sales yet</p>';
            return;
        }

        container.innerHTML = "";

        salesTabHistory.forEach((sale, saleIndex) => {
            const div = document.createElement("div");
            div.className = "history-item";
            
            const totalWeight = sale.items.reduce((sum, item) => sum + (item.qty || item.quantity || 0), 0);
            
            const paymentParts = [];
            if (sale.payment) {
                if (sale.payment.online > 0) paymentParts.push(`Online: ₹${sale.payment.online}`);
                if (sale.payment.cash > 0) paymentParts.push(`Cash: ₹${sale.payment.cash}`);
                if (sale.payment.due > 0) paymentParts.push(`Due: ₹${sale.payment.due}`);
            }
            const paymentHTML = paymentParts.length > 0 ? `
                <div class="history-payment">
                    ${paymentParts.join(' | ')}
                </div>
            ` : '';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: #007bff; text-decoration: underline;" onclick="app.sales.reprintSale(${saleIndex})">Sale #${sale.id}</span>${sale.customerName ? ` • <strong>${sale.customerName}</strong>` : ''}
                    <span style="color: #28a745; font-weight: 700;">₹ ${sale.total}</span>
                </div>
                <div class="history-date">${sale.date}${sale.createdByName ? ` • By: <strong>${sale.createdByName}</strong>` : ''}</div>
                <div class="history-summary">
                    ${sale.items.map(item => item.name).join(', ')} • ${totalWeight.toFixed(2)}kg
                </div>
                ${paymentHTML}
            `;
            
            container.appendChild(div);
        });
    }

    static async reprintSale(index) {
        const salesHistory = AppState.salesHistory;
        const sale = salesHistory[index];
        if (!sale) {
            UIManager.showModal('Sale not found');
            return;
        }
        
        const itemsHTML = sale.items.map(item => {
            const qty = item.qty || item.quantity || 0;
            return `
                <tr>
                    <td>${item.name}</td>
                    <td>${qty} kg</td>
                    <td>₹${item.rate}</td>
                    <td><strong>₹${item.total}</strong></td>
                </tr>
            `;
        }).join('');
        
        const payment = sale.payment || {};
        const paymentHTML = (payment.online > 0 || payment.cash > 0 || payment.due > 0) ? `
            <div class="bill-payment-section">
                <h4>Payment Details</h4>
                ${payment.online > 0 ? `<div class="bill-payment-row"><span>Online:</span><strong>₹${payment.online}</strong></div>` : ''}
                ${payment.cash > 0 ? `<div class="bill-payment-row"><span>Cash:</span><strong>₹${payment.cash}</strong></div>` : ''}
                ${payment.due > 0 ? `<div class="bill-payment-row" style="color: #dc3545;"><span>Due:</span><strong>₹${payment.due}</strong></div>` : ''}
            </div>
        ` : '';
        
        const paymentsHistoryHTML = sale.payments && sale.payments.length > 0 ? `
            <div class="bill-payment-section" style="background: #e7f5e9;">
                <h4 style="color: #155724;">Payment History</h4>
                ${sale.payments.map(p => `
                    <div class="bill-payment-row"><span>• ${p.date}${p.recordedBy ? ` by ${p.recordedBy}` : ''}</span><strong>₹${p.amount}</strong></div>
                `).join('')}
            </div>
        ` : '';
        
        const content = `
            <div class="bill-info-section">
                ${sale.customerName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Customer:</div>
                        <div class="bill-info-value"><strong>${sale.customerName}</strong></div>
                    </div>
                ` : ''}
                <div class="bill-info-row">
                    <div class="bill-info-label">Date:</div>
                    <div class="bill-info-value">${sale.date}</div>
                </div>
                ${sale.createdByName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Created By:</div>
                        <div class="bill-info-value">${sale.createdByName}</div>
                    </div>
                ` : ''}
            </div>
            
            <table class="bill-items-table">
                <thead>
                    <tr>
                        <th>Item</th>
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
                <div class="bill-totals-row total">
                    <span>Total:</span>
                    <strong>₹${sale.total}</strong>
                </div>
            </div>
            
            ${paymentHTML}
            ${paymentsHistoryHTML}
        `;
        
        document.getElementById('billDetailsTitle').textContent = `Sale #${sale.id}`;
        document.getElementById('billDetailsContent').innerHTML = content;
        document.getElementById('billDetailsOverlay').classList.add('active');
    }
}
