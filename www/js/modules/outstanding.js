/**
 * @fileoverview Outstanding Payments Module
 * Handles tracking and managing due payments for purchases and sales
 * Provides filtering, search, and payment clearing functionality
 * @module modules/outstanding
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { Helpers } from '../utils/helpers.js';
import { AuditService } from '../services/audit.js';
import { readPayment, round2 } from '../utils/money.js';
import { parseAnyBillDate } from '../utils/dates.js';

const PAYMENT_TOLERANCE = 0.01;
const COLLECTION_BY_TYPE = { purchase: 'purchases', retail: 'retailSales', wholesale: 'wholesaleSales' };

const colName = (name) => (window.getCollection ? window.getCollection(name) : name);

/**
 * Outstanding Manager - Manages due payments
 * @class OutstandingManager
 */
export class OutstandingManager {
    /**
     * Search and filter outstanding payments
     * Filters by customer name, amount, or date
     */
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

    /**
     * Filter outstanding payments by type
     * @param {'purchase'|'sale'} filter - Type of transactions to show
     * @param {Event} [evt] - Optional click event for button styling
     */
    static filterDue(filter, evt) {
        AppState.currentDueFilter = filter;
        
        document.querySelectorAll('#due .filter-btn').forEach(btn => btn.classList.remove('active'));
        if (evt) evt.target.classList.add('active');
        
        const searchInput = document.getElementById("outstandingSearchInput");
        if (searchInput) searchInput.value = '';
        
        this.renderDue();
    }

