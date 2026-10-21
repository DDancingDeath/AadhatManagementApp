// Wholesale Sales Management Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { PrinterService } from '../services/printer.js';
import { AuditService } from '../services/audit.js';
import { Helpers } from '../utils/helpers.js';
import { computeStockShortfalls, formatShortfallMessage } from '../utils/stock-check.js';
import { attachOlderHistoryScroll } from '../ui/infinite-scroll.js';
import { isFullHistoryLoaded, historyLoadedFrom, formatWindowDate } from '../utils/history-window.js';
import { OutstandingManager } from './outstanding.js';
import {
    checkPaymentSplit, computeWholesaleTotals, dueNeedsName, NAME_REQUIRED_FOR_DUE_MESSAGE, paymentSplitMessage, readPayment, round2
} from '../utils/money.js';

const PAYMENT_TOLERANCE = 0.01;

/** Buttons disabled while a wholesale save/print is in flight */
const WHOLESALE_BUTTONS = '[onclick*="wholesaleSales.completeSale"], [onclick*="wholesaleSales.printWholesaleSale"]';

let wholesaleSaleItems = [];

/**
 * Id (and bill number, once issued) of the wholesale sale being entered, reused
 * by every save attempt so a retry cannot create a second bill (#70).
 * @type {{id: string, billNumber: (string|null)}|null}
 */
let pendingBill = null;

function ensurePendingBill() {
    if (!pendingBill) pendingBill = { id: Helpers.generateId(), billNumber: null };
    return pendingBill;
}

export class WholesaleSalesManager {
    static async generateBillNumber() {
        return Helpers.generateBillNumber('W', 'wholesaleSales');
    }

    static async pickContact() {
        await Helpers.pickContact('wholesaleCustomerName');
    }

    static loadItemsDropdown() {
        const select = document.getElementById('sellItem');
        if (!select) return;
        
        select.innerHTML = '<option value="">Select item</option>';

        // While stock is still being calculated in the background, list every item
        // (the dropdown is refreshed with the stock filter once it is ready)
        const stockReady = AppState.stockReady !== false;
        if (!stockReady) {
            select.options[0].textContent = 'Select item (stock updating…)';
        }

        // Load only items that have stock
        AppState.items.forEach(item => {
            // Check stock by itemId first, then by name
            const stockData = AppState.stock[item.id] || AppState.stock[item.name];
            
            // Only show items with positive stock quantity
            if (!stockReady || (stockData && stockData.quantity > 0)) {
                const opt = document.createElement('option');
                opt.value = item.name;
                const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
                opt.textContent = displayName;
                select.appendChild(opt);
            }
        });
    }

    static loadItemDetails() {
        const itemName = document.getElementById("sellItem")?.value;
        const availableStockEl = document.getElementById("availableStock");
        const avgRateEl = document.getElementById("avgPurchaseRate");
        const sellRateEl = document.getElementById("sellRate");
        
        if (!availableStockEl || !avgRateEl || !sellRateEl) return;
        
        if (!itemName) {
            availableStockEl.textContent = "-";
            avgRateEl.textContent = "-";
            sellRateEl.value = "";
            return;
        }
        
        // Find item to get itemId
        const item = AppState.items.find(i => i.name === itemName);
        if (!item) {
            availableStockEl.textContent = "-";
            avgRateEl.textContent = "-";
            sellRateEl.value = "";
            return;
        }
        
        // Check stock by itemId first, then by name
        const stockData = AppState.stock[item.id] || AppState.stock[itemName];

        if (AppState.stockReady === false) {
            availableStockEl.textContent = "updating…";
            avgRateEl.textContent = "-";
        } else if (!stockData) {
            availableStockEl.textContent = "0.00";
            avgRateEl.textContent = "-";
            sellRateEl.value = "";
            return;
        } else {
            availableStockEl.textContent = (stockData.quantity || 0).toFixed(2);
            avgRateEl.textContent = (stockData.rate || 0).toFixed(2);
        }
        
        // Check if item has predefined wholesale rates
        if (item.wholesaleRates && item.wholesaleRates.length > 0) {
            // Use first wholesale rate as default
            const firstValidRate = item.wholesaleRates.find(rate => rate && rate > 0);
            sellRateEl.value = firstValidRate || "";
        } else {
            sellRateEl.value = "";
        }
    }

