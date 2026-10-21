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
import { parseAnyBillDate, todayLocalISO } from '../utils/dates.js';
import { checkPaymentSplit, directionFor } from '../utils/due-payments.js';
import { CashManagementManager } from './cash-management.js';

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
                    <span style="cursor: pointer; color: ${itemColor}; text-decoration: underline;" onclick="window.app.outstanding.showDetails('${Helpers.escapeJsAttr(transaction.id)}', '${Helpers.escapeJsAttr(transaction.transactionType)}')">#${Helpers.escapeHtml(billNumber)}</span>${transaction.customerName ? `  <strong>${Helpers.escapeHtml(transaction.customerName)}</strong>` : ''}
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
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <label style="flex-shrink: 0;">${isPurchase ? 'Pay' : 'Received'}:</label>
                        <input type="number" inputmode="decimal" min="0" id="payment_${Helpers.escapeHtml(transaction.id)}" placeholder="Cash ₹" aria-label="Cash amount" style="flex: 1; min-width: 80px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
                        <input type="number" inputmode="decimal" min="0" id="paymentOnline_${Helpers.escapeHtml(transaction.id)}" placeholder="Online ₹" aria-label="Online amount" style="flex: 1; min-width: 80px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
                        <button onclick="window.app.outstanding.recordPayment('${Helpers.escapeJsAttr(transaction.id)}', '${Helpers.escapeJsAttr(transaction.transactionType)}')" style="background-color: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">Record</button>
                    </div>
                    <div style="margin-top: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" ${transaction.cleared ? 'checked' : ''} onchange="window.app.outstanding.markAsCleared('${Helpers.escapeJsAttr(transaction.id)}', '${Helpers.escapeJsAttr(transaction.transactionType)}')" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" />
                            <span style="font-size: 14px; color: #333; font-weight: 600;">Mark as Cleared</span>
                        </label>
                    </div>
                </div>
            `;
            
            container.appendChild(div);
        });
    }

    static async recordPayment(transactionId, transactionType) {
        // Cash and online parts (#107): only the cash part reaches the drawer
        const paymentInput = document.getElementById(`payment_${transactionId}`);
        const onlineInput = document.getElementById(`paymentOnline_${transactionId}`);
        const cash = Number(paymentInput?.value) || 0;
        const online = Number(onlineInput?.value) || 0;
        const ok = await this.recordDuePayment({ billType: transactionType, billId: transactionId, cash, online });
        if (ok) {
            if (paymentInput) paymentInput.value = '';
            if (onlineInput) onlineInput.value = '';
        }
    }

    /** Bill of a type ('purchase' | 'retail' | 'wholesale') from AppState. */
    static findBill(billType, billId) {
        const list = billType === 'purchase' ? AppState.purchaseHistory
            : billType === 'retail' ? AppState.retailSalesHistory
                : AppState.salesHistory;
        return (list || []).find(b => String(b.id) === String(billId)) || null;
    }

    /**
     * The one way to record a due payment (#98), used by Outstanding and the
     * Cash tab: reduces the bill's due (payment.due + dueAmount + payments[])
     * and, when a cash session is open today, adds the payment to it as a
     * drawer leg — all in one transaction.
     * @param {Object} args
     * @param {'purchase'|'retail'|'wholesale'} args.billType
     * @param {string} args.billId
     * @param {number} args.cash Cash part
     * @param {number} [args.online=0] Online part
     * @param {string} [args.note]
     * @returns {Promise<boolean>} true when recorded
     */
    static async recordDuePayment({ billType, billId, cash, online = 0, note = '' }) {
        try {
            const transaction = this.findBill(billType, billId);
            if (!transaction) {
                UIManager.showToast('Error: Transaction not found');
                return false;
            }

            const outstanding = readPayment(transaction).due;
            const split = checkPaymentSplit(cash, online, outstanding, PAYMENT_TOLERANCE);
            if (!split.ok) {
                UIManager.showToast(split.error === 'exceeds-due'
                    ? 'Payment amount exceeds outstanding amount'
                    : 'Please enter a valid payment amount');
                return false;
            }

            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                UIManager.showToast('Internet required to record payment');
                return false;
            }

            const entry = {
                amount: split.total,
                date: Helpers.getCurrentDateTime(),
                recordedBy: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
            };
            if (note) entry.note = note;

            // Server-side read-modify-write so concurrent payments from two devices can't overwrite each other
            const written = await this.applyPaymentTransaction(billType, transaction, { cash: split.cash, online: split.online }, entry);
            Object.assign(transaction, written);

            this.refreshAfterPayment();

            // Log audit entry
            await AuditService.log(AuditService.ACTIONS.UPDATE_PAYMENT, {
                billNumber: transaction.billNumber || 'N/A',
                paymentAmount: split.total,
                cash: split.cash,
                online: split.online,
                transactionType: billType,
                customer: transaction.customerName || transaction.customer || transaction.supplier || 'N/A'
            });

            UIManager.showToast(`✓ Payment of ₹${split.total} recorded`);
            UIManager.hapticFeedback('light');
            return true;
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
            return false;
        }
    }

    /** Re-render every screen that shows dues or today's money. */
    static refreshAfterPayment() {
        this.renderDue();
        const app = typeof window !== 'undefined' ? window.app : null;
        try {
            app?.wholesaleSales?.renderOutstanding?.();
            if (document.getElementById('todayTotalIn')) app?.day?.loadTodayData?.();
            if (CashManagementManager.todaySession) {
                CashManagementManager.calculateTodayTransactions()
                    .then(() => CashManagementManager.updateUI())
                    .catch(e => console.error('Cash refresh after payment failed:', e));
            }
        } catch (e) {
            console.error('Refresh after payment failed:', e);
        }
    }

    static isOfflineError(error) {
        if (!error) return false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        const msg = String(error.message || '').toLowerCase();
        return error.code === 'unavailable' || msg.includes('offline') || msg.includes('network');
    }

    /**
     * Today's open cash session, if any (one small query when the Cash tab
     * hasn't loaded it). Failures just mean "no drawer leg".
     * @returns {Promise<?string>} session id
     */
    static async findOpenSessionId() {
        const today = todayLocalISO();
        const local = CashManagementManager.todaySession;
        if (local && local.date === today) return local.signedOut ? null : String(local.id);
        try {
            const sessions = await FirebaseService.loadCashSessionsForDate(today);
            const open = sessions.find(s => !s.signedOut);
            return open ? String(open.id) : null;
        } catch (e) {
            console.warn('Could not look up today\'s cash session:', e?.message || e);
            return null;
        }
    }

    /**
     * Record a payment against a bill inside a Firestore transaction.
     * Re-reads the bill from the server, recomputes due from the fresh doc and
     * writes only payment fields (payment.*, payments[], and dueAmount if
     * present). When today's cash session is open, the same payment (same id)
     * is added to its duePayments in the same transaction.
     * @param {string} transactionType 'purchase' | 'retail' | 'wholesale'
     * @param {Object} bill
     * @param {number|{cash: number, online: number}} amount A number = all cash
     * @param {Object} entry payments[] entry (amount/date/recordedBy…)
     * @returns {Promise<Object>} The bill fields written (for patching local state)
     */
    static async applyPaymentTransaction(transactionType, bill, amount, entry) {
        const parts = typeof amount === 'number' ? { cash: amount, online: 0 } : amount;
        const cash = round2(parts.cash || 0);
        const online = round2(parts.online || 0);
        const total = round2(cash + online);
        const at = Date.now();
        const fullEntry = {
            ...entry,
            id: entry.id || Helpers.generateId(),
            amount: total,
            cash,
            online,
            at,
            recordedById: AppState.currentUser ? AppState.currentUser.uid : 'unknown'
        };

        const db = FirebaseService.db;
        const coll = db.collection(colName(COLLECTION_BY_TYPE[transactionType] || 'wholesaleSales'));
        // FirebaseService saves/updates bills at doc(String(bill.id)); legacy docs may only carry an `id` field
        let ref = coll.doc(String(bill.id));
        const sessionId = await this.findOpenSessionId();
        const sessionRef = sessionId ? FirebaseService.cashSessionRef(sessionId) : null;
        const today = todayLocalISO();
        let legWritten = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            const written = await db.runTransaction(async (tx) => {
                legWritten = null;
                const snap = await tx.get(ref);
                const sessionSnap = sessionRef ? await tx.get(sessionRef) : null;
                if (!snap.exists) return null;
                const fresh = snap.data() || {};
                const pay = readPayment(fresh);

                if (total > pay.due + PAYMENT_TOLERANCE) {
                    const err = new Error('Payment amount exceeds outstanding amount');
                    err.code = 'exceeds-due';
                    err.due = pay.due;
                    throw err;
                }

                const newCash = round2(pay.cash + cash);
                const newOnline = round2(pay.online + online);
                let newDue = round2(pay.due - total);
                if (newDue < PAYMENT_TOLERANCE) newDue = 0;

                const update = {
                    payment: {
                        ...(fresh.payment && typeof fresh.payment === 'object' ? fresh.payment : {}),
                        online: newOnline,
                        cash: newCash,
                        due: newDue,
                        total: round2(newOnline + newCash)
                    },
                    payments: [...(Array.isArray(fresh.payments) ? fresh.payments : []), fullEntry]
                };
                if (Object.prototype.hasOwnProperty.call(fresh, 'dueAmount')) {
                    update.dueAmount = newDue;
                }
                update.openDue = FirebaseService.billHasOpenDue(COLLECTION_BY_TYPE[transactionType] || 'wholesaleSales', { ...fresh, ...update });
                update.clientVersion = FirebaseService.CLIENT_VERSION;
                tx.update(ref, update);

                const session = sessionSnap && sessionSnap.exists ? sessionSnap.data() : null;
                if (session && !session.signedOut && session.date === today) {
                    const leg = {
                        id: fullEntry.id,
                        billId: String(fresh.id ?? bill.id),
                        billType: transactionType,
                        billNumber: fresh.billNumber || bill.billNumber || '',
                        type: directionFor(transactionType),
                        customer: fresh.customerName || bill.customerName || 'N/A',
                        amount: total,
                        cash,
                        online,
                        // Older app versions count only method 'cash' legs (by amount)
                        method: cash > 0 && online > 0 ? 'split' : (cash > 0 ? 'cash' : 'online'),
                        notes: entry.note || '',
                        timestamp: new Date(at).toISOString(),
                        recordedBy: fullEntry.recordedBy || 'Unknown'
                    };
                    tx.update(sessionRef, { duePayments: [...(Array.isArray(session.duePayments) ? session.duePayments : []), leg] });
                    legWritten = leg;
                }
                return update;
            });

            if (written) {
                const local = CashManagementManager.todaySession;
                if (legWritten && local && String(local.id) === sessionId) {
                    local.duePayments = [...(local.duePayments || []).filter(l => l.id !== legWritten.id), legWritten];
                }
                return written;
            }

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
