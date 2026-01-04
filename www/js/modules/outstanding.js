// Outstanding Payments Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { Helpers } from '../utils/helpers.js';
import { AuditService } from '../services/audit.js';

export class OutstandingManager {
    static searchOutstanding() {
        const searchInput = document.getElementById("outstandingSearchInput");
        const searchTerm = searchInput?.value.toLowerCase().trim() || '';
        const container = document.getElementById("dueList");
        
        if (!container) return;
        
        const items = container.querySelectorAll('.history-item');
        
        if (items.length === 0) {
            this.renderDue();
            return;
        }
        
        let visibleCount = 0;
        
        items.forEach(item => {
            const itemText = item.textContent.toLowerCase();
            if (itemText.includes(searchTerm)) {
                item.style.display = '';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        let noResultsMsg = container.querySelector('.no-results-message');
        if (visibleCount === 0 && searchTerm !== '') {
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('p');
                noResultsMsg.className = 'no-results-message';
                noResultsMsg.style.cssText = 'text-align: center; color: #888; margin-top: 40px;';
                noResultsMsg.textContent = 'No matching transactions found';
                container.appendChild(noResultsMsg);
            }
        } else if (noResultsMsg) {
            noResultsMsg.remove();
        }
    }

    static filterDue(filter, evt) {
        AppState.currentDueFilter = filter;
        
        document.querySelectorAll('#due .filter-btn').forEach(btn => btn.classList.remove('active'));
        if (evt) evt.target.classList.add('active');
        
        const searchInput = document.getElementById("outstandingSearchInput");
        if (searchInput) searchInput.value = '';
        
        this.renderDue();
    }

    static renderDue() {
        const currentDueFilter = AppState.currentDueFilter;
        const billHistory = AppState.billHistory;
        const salesHistory = AppState.salesHistory;
        const container = document.getElementById("dueList");
        
        const dueTransactions = [];
        
        if (currentDueFilter === 'purchase') {
            billHistory.forEach(bill => {
                const duePaid = bill.payment ? (bill.payment.due || 0) : (bill.dueAmount || 0);
                
                if (duePaid > 0 && !bill.cleared) {
                    const totalPayable = bill.grandTotal || bill.amountPayable || bill.total || 0;
                    const onlinePaid = bill.payment ? (bill.payment.online || 0) : (bill.onlinePayment || 0);
                    const cashPaid = bill.payment ? (bill.payment.cash || 0) : (bill.cashPayment || 0);
                    const totalPaid = onlinePaid + cashPaid;
                    
                    dueTransactions.push({
                        ...bill,
                        transactionType: 'purchase',
                        outstanding: duePaid,
                        totalAmount: totalPayable,
                        paidAmount: totalPaid,
                        onlinePaid: onlinePaid,
                        cashPaid: cashPaid
                    });
                }
            });
        } else if (currentDueFilter === 'sale') {
            salesHistory.forEach(sale => {
                const dueReceived = sale.payment ? (sale.payment.due || 0) : (sale.dueAmount || 0);
                
                if (dueReceived > 0 && !sale.cleared) {
                    const totalReceivable = sale.total || 0;
                    const onlineReceived = sale.payment ? (sale.payment.online || 0) : (sale.onlinePayment || 0);
                    const cashReceived = sale.payment ? (sale.payment.cash || 0) : (sale.cashPayment || 0);
                    const totalReceived = onlineReceived + cashReceived;
                    
                    dueTransactions.push({
                        ...sale,
                        transactionType: 'sale',
                        outstanding: dueReceived,
                        totalAmount: totalReceivable,
                        paidAmount: totalReceived,
                        onlineReceived: onlineReceived,
                        cashReceived: cashReceived
                    });
                }
            });
        }
        
        // Sort by date (newest first) - use timestamp if available, otherwise parse date
        dueTransactions.sort((a, b) => {
            const dateA = a.timestamp || new Date(a.date).getTime();
            const dateB = b.timestamp || new Date(b.date).getTime();
            return dateB - dateA;
        });
        
        if (dueTransactions.length === 0) {
            const message = currentDueFilter === 'purchase' ? 'No outstanding purchase amounts' : 'No outstanding sale amounts';
            container.innerHTML = `<p style="text-align: center; color: #888; margin-top: 40px;">${message}</p>`;
            return;
        }

        container.innerHTML = "";
        
        const isPurchase = currentDueFilter === 'purchase';
        const headerColor = '#dc3545';
        const bgColor = '#d1ecf1';
        const borderColor = '#17a2b8';
        const totalLabel = isPurchase ? 'Total Payable' : 'Total Receivable';
        const paidLabel = isPurchase ? 'Paid' : 'Received';

        dueTransactions.forEach(transaction => {
            const div = document.createElement("div");
            div.className = "history-item";
            div.setAttribute('data-type', transaction.transactionType);
            
            const itemColor = transaction.transactionType === 'sale' ? '#28a745' : '#007bff';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: ${itemColor}; text-decoration: underline;" onclick="window.app.outstanding.showDetails('${transaction.id}', '${transaction.transactionType}')">#${transaction.id}</span>${transaction.customerName ? `  <strong>${transaction.customerName}</strong>` : ''}
                    <span style="color: ${headerColor}; font-weight: 700;">Due: ₹${Math.round(transaction.outstanding)}</span>
                </div>
                <div class="history-date">${Helpers.formatDate(transaction.date)}${transaction.createdByName ? ` • By: <strong>${transaction.createdByName}</strong>` : ''}</div>
                <div style="background: ${bgColor}; border-left: 4px solid ${borderColor}; padding: 12px; margin: 12px 0; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span>${totalLabel}:</span>
                        <strong>₹${Math.round(transaction.totalAmount)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span>${paidLabel}:</span>
                        <strong>₹${Math.round(transaction.paidAmount)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 2px solid ${borderColor}; padding-top: 6px; margin-top: 6px;">
                        <span style="font-weight: 600;">Outstanding:</span>
                        <strong style="color: ${headerColor}; font-size: 16px;">₹${Math.round(transaction.outstanding)}</strong>
                    </div>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; display: flex; align-items: center; gap: 8px;">
                        <label style="flex-shrink: 0;">Payment (₹):</label>
                        <input type="number" id="payment_${transaction.id}" placeholder="Enter amount" style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
                        <button onclick="window.app.outstanding.recordPayment('${transaction.id}', '${transaction.transactionType}')" style="background-color: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">Record</button>
                    </div>
                    <div style="margin-top: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" ${transaction.cleared ? 'checked' : ''} onchange="window.app.outstanding.markAsCleared('${transaction.id}', '${transaction.transactionType}')" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" />
                            <span style="font-size: 14px; color: #333; font-weight: 600;">Mark as Cleared</span>
                        </label>
                    </div>
                </div>
            `;
            
            container.appendChild(div);
        });
    }

    static async recordPayment(transactionId, transactionType) {
        try {
            const paymentInput = document.getElementById(`payment_${transactionId}`);
            const paymentAmount = Number(paymentInput.value) || 0;
            
            if (paymentAmount <= 0) {
                UIManager.showToast('Please enter a valid payment amount');
                return;
            }
            
            let transaction;
            if (transactionType === 'purchase') {
                transaction = AppState.billHistory.find(b => String(b.id) === String(transactionId));
            } else {
                transaction = AppState.salesHistory.find(s => String(s.id) === String(transactionId));
            }
            
            if (!transaction) {
                UIManager.showToast('Error: Transaction not found');
                return;
            }
            
            const outstanding = transaction.payment?.due || 0;
            
            if (paymentAmount > outstanding) {
                UIManager.showToast('Payment amount exceeds outstanding amount');
                return;
            }
            
            // Initialize payments array if it doesn't exist
            if (!transaction.payments) transaction.payments = [];
            
            // Record the payment
            const payment = {
                amount: paymentAmount,
                date: Helpers.getCurrentDateTime(),
                recordedBy: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
            };
            
            transaction.payments.push(payment);
            
            // Update payment totals
            if (!transaction.payment) {
                transaction.payment = { online: 0, cash: 0, due: 0, total: 0 };
            }
            
            transaction.payment.cash = (transaction.payment.cash || 0) + paymentAmount;
            transaction.payment.total = (transaction.payment.online || 0) + transaction.payment.cash;
            
            if (transactionType === 'purchase') {
                const totalPayable = transaction.grandTotal || transaction.amountPayable || transaction.total || 0;
                transaction.payment.due = totalPayable - transaction.payment.total;
                await FirebaseService.updateBill(transaction);
            } else {
                const totalReceivable = transaction.total || 0;
                transaction.payment.due = totalReceivable - transaction.payment.total;
                await FirebaseService.updateSale(transaction);
            }
            
            paymentInput.value = '';
            this.renderDue();
            
            // Log audit entry
            await AuditService.log(AuditService.ACTIONS.UPDATE_PAYMENT, {
                billNumber: transaction.billNumber || 'N/A',
                paymentAmount: paymentAmount,
                transactionType: transactionType,
                customer: transaction.customer || transaction.supplier || 'N/A'
            });
            
            const paymentLabel = transactionType === 'purchase' ? 'Payment' : 'Payment';
            UIManager.showToast(`✓ ${paymentLabel} of ₹${paymentAmount} recorded`);
            UIManager.hapticFeedback('light');
            
        } catch (error) {
            console.error('Error recording payment:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static async markAsCleared(transactionId, transactionType) {
        try {
            const collection = transactionType === 'purchase' ? 'bills' : 'sales';
            
            await db.collection(collection).doc(String(transactionId)).update({
                cleared: true,
                clearedAt: Helpers.getCurrentDateTime(),
                clearedBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
                clearedByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
            });
            
            if (transactionType === 'purchase') {
                const bill = AppState.billHistory.find(b => String(b.id) === String(transactionId));
                if (bill) bill.cleared = true;
            } else {
                const sale = AppState.salesHistory.find(s => String(s.id) === String(transactionId));
                if (sale) sale.cleared = true;
            }
            
            UIManager.hapticFeedback('light');
            UIManager.showToast('✓ Outstanding marked as cleared');
            this.renderDue();
        } catch (error) {
            console.error('Error marking outstanding as cleared:', error);
            UIManager.showModal('Error: ' + error.message);
        }
    }

    static async showDetails(transactionId, transactionType) {
        const billHistory = AppState.billHistory;
        const salesHistory = AppState.salesHistory;
        
        if (transactionType === 'purchase') {
            const billIndex = billHistory.findIndex(b => String(b.id) === String(transactionId));
            if (billIndex >= 0) {
                await window.app.history.reprintBill(billIndex);
            } else {
                UIManager.showModal('Bill not found');
            }
        } else {
            const saleIndex = salesHistory.findIndex(s => String(s.id) === String(transactionId));
            if (saleIndex >= 0) {
                await window.app.sales.reprintSale(saleIndex);
            } else {
                UIManager.showModal('Sale not found');
            }
        }
    }
}