    static async addToWholesaleBill() {
        const itemName = Helpers.getInputText('sellItem');
        const rate = Helpers.getInputNumber('sellRate');
        const quantity = Helpers.getInputNumber('sellQuantity');
        
        if (!itemName) {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        if (!quantity || quantity <= 0) {
            UIManager.showToast('Please enter a valid quantity');
            return;
        }
        
        // Find item
        const item = AppState.items.find(i => i.name === itemName);
        if (!item) {
            UIManager.showToast('Item not found');
            return;
        }
        
        // Check stock
        if (AppState.stockReady === false) {
            UIManager.showToast('Stock is still updating — please try again in a moment');
            return;
        }
        const stockData = AppState.stock[item.id] || AppState.stock[itemName];
        if (!stockData || stockData.quantity < quantity) {
            const available = stockData?.quantity || 0;
            UIManager.showToast(`Insufficient stock! Available: ${available.toFixed(1)}kg`);
            return;
        }
        
        const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        const total = Math.round(quantity * rate);
        ensurePendingBill();
        
        wholesaleSaleItems.push({
            itemId: item.id,
            name: displayName,
            rate,
            qty: quantity,
            total,
            timestamp: Date.now()
        });
        
        // Clear inputs
        document.getElementById('sellQuantity').value = '';
        
        this.renderWholesaleBill();
        UIManager.hapticFeedback();
    }

    static renderWholesaleBill() {
        const tbody = document.querySelector('#salesTable tbody');
        const totalEl = document.getElementById('salesTotalAmount');
        const expensesInput = document.getElementById('salesExpensesAmount');
        const profitEl = document.getElementById('salesProfitAmount');
        const profitPercentEl = document.getElementById('salesProfitPercent');
        
        if (!tbody || !totalEl) return;
        
        if (wholesaleSaleItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No items in bill</td></tr>';
            totalEl.textContent = '0';
            if (expensesInput) expensesInput.value = '0';
            if (profitEl) profitEl.textContent = '0';
            if (profitPercentEl) profitPercentEl.textContent = '0';
            this.updatePaymentTotal();
            return;
        }
        
        tbody.innerHTML = wholesaleSaleItems.map((item, index) => {
            return `
                <tr>
                    <td>${Helpers.escapeHtml(item.name)}</td>
                    <td>₹${item.rate.toFixed(2)}</td>
                    <td>${item.qty.toFixed(1)} kg</td>
                    <td>₹${Math.round(item.total)}</td>
                    <td><button onclick="window.app.wholesaleSales.removeWholesaleItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                </tr>
            `;
        }).join('');
        
        const { total: saleTotal } = this.computeTotals();
        totalEl.textContent = Math.round(saleTotal);
        
        this.updateProfitCalculation();
    }

    /**
     * Sale total, cost (stock average rates) and profit (sale − cost − expenses),
     * computed from the bill lines — the screen is display-only.
     * @returns {{total: number, cost: number, profit: number, profitPercent: number}}
     */
    static computeTotals() {
        return computeWholesaleTotals(wholesaleSaleItems, AppState.stock, Helpers.getInputNumber('salesExpensesAmount'));
    }

    static updateProfitCalculation() {
        const profitEl = document.getElementById('salesProfitAmount');
        const profitPercentEl = document.getElementById('salesProfitPercent');
        const { profit, profitPercent } = this.computeTotals();
        
        if (profitEl) profitEl.textContent = Math.round(profit);
        if (profitPercentEl) profitPercentEl.textContent = profitPercent.toFixed(1);
        this.updatePaymentTotal();
    }

    /**
     * Cash / online / due typed on the wholesale form
     * @returns {{cash: number, online: number, due: number}}
     */
    static readPaymentSplit() {
        return {
            online: round2(Helpers.getInputNumber('wholesaleOnlinePayment')),
            cash: round2(Helpers.getInputNumber('wholesaleCashPayment')),
            due: round2(Helpers.getInputNumber('wholesaleDueAmount'))
        };
    }

    /** Refresh "Total Received" and what is not split yet. */
    static updatePaymentTotal() {
        const split = this.readPaymentSplit();
        const receivedEl = document.getElementById('wholesaleTotalReceived');
        if (receivedEl) receivedEl.textContent = Math.round(split.cash + split.online);
        Helpers.showSplitRemaining('wholesaleSplitRemaining', checkPaymentSplit(this.computeTotals().total, split));
    }

    /**
     * Tick Online / Cash / Due to put the whole bill in that one field
     * (same as the retail sale form).
     * @param {'online'|'cash'|'due'} type
     */
    static fillReceivableAmount(type) {
        const { total } = this.computeTotals();
        const fields = { online: 'wholesaleOnlinePayment', cash: 'wholesaleCashPayment', due: 'wholesaleDueAmount' };
        const boxes = { online: 'wholesaleOnlineCheckbox', cash: 'wholesaleCashCheckbox', due: 'wholesaleDueCheckbox' };
        if (document.getElementById(boxes[type])?.checked) {
            Object.keys(fields).forEach(key => {
                const input = document.getElementById(fields[key]);
                if (input) input.value = key === type ? Math.round(total) : '0';
                if (key !== type) {
                    const box = document.getElementById(boxes[key]);
                    if (box) box.checked = false;
                }
            });
        }
        this.updatePaymentTotal();
    }

    /** One tap: put whatever is not yet received (total − cash − online) in Due. */
    static putRestInDue() {
        const { total } = this.computeTotals();
        const { cash, online } = this.readPaymentSplit();
        const rest = round2(total - cash - online);
        if (rest < 0) {
            UIManager.showToast(paymentSplitMessage(checkPaymentSplit(total, { cash, online })));
            return;
        }
        const dueInput = document.getElementById('wholesaleDueAmount');
        if (dueInput) dueInput.value = rest;
        const dueCheckbox = document.getElementById('wholesaleDueCheckbox');
        if (dueCheckbox) dueCheckbox.checked = rest > 0;
        this.updatePaymentTotal();
    }

    static resetPaymentFields() {
        ['wholesaleOnlinePayment', 'wholesaleCashPayment', 'wholesaleDueAmount'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        ['wholesaleOnlineCheckbox', 'wholesaleCashCheckbox', 'wholesaleDueCheckbox'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        this.updatePaymentTotal();
    }

    /** Current bill lines (for draft recovery / tests). */
    static getItems() {
        return wholesaleSaleItems;
    }

    static setItems(items) {
        wholesaleSaleItems = items || [];
        if (wholesaleSaleItems.length === 0) pendingBill = null;
    }

    /** @returns {{id: string, billNumber: (string|null)}|null} */
    static getPendingBill() {
        return pendingBill ? { ...pendingBill } : null;
    }

    static removeWholesaleItem(index) {
        wholesaleSaleItems.splice(index, 1);
        this.renderWholesaleBill();
        UIManager.hapticFeedback();
    }

    static async completeSale(options = {}) {
        return Helpers.runExclusive('wholesale', WHOLESALE_BUTTONS, () => this._completeSale(options));
    }

    // Unguarded save; callers must hold the 'wholesale' lock.
    // options.onWriteIssued(saleData) is called as soon as the write is issued.
    static async _completeSale(options = {}) {
        if (wholesaleSaleItems.length === 0) {
            UIManager.showToast('Please add items to the bill');
            return;
        }

        // Warn (but don't hard-block) when a sale exceeds recorded stock.
        // Mirrors retail-sale.completeSale — wholesale lines use { itemId,
        // name, qty } so the shared helper resolves them the same way.
        const shortfalls = computeStockShortfalls(wholesaleSaleItems);
        if (shortfalls.length > 0) {
            const message = formatShortfallMessage(shortfalls);
            const proceed = await UIManager.showModal(message, 'Stock Shortfall', true);
            if (!proceed) {
                return;
            }
        }

        const customerName = Helpers.getInputText('wholesaleCustomerName');
        const comments = Helpers.getInputText('salesComments');
        const expenses = round2(Helpers.getInputNumber('salesExpensesAmount'));
        
        // Total and profit come from the bill lines, never from the text on screen
        const { total, profit, profitPercent } = this.computeTotals();
        const { cash, online, due } = this.readPaymentSplit();
        
        if (cash === 0 && online === 0 && due === 0) {
            UIManager.showToast('Please enter at least one payment method (Cash, Online, or Due)');
            return;
        }
        if (dueNeedsName(due, customerName)) {
            UIManager.showToast(NAME_REQUIRED_FOR_DUE_MESSAGE);
            document.getElementById('wholesaleCustomerName')?.focus();
            return;
        }
        const split = checkPaymentSplit(total, { cash, online, due });
        if (!split.ok) {
            Helpers.showSplitRemaining('wholesaleSplitRemaining', split);
            UIManager.showToast(paymentSplitMessage(split));
            return;
        }
        
        try {
            const pending = ensurePendingBill();
            if (!pending.billNumber) pending.billNumber = await Helpers.generateBillNumber('W', 'wholesaleSales');
            
            const saleData = {
                id: pending.id,
                billNumber: pending.billNumber,
                customerName,
                items: wholesaleSaleItems.map(item => ({
                    itemId: item.itemId,
                    name: item.name,
                    rate: item.rate,
                    quantity: item.qty,
                    total: item.total
                })),
                total,
                expenses,
                profit,
                profitPercent,
                comments,
                type: 'wholesale',
                // Top-level copies keep readPayment(), the cash drawer and Outstanding in step
                onlinePayment: online,
                cashPayment: cash,
                dueAmount: due,
                payment: {
                    online,
                    cash,
                    due,
                    total: round2(online + cash + due)
                },
                date: Helpers.getCurrentDateTime(),
                timestamp: Date.now(),
                createdBy: AppState.currentUser?.uid || 'unknown',
                createdByName: AppState.userName || 'User',
                source: 'sales-tab'
            };
            
            const writePromise = FirebaseService.saveWholesaleSale(saleData, { merge: true });
            if (typeof options.onWriteIssued === 'function') {
                options.onWriteIssued(saleData);
            }
            await writePromise;
            
            Helpers.runInBackground([
                () => AuditService.log(AuditService.ACTIONS.CREATE_SALE, {
                    billNumber: saleData.billNumber,
                    total: saleData.total,
                    customerName: saleData.customerName || 'N/A',
                    itemCount: saleData.items.length,
                    source: 'sales-tab'
                })
            ]);
            
            // Update customer options
            this.updateWholesaleCustomerOptions(customerName);
            
            // Clear bill
            pendingBill = null;
            wholesaleSaleItems = [];
            document.getElementById('wholesaleCustomerName').value = '';
            document.getElementById('sellQuantity').value = '';
            document.getElementById('sellRate').value = '';
            document.getElementById('salesComments').value = '';
            document.getElementById('salesExpensesAmount').value = '0';
            this.resetPaymentFields();
            
            // Clear stock details
            document.getElementById('availableStock').textContent = '-';
            document.getElementById('avgPurchaseRate').textContent = '-';
            
            this.renderWholesaleBill();
            this.renderSalesHistory();
            
            // Stock is not recalculated here: the wholesaleSales realtime listener
            // fires on the local write, recalculates AppState.stock and refreshes
            // this dropdown. The item detail fields were cleared above so no stale
            // per-item stock is shown in the meantime.
            
            UIManager.showToast('✓ Sale completed successfully');
            UIManager.hapticFeedback();
            return saleData;
        } catch (error) {
            console.error('Error completing sale:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static async printWholesaleSale() {
        if (Helpers.isBusy('wholesale')) return;
        if (wholesaleSaleItems.length === 0) {
            UIManager.showToast('No items to print');
            return;
        }
        
        let printPromise = null;
        try {
            // Print the exact sale being saved, as soon as its write is issued
            const savedSale = await Helpers.runExclusive('wholesale', WHOLESALE_BUTTONS, () => this._completeSale({
                onWriteIssued: (sale) => { printPromise = PrinterService.printWholesaleSale(sale); }
            }));
            
            if (!printPromise) return;
            await printPromise;
            
            if (savedSale) {
                UIManager.showToast('Sale saved and printed!');
            }
        } catch (error) {
            console.error('Print error:', error);
            UIManager.showToast('Error: ' + (error?.message || error));
        }
    }

    static shareViaWhatsApp() {
        if (wholesaleSaleItems.length === 0) {
            UIManager.showToast('No items to share');
            return;
        }
        
        const customerName = Helpers.getInputText('wholesaleCustomerName');
        const total = wholesaleSaleItems.reduce((sum, item) => sum + item.total, 0);
        const expenses = Helpers.getInputInt('salesExpensesAmount');
        const profit = Helpers.getElementInt('salesProfitAmount');
        const comments = Helpers.getInputText('salesComments');
        
        let message = `*Sale Bill*\n\n`;
        message += `Customer: ${customerName}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-IN')}\n`;
        if (comments) message += `Note: ${comments}\n`;
        message += `\n*Items:*\n`;
        
        wholesaleSaleItems.forEach(item => {
            message += `${item.name}\n`;
            message += `  Rate: ₹${item.rate.toFixed(2)} × ${item.qty.toFixed(1)}kg = ₹${Math.round(item.total)}\n`;
        });
        
        message += `\n*Total: ₹${Math.round(total)}*`;
        if (expenses > 0) message += `\nExpenses: ₹${Math.round(expenses)}`;
        if (profit !== 0) message += `\nProfit: ₹${Math.round(profit)}`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    static filterSalesTab(view, evt) {
        const buttons = document.querySelectorAll('#wholesale-sales .filter-btn');
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
            datalist.innerHTML = uniqueCustomers.map(name => `<option value="${Helpers.escapeHtml(name)}">`).join('');
        }
    }

    static async recordPayment(saleId) {
        return Helpers.runExclusive('due-payment', '[data-record-payment]', () => this._recordPayment(saleId));
    }

    static async _recordPayment(saleId) {
        const salesHistory = AppState.salesHistory;
        const sale = salesHistory.find(s => s.id == saleId);
        if (!sale) {
            UIManager.showToast('Error: Sale not found');
            return;
        }
        
        const paymentInput = document.getElementById(`payment_${saleId}`);
        const paymentAmount = round2(Number(paymentInput?.value) || 0);
        
        if (paymentAmount <= 0) {
            UIManager.showToast('Please enter a valid payment amount');
            return;
        }
        
        const outstanding = readPayment(sale).due;
        
        if (paymentAmount > outstanding + PAYMENT_TOLERANCE) {
            UIManager.showToast('Payment amount exceeds outstanding amount');
            return;
        }
        
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            UIManager.showToast('Internet required to record payment');
            return;
        }
        
        const payment = {
            id: OutstandingManager.paymentEntryId(paymentInput, paymentAmount),
            amount: paymentAmount,
            date: Helpers.getCurrentDateTime(),
            recordedBy: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };
        
        try {
            // Same server-side transaction as the Due screen, so a payment recorded
            // concurrently on another device is never overwritten by a full-document write
            const written = await OutstandingManager.applyPaymentTransaction('wholesale', sale, paymentAmount, payment);
            Object.assign(sale, written);
            
            OutstandingManager.clearPaymentEntryId(paymentInput);
            if (paymentInput) paymentInput.value = '';
            this.renderSalesOutstanding();
            this.renderSalesHistory();
            window.app?.outstanding?.renderDue?.();
            UIManager.showToast(`✓ Payment of ₹${paymentAmount} recorded`);
        } catch (error) {
            console.error('Error recording payment:', error);
            if (error && error.code === 'exceeds-due') {
                UIManager.showToast(`Payment amount exceeds outstanding amount (₹${error.due})`);
                this.renderSalesOutstanding();
            } else if (OutstandingManager.isOfflineError(error)) {
                UIManager.showToast('Internet required to record payment');
            } else {
                UIManager.showToast('Error: ' + error.message);
            }
        }
    }

    static async markSaleAsCleared(saleId) {
        const checkbox = document.getElementById(`clear_${saleId}`);
        if (checkbox) checkbox.checked = false;
        // Same honest clearing as Outstanding (#104): received in cash/online, or written off with a reason
        const cleared = await OutstandingManager.markAsCleared(saleId, 'wholesale');
        if (cleared) this.renderSalesHistory();
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
            })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        if (outstandingSales.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No outstanding payments</p>';
            return;
        }

        container.innerHTML = '';

        outstandingSales.forEach(sale => {
                const div = document.createElement("div");
                div.className = "history-item";
                
                const billNumber = sale.billNumber || sale.id;
                div.innerHTML = `
                    <div class="history-header">
                        <span><span style="cursor: pointer; color: #22c55e; text-decoration: underline;" onclick="window.app.wholesaleSales.reprintSaleById('${Helpers.escapeJsAttr(sale.id)}')">#${Helpers.escapeHtml(billNumber)}</span>${sale.customerName ? `  <strong>${Helpers.escapeHtml(sale.customerName)}</strong>` : ''}</span>
                        <span style="color: #dc3545; font-weight: 700;">Due: ₹${Math.round(sale.outstanding)}</span>
                    </div>
                    <div class="history-date">${Helpers.escapeHtml(sale.date)}${sale.createdByName ? ` • By: <strong>${Helpers.escapeHtml(sale.createdByName)}</strong>` : ''}</div>
                    <div style="background: #d1ecf1; border-left: 4px solid #22c55e; padding: 12px; margin: 12px 0; border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span>Total Receivable:</span>
                            <strong>₹${Math.round(sale.totalAmount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span>Received:</span>
                            <strong>₹${Math.round(sale.paidAmount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-top: 2px solid #17a2b8; padding-top: 6px; margin-top: 6px;">
                            <span style="font-weight: 600;">Outstanding:</span>
                            <strong style="color: #dc3545; font-size: 16px;">₹${Math.round(sale.outstanding)}</strong>
                        </div>
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #17a2b8;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <label style="font-weight: 500;">Payment (₹):</label>
                                <input type="number" inputmode="decimal" id="payment_${Helpers.escapeHtml(sale.id)}" placeholder="Enter amount" style="flex: 1; padding: 6px; border: 1px solid #17a2b8; border-radius: 4px;" />
                                <button data-record-payment onclick="window.app.wholesaleSales.recordPayment('${Helpers.escapeJsAttr(sale.id)}')" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Record</button>
                            </div>
                            <div style="display: flex; align-items: center;">
                                <input type="checkbox" id="clear_${Helpers.escapeHtml(sale.id)}" onchange="window.app.wholesaleSales.markSaleAsCleared('${Helpers.escapeJsAttr(sale.id)}')" style="margin-right: 8px; transform: scale(1.2);" />
                                <label for="clear_${Helpers.escapeHtml(sale.id)}" style="cursor: pointer; font-weight: 500;">Mark as Cleared</label>
                            </div>
                        </div>
                    </div>
                `;
                
                container.appendChild(div);
        });
    }

    static renderSalesHistory() {
        const salesHistory = AppState.salesHistory;
        const container = document.getElementById("salesHistoryList");
        
        const salesTabHistory = salesHistory
            .filter(sale => sale.source === 'sales-tab')
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        // Older sales load one month at a time as the user scrolls
        attachOlderHistoryScroll(container, { noun: 'sales', onLoaded: () => this.renderSalesHistory() });

        if (salesTabHistory.length === 0) {
            const message = isFullHistoryLoaded() ? 'No sales yet' : `No sales since ${formatWindowDate(historyLoadedFrom())}`;
            container.innerHTML = `<p style="text-align: center; color: #888; margin-top: 40px;">${Helpers.escapeHtml(message)}</p>`;
            return;
        }

        container.innerHTML = "";

        salesTabHistory.forEach((sale) => {
            const div = document.createElement("div");
            div.className = "history-item";
            
            const totalWeight = sale.items.reduce((sum, item) => sum + (item.qty || item.quantity || 0), 0);
            
            const paymentParts = [];
            if (sale.payment) {
                const totalReceived = (sale.payment.online || 0) + (sale.payment.cash || 0);
                if (totalReceived > 0) paymentParts.push(`Received: ₹${Math.round(totalReceived)}`);
                if (sale.payment.due > 0) paymentParts.push(`Due: ₹${Math.round(sale.payment.due)}`);
            }
            const paymentHTML = paymentParts.length > 0 ? `
                <div class="history-payment">
                    ${paymentParts.join(' | ')}
                </div>
            ` : '';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: #22c55e; text-decoration: underline;" onclick="window.app.wholesaleSales.reprintSaleById('${Helpers.escapeJsAttr(sale.id)}')">#${Helpers.escapeHtml(sale.billNumber || sale.id)}</span>${sale.customerName ? `<strong>${Helpers.escapeHtml(sale.customerName)}</strong>` : ''}
                    <span style="color: #28a745; font-weight: 700;">₹ ${Math.round(sale.total)}</span>
                </div>
                <div class="history-date">${Helpers.escapeHtml(sale.date)}${sale.createdByName ? ` • By: <strong>${Helpers.escapeHtml(sale.createdByName)}</strong>` : ''}</div>
                <div class="history-summary">
                    ${Helpers.escapeHtml(sale.items.map(item => item.name).join(', '))}
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
        
        // Store index and type for edit/delete functionality
        window.currentBillIndex = index;
        window.currentBillId = sale.id;
        window.currentBillType = 'wholesale';
        
        const itemsHTML = sale.items.map(item => {
            const qty = item.qty || item.quantity || 0;
            return `
                <tr>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">${Helpers.escapeHtml(item.name)}</td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${Helpers.escapeHtml(item.rate)}</td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${Helpers.escapeHtml(qty)}</td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>${Math.round(item.total)}</strong></td>
                </tr>
            `;
        }).join('');
        
        const payment = sale.payment || {};
        const paymentHTML = (payment.online > 0 || payment.cash > 0 || payment.due > 0) ? `
            <div style="background: white; padding: 14px; border-radius: 10px; border: 1px solid #dee2e6; margin-top: 12px;">
                <h4 style="margin: 0 0 12px 0; font-size: 15px; color: #212529;">Payment Details</h4>
                ${payment.online > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                        <span>Online:</span>
                        <span style="display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; background: #cfe2ff; color: #084298;">₹${Math.round(payment.online)}</span>
                    </div>
                ` : ''}
                ${payment.cash > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                        <span>Cash:</span>
                        <span style="display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; background: #d1e7dd; color: #0f5132;">₹${Math.round(payment.cash)}</span>
                    </div>
                ` : ''}
                ${payment.due > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                        <span>Due:</span>
                        <span style="display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; background: #fff3cd; color: #997404;">₹${Math.round(payment.due)}</span>
                    </div>
                ` : ''}
            </div>
        ` : '';
        
        const paymentsHistoryHTML = sale.payments && sale.payments.length > 0 ? `
            <div style="background: #e7f5e9; padding: 14px; border-radius: 10px; border: 1px solid #c3e6c3; margin-top: 12px;">
                <h4 style="margin: 0 0 12px 0; font-size: 15px; color: #155724;">Payment History</h4>
                ${sale.payments.map(p => `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                        <span>• ${Helpers.escapeHtml(p.date)}${p.recordedBy ? ` by ${Helpers.escapeHtml(p.recordedBy)}` : ''}${p.kind === 'writeOff' ? ` — written off: ${Helpers.escapeHtml(p.reason || '')}` : ''}</span>
                        <strong>₹${Math.round(p.amount)}</strong>
                    </div>
                `).join('')}
            </div>
        ` : '';
        
        const billNumber = sale.billNumber || sale.id;
        
        const content = `
            <div style="padding: 16px; max-width: 100%;">
                <div class="bill-info-section">
                    <div class="bill-info-row">
                        <div class="bill-info-label">Bill No:</div>
                        <div class="bill-info-value"><strong style="color: #28a745;">#${Helpers.escapeHtml(billNumber)}</strong></div>
                    </div>
                    <div class="bill-info-row">
                        <div class="bill-info-label">Date:</div>
                        <div class="bill-info-value">${Helpers.escapeHtml(sale.date)}</div>
                    </div>
                    ${sale.createdByName ? `
                        <div class="bill-info-row">
                            <div class="bill-info-label">Created By:</div>
                            <div class="bill-info-value">${Helpers.escapeHtml(sale.createdByName)}</div>
                        </div>
                    ` : ''}
                    ${sale.customerName ? `
                        <div class="bill-info-row">
                            <div class="bill-info-label">Customer:</div>
                            <div class="bill-info-value"><strong>${Helpers.escapeHtml(sale.customerName)}</strong></div>
                        </div>
                    ` : ''}
                </div>
                
                ${sale.comments ? `
                    <div style="margin-bottom: 12px; padding: 10px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                        <span style="color: #6c757d; font-size: 14px;">Comments:</span>
                        <div style="font-size: 14px; color: #212529; margin-top: 4px;">${Helpers.escapeHtml(sale.comments)}</div>
                    </div>
                ` : ''}
                
                <h4 style="margin: 16px 0 12px 0; color: #212529; font-size: 15px;">Sale Items</h4>
                <table style="width: 100%; border-collapse: collapse; background: white; margin-bottom: 16px;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 10px 8px; text-align: left; font-size: 14px; font-weight: 600; color: #495057;">Item</th>
                            <th style="padding: 10px 8px; text-align: center; font-size: 14px; font-weight: 600; color: #495057;">Rate (₹)</th>
                            <th style="padding: 10px 8px; text-align: center; font-size: 14px; font-weight: 600; color: #495057;">Qty (kg)</th>
                            <th style="padding: 10px 8px; text-align: right; font-size: 14px; font-weight: 600; color: #495057;">Total (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                </table>
                
                <div style="background: white; padding: 14px; border-radius: 10px; border: 1px solid #dee2e6;">
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px;">
                        <span style="font-weight: 600;">Sale Total:</span>
                        <strong style="font-size: 17px; color: #28a745;">₹${Math.round(sale.total)}</strong>
                    </div>
                </div>
                
                ${paymentHTML}
                ${paymentsHistoryHTML}
            </div>
        `;
        
        document.getElementById('billDetailsContent').innerHTML = content;
        document.getElementById('billDetailsOverlay').classList.add('active');
    }

    static async reprintSaleById(saleId) {
        const salesHistory = AppState.salesHistory;
        const index = salesHistory.findIndex(s => String(s.id) === String(saleId));
        if (index === -1) {
            UIManager.showModal('Sale not found');
            return;
        }
        await this.reprintSale(index);
    }
}
