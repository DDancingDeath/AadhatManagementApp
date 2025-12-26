// Outstanding Payments Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { formatDate } from '../utils/helpers.js';

export class OutstandingManager {
    static filterDue(filter, evt) {
        AppState.currentDueFilter = filter;
        
        document.querySelectorAll('#due .filter-btn').forEach(btn => btn.classList.remove('active'));
        if (evt) evt.target.classList.add('active');
        
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
        const billLabel = isPurchase ? 'Bill' : 'Sale';

        dueTransactions.forEach(transaction => {
            const div = document.createElement("div");
            div.className = "history-item";
            div.setAttribute('data-type', transaction.transactionType);
            
            const itemColor = transaction.transactionType === 'sale' ? '#28a745' : '#007bff';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: ${itemColor}; text-decoration: underline;" onclick="window.app.outstanding.showDetails('${transaction.id}', '${transaction.transactionType}')">${billLabel} #${transaction.id}</span>${transaction.customerName ? ` <strong>${transaction.customerName}</strong>` : ''}
                    <span style="color: ${headerColor}; font-weight: 700;">Due: ₹${Math.round(transaction.outstanding)}</span>
                </div>
                <div class="history-date">${formatDate(transaction.date)}${transaction.createdByName ? ` • By: <strong>${transaction.createdByName}</strong>` : ''}</div>
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
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd;">
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

    static async markAsCleared(transactionId, transactionType) {
        try {
            const collection = transactionType === 'purchase' ? 'bills' : 'sales';
            
            await db.collection(collection).doc(String(transactionId)).update({
                cleared: true,
                clearedAt: new Date().toLocaleString('en-IN'),
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