    /**
     * Render due payments list
     * Shows outstanding amounts for purchases or sales based on filter
     */
    static renderDue() {
        const currentDueFilter = AppState.currentDueFilter;
        const purchaseHistory = AppState.purchaseHistory || [];
        const salesHistory = AppState.salesHistory || [];  // wholesale
        const retailSalesHistory = AppState.retailSalesHistory || [];  // retail
        const container = document.getElementById("dueList");
        
        const dueTransactions = [];
        
        if (currentDueFilter === 'purchase') {
            purchaseHistory.forEach(purchase => {
                const pay = readPayment(purchase);
                const duePaid = pay.due;
                
                if (duePaid > 0 && !purchase.cleared) {
                    const totalPayable = pay.total;
                    const onlinePaid = pay.online;
                    const cashPaid = pay.cash;
                    const totalPaid = pay.paid;
                    
                    dueTransactions.push({
                        ...purchase,
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
            // Only retail sales - wholesale dues are on wholesale page
            retailSalesHistory.forEach(sale => {
                const pay = readPayment(sale);
                const dueReceived = pay.due;
                
                if (dueReceived > 0 && !sale.cleared) {
                    const totalReceivable = sale.total || 0;
                    const onlineReceived = pay.online;
                    const cashReceived = pay.cash;
                    const totalReceived = pay.paid;
                    
                    dueTransactions.push({
                        ...sale,
                        transactionType: 'retail',
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
            const dateA = a.timestamp || parseAnyBillDate(a.date)?.getTime() || 0;
            const dateB = b.timestamp || parseAnyBillDate(b.date)?.getTime() || 0;
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
            
            const itemColor = transaction.transactionType === 'purchase' ? '#007bff' : '#28a745';
            const billNumber = transaction.billNumber || transaction.id?.toString().substring(0, 8) || 'N/A';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: ${itemColor}; text-decoration: underline;" onclick="window.app.outstanding.showDetails('${transaction.id}', '${transaction.transactionType}')">#${billNumber}</span>${transaction.customerName ? `  <strong>${Helpers.escapeHtml(transaction.customerName)}</strong>` : ''}
                    <span style="color: ${headerColor}; font-weight: 700;">Due: ₹${Math.round(transaction.outstanding)}</span>
                </div>
                <div class="history-date">${Helpers.formatDate(transaction.date)}${transaction.createdByName ? ` • By: <strong>${Helpers.escapeHtml(transaction.createdByName)}</strong>` : ''}</div>
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
            const paymentAmount = round2(Number(paymentInput.value) || 0);
            
            if (paymentAmount <= 0) {
                UIManager.showToast('Please enter a valid payment amount');
                return;
            }
            
            let transaction;
            if (transactionType === 'purchase') {
                transaction = AppState.purchaseHistory.find(b => String(b.id) === String(transactionId));
            } else if (transactionType === 'retail') {
                transaction = AppState.retailSalesHistory.find(s => String(s.id) === String(transactionId));
            } else {
                // wholesale
                transaction = AppState.salesHistory.find(s => String(s.id) === String(transactionId));
            }
            
            if (!transaction) {
                UIManager.showToast('Error: Transaction not found');
                return;
            }
            
            const outstanding = readPayment(transaction).due;
            
            if (paymentAmount > outstanding + PAYMENT_TOLERANCE) {
                UIManager.showToast('Payment amount exceeds outstanding amount');
                return;
            }
            
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                UIManager.showToast('Internet required to record payment');
                return;
            }
            
            const payment = {
                amount: paymentAmount,
                date: Helpers.getCurrentDateTime(),
                recordedBy: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
            };
            
            // Server-side read-modify-write so concurrent payments from two devices can't overwrite each other
            const written = await this.applyPaymentTransaction(transactionType, transaction, paymentAmount, payment);
            Object.assign(transaction, written);
            
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
            if (error && error.code === 'exceeds-due') {
                UIManager.showToast(`Payment amount exceeds outstanding amount (₹${error.due})`);
                this.renderDue();
            } else if (OutstandingManager.isOfflineError(error)) {
                UIManager.showToast('Internet required to record payment');
            } else {
                UIManager.showToast('Error: ' + error.message);
            }
        }
    }

    static isOfflineError(error) {
        if (!error) return false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        const msg = String(error.message || '').toLowerCase();
        return error.code === 'unavailable' || msg.includes('offline') || msg.includes('network');
    }

    /**
     * Record a payment against a bill inside a Firestore transaction.
     * Re-reads the bill from the server, recomputes due from the fresh doc and
     * writes only payment fields (payment.*, payments[], and dueAmount if present).
     * @returns {Promise<Object>} The fields written (for patching local state)
     */
    static async applyPaymentTransaction(transactionType, bill, amount, entry) {
        const db = FirebaseService.db;
        const coll = db.collection(colName(COLLECTION_BY_TYPE[transactionType] || 'wholesaleSales'));
        // FirebaseService saves/updates bills at doc(String(bill.id)); legacy docs may only carry an `id` field
        let ref = coll.doc(String(bill.id));

        for (let attempt = 0; attempt < 2; attempt++) {
            const written = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) return null;
                const fresh = snap.data() || {};
                const pay = readPayment(fresh);

                if (amount > pay.due + PAYMENT_TOLERANCE) {
                    const err = new Error('Payment amount exceeds outstanding amount');
                    err.code = 'exceeds-due';
                    err.due = pay.due;
                    throw err;
                }

                const newCash = round2(pay.cash + amount);
                let newDue = round2(pay.due - amount);
                if (newDue < PAYMENT_TOLERANCE) newDue = 0;

                const update = {
                    payment: {
                        ...(fresh.payment && typeof fresh.payment === 'object' ? fresh.payment : {}),
                        online: pay.online,
                        cash: newCash,
                        due: newDue,
                        total: round2(pay.online + newCash)
                    },
                    payments: [...(Array.isArray(fresh.payments) ? fresh.payments : []), entry]
                };
                if (Object.prototype.hasOwnProperty.call(fresh, 'dueAmount')) {
                    update.dueAmount = newDue;
                }
                update.openDue = FirebaseService.billHasOpenDue(COLLECTION_BY_TYPE[transactionType] || 'wholesaleSales', { ...fresh, ...update });
                update.clientVersion = FirebaseService.CLIENT_VERSION;
                tx.update(ref, update);
                return update;
            });

            if (written) return written;

            if (attempt === 0) {
                const snap = await coll.where('id', '==', bill.id).limit(2).get();
                if (snap.size !== 1) break;
                ref = snap.docs[0].ref;
            }
        }
        throw new Error('Transaction not found');
    }

    static async markAsCleared(transactionId, transactionType) {
        try {
            let collection;
            if (transactionType === 'purchase') {
                collection = 'purchases';
            } else if (transactionType === 'retail') {
                collection = 'retailSales';
            } else {
                collection = 'wholesaleSales';
            }
            
            await db.collection(colName(collection)).doc(String(transactionId)).update({
                cleared: true,
                openDue: false,
                clientVersion: FirebaseService.CLIENT_VERSION,
                clearedAt: Helpers.getCurrentDateTime(),
                clearedBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
                clearedByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
            });
            
            // Update local state
            let transaction;
            if (transactionType === 'purchase') {
                transaction = AppState.purchaseHistory.find(b => String(b.id) === String(transactionId));
            } else if (transactionType === 'retail') {
                transaction = AppState.retailSalesHistory.find(s => String(s.id) === String(transactionId));
            } else {
                transaction = AppState.salesHistory.find(s => String(s.id) === String(transactionId));
            }
            if (transaction) transaction.cleared = true;
            
            UIManager.hapticFeedback('light');
            UIManager.showToast('✓ Outstanding marked as cleared');
            this.renderDue();
        } catch (error) {
            console.error('Error marking outstanding as cleared:', error);
            UIManager.showModal('Error: ' + error.message);
        }
    }

    static async showDetails(transactionId, transactionType) {
        if (transactionType === 'purchase') {
            const purchaseIndex = AppState.purchaseHistory.findIndex(b => String(b.id) === String(transactionId));
            if (purchaseIndex >= 0) {
                await window.app.history.viewBill(purchaseIndex, 'purchase');
            } else {
                UIManager.showModal('Purchase not found');
            }
        } else if (transactionType === 'retail') {
            const saleIndex = AppState.retailSalesHistory.findIndex(s => String(s.id) === String(transactionId));
            if (saleIndex >= 0) {
                await window.app.history.viewBill(saleIndex, 'retail');
            } else {
                UIManager.showModal('Retail sale not found');
            }
        } else {
            // wholesale
            const saleIndex = AppState.salesHistory.findIndex(s => String(s.id) === String(transactionId));
            if (saleIndex >= 0) {
                await window.app.wholesaleSales.reprintSale(saleIndex);
            } else {
                UIManager.showModal('Sale not found');
            }
        }
    }
}
