/**
 * @fileoverview History Management Module
 * Handles bill history, sales history, and transaction records
 * Provides both card and table view modes for displaying history
 * @module modules/history
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { AuditService } from '../services/audit.js';
import { Helpers } from '../utils/helpers.js';
import { attachOlderHistoryScroll } from '../ui/infinite-scroll.js';
import { PrinterService } from '../services/printer.js';
import {
    ensureHistoryFrom, isFullHistoryLoaded, historyLoadedFrom, formatWindowDate, findBillIndex,
    renderStaleHistoryHint, rangeStatus, retryRange, applyRangeState
} from '../utils/history-window.js';
import {
    filterHistoryBills, resolveHistoryRange, normalizeHistoryFilter, formatHistoryRange, billDateOf,
    HISTORY_FILTER_KEY, HISTORY_TYPES
} from '../utils/history-filters.js';
import { buildReprintPayload, buildBillShareText } from '../utils/bill-share.js';
import { todayLocalISO } from '../utils/dates.js';
import { whatsAppShareUrl } from '../utils/release-info.js';

/**
 * Stable reference to a bill for inline onclick handlers. Indices into the
 * history arrays shift when live sync or older-history loads add records, so
 * handlers pass the bill id instead ("id:<id>"); viewBill resolves it.
 * @param {Object} bill
 * @returns {string} JS-and-HTML-escaped string literal body
 */
const billRef = (bill) => Helpers.escapeJsAttr(`id:${bill.id}`);

/**
 * History Manager - Manages transaction history
 * @class HistoryManager
 */
export class HistoryManager {
    /**
     * Current view mode for history display
     * @type {'card'|'table'}
     * @static
     */
    static viewMode = 'card';

    /** Search term of the last render (infinite scroll is off while searching). */
    static activeSearch = '';

    /** True while "Search older bills" is loading full history. */
    static searchingOlder = false;

    /** Bills rendered per page; more on "Show more" / scroll (#24). */
    static PAGE_SIZE = 50;
    static visibleCount = 50;
    static pageKey = '';
    /** Full filtered + sorted list of the last render (search covers all of it). */
    static pageBills = [];
    static pageType = 'all';
    static showMoreObserver = null;

    /** Type + date filter (#160); remembered for the browser session. */
    static filter = null;

    /** Active date range of the last render ({from, to} ms, null = open). */
    static activeRange = { from: null, to: null };

    /** @returns {{type: string, preset: string, from: string, to: string}} */
    static getFilter() {
        if (!this.filter) {
            let saved = null;
            try { saved = sessionStorage.getItem(HISTORY_FILTER_KEY); } catch { /* storage blocked */ }
            this.filter = normalizeHistoryFilter(saved);
        }
        return this.filter;
    }

    static setFilter(patch) {
        this.filter = normalizeHistoryFilter({ ...this.getFilter(), ...patch });
        try { sessionStorage.setItem(HISTORY_FILTER_KEY, JSON.stringify(this.filter)); } catch { /* storage blocked */ }
        return this.filter;
    }

    /**
     * Save current bill to history with loading indicator
     * Collects all bill data, saves to Firebase, and clears current bill
     * @async
     * @returns {Promise<void>}
     */
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
        
        const customerPhone = AppState.customerPhoneNumber || '';
        
        // Update customer options
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

        // Use withLoading for the Firebase operation
        await UIManager.withLoading(async () => {
            await FirebaseService.savePurchase(bill);
        });
        
        const state = AppState;
        state.purchaseHistory.unshift(bill);
        // Stock recalculation handled by script.js
        
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

    /**
     * Update customer name autocomplete options
     * Extracts unique customer names from bill history
     * @param {string} newCustomer - New customer name to add
     */
    static updateCustomerOptions(newCustomer) {
        const purchaseHistory = AppState.purchaseHistory;
        const uniqueCustomers = [...new Set(
            purchaseHistory
                .filter(b => b.customerName)
                .map(b => b.customerName)
        )];
        
        if (newCustomer && !uniqueCustomers.includes(newCustomer)) {
            uniqueCustomers.unshift(newCustomer);
        }
        
        const datalist = document.getElementById('customerOptions');
        if (datalist) {
            datalist.innerHTML = uniqueCustomers.map(name => `<option value="${Helpers.escapeHtml(name)}">`).join('');
        }
    }

    /**
     * Render transaction history with type/date filters, search and paging.
     * Supports both card and table view modes
     * @param {'all'|'purchase'|'retail'|'wholesale'|'sale'} [type] - Type filter
     *   (defaults to the remembered one; 'sale' = retail + wholesale)
     * @param {string} [searchTerm=''] - Optional search term to filter by
     */
    static renderHistory(type, searchTerm = '') {
        const purchaseHistory = AppState.purchaseHistory || [];
        const salesHistory = AppState.salesHistory || [];
        const retailSalesHistory = AppState.retailSalesHistory || [];
        const container = document.getElementById("historyList");
        if (!container) return;

        if (type && type !== 'sale' && type !== this.getFilter().type) this.setFilter({ type });
        const filter = this.getFilter();
        if (!type) type = filter.type;
        this.syncFilterUi();

        const range = resolveHistoryRange(filter.preset, new Date(), filter);
        this.activeRange = range;
        // Ranges older than the loaded window load on demand (with a notice);
        // "All dates" keeps the month-by-month infinite scroll instead.
        const status = range.from === null ? 'ready' : rangeStatus('history', range.from, () => this.refreshHistory());
        applyRangeState(container, status, {
            loadingText: 'Loading older bills… / पुराने बिल लोड हो रहे हैं…',
            errorText: `Couldn't load older bills. Showing bills since ${formatWindowDate(historyLoadedFrom())}.`,
            onRetry: () => { retryRange('history'); this.refreshHistory(); }
        });
        
        // Combine purchases and sales
        const purchases = purchaseHistory.map(b => ({ ...b, type: 'purchase', isPurchase: true }));
        const wholesaleSales = salesHistory.map(s => ({ ...s, type: 'wholesale', isPurchase: false }));
        const retailSales = retailSalesHistory.map(s => ({ ...s, type: 'retail', isPurchase: false }));
        const allHistory = [...purchases, ...wholesaleSales, ...retailSales];
        
        const sortedBills = filterHistoryBills(allHistory, { type, range, search: searchTerm });
        this.updateRangeLabel(range, sortedBills.length);
        
        // Check view mode and render accordingly
        this.activeSearch = (searchTerm || '').trim();
        // Only the first PAGE_SIZE bills go into the DOM; live refreshes keep
        // how many are shown, a new filter/search/view starts over (#24).
        const pageKey = `${type}|${filter.preset}|${range.from}|${range.to}|${this.activeSearch}|${this.viewMode}`;
        if (pageKey !== this.pageKey) {
            this.pageKey = pageKey;
            this.visibleCount = this.PAGE_SIZE;
        }
        this.pageBills = sortedBills;
        this.pageType = type;
        if (this.viewMode === 'table') {
            this.renderHistoryTable(sortedBills.slice(0, this.visibleCount), type);
            this.renderShowMore(container);
            this.updateOlderHistoryUi();
            return;
        }

        if (sortedBills.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: #888; margin-top: 40px;">${Helpers.escapeHtml(this.emptyMessage(type, searchTerm))}</p>`;
            this.renderShowMore(container);
            this.updateOlderHistoryUi();
            return;
        }

        container.innerHTML = "";
        const fragment = document.createDocumentFragment();
        sortedBills.slice(0, this.visibleCount).forEach(bill => fragment.appendChild(this.buildHistoryCard(bill)));
        container.appendChild(fragment);
        this.renderShowMore(container);
        this.updateOlderHistoryUi();
    }

    /** True while loaded bills matching the current filter are not in the DOM yet. */
    static hasHiddenBills() {
        return this.pageBills.length > this.visibleCount;
    }

    /**
     * Adds the next PAGE_SIZE bills of the current list (Show more button,
     * or automatically when the button scrolls into view).
     */
    static showMoreHistory() {
        const container = document.getElementById('historyList');
        if (!container || !this.hasHiddenBills()) return;
        const from = this.visibleCount;
        this.visibleCount += this.PAGE_SIZE;
        if (this.viewMode === 'table') {
            this.renderHistoryTable(this.pageBills.slice(0, this.visibleCount), this.pageType);
        } else {
            container.querySelector('.history-show-more')?.remove();
            const fragment = document.createDocumentFragment();
            this.pageBills.slice(from, this.visibleCount).forEach(bill => fragment.appendChild(this.buildHistoryCard(bill)));
            container.appendChild(fragment);
        }
        this.renderShowMore(container);
        this.updateOlderHistoryUi();
    }

    /** "Show more" row at the end of the list while loaded bills are hidden. */
    static renderShowMore(container) {
        this.showMoreObserver?.disconnect();
        this.showMoreObserver = null;
        container.querySelector('.history-show-more')?.remove();
        if (!this.hasHiddenBills()) return;
        const row = document.createElement('div');
        row.className = 'history-show-more';
        row.style.cssText = 'text-align:center;padding:12px;';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'infinite-scroll-more';
        btn.textContent = `Show more (${this.pageBills.length - this.visibleCount} more)`;
        btn.addEventListener('click', () => this.showMoreHistory());
        row.appendChild(btn);
        container.appendChild(row);
        if (typeof IntersectionObserver === 'function') {
            this.showMoreObserver = new IntersectionObserver(entries => {
                if (entries.some(e => e.isIntersecting)) this.showMoreHistory();
            }, { rootMargin: '0px 0px 300px 0px' });
            this.showMoreObserver.observe(row);
        }
    }

    /**
     * One history card.
     * @param {Object} bill
     * @returns {HTMLElement}
     */
    static buildHistoryCard(bill) {
        const div = document.createElement("div");
        div.className = "history-item";
        div.setAttribute('data-type', bill.type);
        
        // Use saved values from database
        const totalPackets = bill.totalPackets || 0;
        
        const paymentParts = [];
        // Handle both old and new payment structures with color coding
        if (bill.payment) {
            if (bill.payment.online > 0) paymentParts.push(`<span class="payment-badge payment-online">Online: ₹${Math.round(bill.payment.online)}</span>`);
            if (bill.payment.cash > 0) paymentParts.push(`<span class="payment-badge payment-cash">Cash: ₹${Math.round(bill.payment.cash)}</span>`);
            if (bill.payment.due > 0) paymentParts.push(`<span class="payment-badge payment-due">Due: ₹${Math.round(bill.payment.due)}</span>`);
        } else {
            // Fallback to old direct fields
            if (bill.onlinePayment > 0) paymentParts.push(`<span class="payment-badge payment-online">Online: ₹${Math.round(bill.onlinePayment)}</span>`);
            if (bill.cashPayment > 0) paymentParts.push(`<span class="payment-badge payment-cash">Cash: ₹${Math.round(bill.cashPayment)}</span>`);
            if (bill.dueAmount > 0) paymentParts.push(`<span class="payment-badge payment-due">Due: ₹${Math.round(bill.dueAmount)}</span>`);
        }
        const paymentHTML = paymentParts.length > 0 ? `
            <div class="history-payment">
                ${paymentParts.join(' ')}
            </div>
        ` : '';
        
        // Use billNumber if available, otherwise generate short number from ID
        const billNumber = bill.billNumber || (typeof bill.id === 'string' ? bill.id.substring(0, 8) : bill.id);
        const billTotal = bill.grandTotal || bill.amountPayable || bill.saleTotal || bill.total || 0;
        const formattedDate = Helpers.formatDateTime(billDateOf(bill) || bill.date);
        const itemColor = (bill.type === 'retail' || bill.type === 'wholesale') ? '#28a745' : '#007bff';
        
        div.innerHTML = `
            <div class="history-header">
                <span style="cursor: pointer; color: ${itemColor}; text-decoration: underline;" onclick="window.app.history.viewBill('${billRef(bill)}', '${Helpers.escapeJsAttr(bill.type)}')">#${Helpers.escapeHtml(billNumber)}</span>${bill.customerName ? ` <strong>${Helpers.escapeHtml(bill.customerName)}</strong>` : ''}
                <span style="color: ${itemColor}; font-weight: 700;">₹ ${Math.round(billTotal)}</span>
            </div>
            <div class="history-date">${formattedDate}${bill.createdByName || bill.userName ? ` • By: <strong>${Helpers.escapeHtml(bill.createdByName || bill.userName)}</strong>` : ''}</div>
            <div class="history-summary">
                ${Helpers.escapeHtml(bill.items.map(item => item.name).join(', '))} • ${Helpers.escapeHtml(totalPackets)} packets
            </div>
            ${paymentHTML}
        `;
        
        return div;
    }

    /**
     * Empty-list message; mentions the loaded window when older bills may exist.
     * @param {string} type
     * @param {string} searchTerm
     * @returns {string} plain text (caller escapes)
     */
    static emptyMessage(type, searchTerm) {
        if (searchTerm && searchTerm.trim()) return `No results found for "${searchTerm}"`;
        const noun = (type === 'all' || !type) ? 'bills' : `${type} bills`;
        if (this.activeRange.from !== null || this.activeRange.to !== null) {
            return `No ${noun} in this period / इस अवधि में कोई बिल नहीं`;
        }
        if (!isFullHistoryLoaded()) {
            return `No ${noun} since ${formatWindowDate(historyLoadedFrom())}`;
        }
        return `No ${noun} yet`;
    }

    /**
     * Infinite scroll sentinel (loads one older month at a time) and the
     * "Search older bills" footer shown while searching a partial window.
     */
    static updateOlderHistoryUi() {
        const list = document.getElementById('historyList');
        if (!list) return;

        attachOlderHistoryScroll(list, {
            noun: 'bills',
            // Older months load only once every loaded bill is on screen.
            enabled: () => !this.activeSearch && !this.hasHiddenBills() && this.activeRange.from === null,
            onLoaded: () => this.refreshHistory()
        });
        renderStaleHistoryHint(list, { id: 'historyStaleHint', onRefreshed: () => this.refreshHistory() });

        let footer = document.getElementById('historySearchFooter');
        if (!footer) {
            footer = document.createElement('div');
            footer.id = 'historySearchFooter';
            footer.className = 'history-search-footer';
            list.parentNode?.appendChild(footer);
        }
        if (!this.activeSearch || this.activeRange.from !== null || (isFullHistoryLoaded() && !this.searchingOlder)) {
            footer.style.display = 'none';
            footer.textContent = '';
            return;
        }
        footer.style.display = '';
        footer.textContent = '';
        const text = document.createElement('span');
        text.textContent = `Showing matches from bills since ${formatWindowDate(historyLoadedFrom())}.`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-search-older-btn';
        btn.disabled = this.searchingOlder;
        btn.textContent = this.searchingOlder ? 'Searching older bills…' : 'Search older bills';
        btn.addEventListener('click', () => this.searchOlderBills());
        footer.append(text, ' ', btn);
    }

    /**
     * Load the full history (explicit user action — expensive) and re-run
     * the current search over it.
     * @async
     */
    static async searchOlderBills() {
        if (this.searchingOlder) return;
        this.searchingOlder = true;
        this.updateOlderHistoryUi();
        try {
            const covered = await ensureHistoryFrom(null);
            if (!covered) UIManager.showToast("Couldn't load older bills");
        } catch (error) {
            console.error('Loading full history failed:', error);
            UIManager.showToast("Couldn't load older bills");
        } finally {
            this.searchingOlder = false;
            this.refreshHistory();
        }
    }

    /**
     * Resolve a viewBill reference ("id:<id>" from the list, or a legacy
     * numeric index) to the bill's current index in `history`.
     * @param {Array<Object>} history
     * @param {string|number} ref
     * @returns {number}
     */
    static resolveBillIndex(history, ref) {
        if (typeof ref === 'string' && ref.startsWith('id:')) {
            return findBillIndex(history, ref.slice(3));
        }
        const index = Number(ref);
        return Number.isInteger(index) ? index : -1;
    }

    /* Removed - retail sales now integrated in billing
    static viewRetailSale(saleId) {
        const sale = AppState.retailSalesHistory.find(s => s.id === saleId);
        if (!sale) {
            UIManager.showToast('Sale not found');
            return;
        }
        
        // Similar modal display as reprintBill but for retail sales
        const itemsHTML = sale.items.map(item => {
            return `
                <tr>
                    <td>${Helpers.escapeHtml(item.name)}</td>
                    <td style="text-align: center;">${item.weights?.length || 1}</td>
                    <td>${item.qty || 0} kg</td>
                    <td>₹${item.rate}</td>
                    <td><strong>₹${Math.round(item.total)}</strong></td>
                </tr>
            `;
        }).join('');
        
        const payment = sale.payment || {};
        const paymentHTML = (payment.online > 0 || payment.cash > 0 || payment.due > 0) ? `
            <div class="bill-payment-section">
                <h4>Payment Details</h4>
                ${payment.online > 0 ? `<div class="bill-payment-row"><span>Online:</span><strong>₹${Math.round(payment.online)}</strong></div>` : ''}
                ${payment.cash > 0 ? `<div class="bill-payment-row"><span>Cash:</span><strong>₹${Math.round(payment.cash)}</strong></div>` : ''}
                ${payment.due > 0 ? `<div class="bill-payment-row" style="color: #dc3545;"><span>Due:</span><strong>₹${Math.round(payment.due)}</strong></div>` : ''}
            </div>
        ` : '';
        
        const content = `
            <div class="bill-info-section">
                ${sale.customerName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Customer:</div>
                        <div class="bill-info-value"><strong>${Helpers.escapeHtml(sale.customerName)}</strong></div>
                    </div>
                ` : ''}
                <div class="bill-info-row">
                    <div class="bill-info-label">Date:</div>
                    <div class="bill-info-value" style="display: inline;">${Helpers.escapeHtml(sale.date)}</div>
                </div>
                ${sale.userName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Created By:</div>
                        <div class="bill-info-value" style="display: inline;">${Helpers.escapeHtml(sale.userName)}</div>
                    </div>
                ` : ''}
            </div>
            
            <table class="bill-items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th style="text-align: center;">Packets</th>
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
                    <strong>₹${Math.round(sale.saleTotal || sale.amountReceivable || 0)}</strong>
                </div>
            </div>
            
            ${paymentHTML}
        `;
        
        document.getElementById('billDetailsContent').innerHTML = content;
        document.getElementById('billDetailsOverlay').classList.add('active');
    }
    */

    static async viewBill(ref, type = 'purchase') {
        // Determine which history array to use based on type
        let history;
        if (type === 'purchase') {
            history = AppState.purchaseHistory;
        } else if (type === 'retail') {
            history = AppState.retailSalesHistory;
        } else if (type === 'wholesale') {
            history = AppState.salesHistory;
        } else {
            UIManager.showModal(`Unknown bill type: ${type}`);
            return;
        }
        const index = this.resolveBillIndex(history, ref);
        const bill = history[index];
        
        if (!bill) {
            UIManager.showModal('Bill not found');
            return;
        }
        
        // Store bill index, id and type for edit/delete (id re-resolves the
        // index later in case the arrays shifted in between)
        window.currentBillIndex = index;
        window.currentBillId = bill.id;
        window.currentBillType = type;
        
        const totalPackets = bill.totalPackets || 0;
        const isPurchase = type === 'purchase';
        const billColor = isPurchase ? '#007bff' : '#28a745';
        
        // Build weight breakdown (purchases and sales)
        let weightBreakdownHTML = '';
        bill.items.forEach(item => {
            // Only show weight breakdown if there are 2 or more packets
            if (item.weights && item.weights.length >= 2) {
                const weightsDisplay = item.weights.map(w => parseFloat(w).toFixed(1)).join('&nbsp;&nbsp;');
                weightBreakdownHTML += `
                    <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${billColor};">
                        <div style="font-weight: 600; color: #495057; margin-bottom: 6px;">${Helpers.escapeHtml(item.name)} (${item.weights.length} packets, ${(item.qty || 0).toFixed(1)}kg)</div>
                        <div style="color: #6c757d; font-size: 14px; white-space: pre;">${weightsDisplay}</div>
                    </div>
                `;
            }
        });
        
        // Build items table
        const itemsHTML = bill.items.map(item => `
            <tr>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">${Helpers.escapeHtml(item.name)}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${Helpers.escapeHtml(item.rate)}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${(item.qty || 0).toFixed(1)}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>${Helpers.escapeHtml(item.total)}</strong></td>
            </tr>
        `).join('');
        
        const payment = bill.payment || {};
        
        // Build payment section HTML (reusable)
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
        
        const billNumber = bill.billNumber || (typeof bill.id === 'string' ? bill.id.substring(0, 8) : bill.id);
        
        const content = `
            <div style="padding: 16px; max-width: 100%;">
                <div class="bill-info-section">
                    <div class="bill-info-row">
                        <div class="bill-info-label">Bill No:</div>
                        <div class="bill-info-value"><strong style="color: ${billColor};">#${Helpers.escapeHtml(billNumber)}</strong></div>
                    </div>
                    <div class="bill-info-row">
                        <div class="bill-info-label">Date:</div>
                        <div class="bill-info-value">${Helpers.formatDateTime(billDateOf(bill) || bill.date)}</div>
                    </div>
                    ${bill.createdByName || bill.userName ? `
                        <div class="bill-info-row">
                            <div class="bill-info-label">Created By:</div>
                            <div class="bill-info-value">${Helpers.escapeHtml(bill.createdByName || bill.userName)}</div>
                        </div>
                    ` : ''}
                    ${bill.customerName ? `
                        <div class="bill-info-row">
                            <div class="bill-info-label">Customer:</div>
                            <div class="bill-info-value"><strong>${Helpers.escapeHtml(bill.customerName)}</strong></div>
                        </div>
                    ` : ''}
                </div>
                
                ${bill.comments ? `
                    <div style="margin-bottom: 12px; padding: 10px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                        <span style="color: #6c757d; font-size: 14px;">Comments:</span>
                        <div style="font-size: 14px; color: #212529; margin-top: 4px;">${Helpers.escapeHtml(bill.comments)}</div>
                    </div>
                ` : ''}
                
                ${weightBreakdownHTML ? `
                    <div style="margin: 16px 0;">
                        <h4 style="margin-bottom: 12px; color: #212529; font-size: 15px;">Weight Breakdown</h4>
                        ${weightBreakdownHTML}
                    </div>
                ` : ''}
                
                <h4 style="margin: 16px 0 12px 0; color: #212529; font-size: 15px;">${isPurchase ? 'Bill' : 'Sale'} Items</h4>
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
                
                <div style="text-align: right; padding: 8px 0; font-size: 14px; color: #6c757d; margin-bottom: 12px;">
                    Total Packets: <strong style="color: #212529; font-size: 15px;">${Helpers.escapeHtml(totalPackets)}</strong>
                </div>
                
                <div style="background: white; padding: 14px; border-radius: 10px; border: 1px solid #dee2e6;">
                    ${isPurchase ? `
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px;">
                            <span style="font-weight: 600;">Purchase Total:</span>
                            <strong style="font-size: 17px; color: ${billColor};">₹${Math.round(bill.billTotal || bill.grandTotal || bill.amountPayable || 0)}</strong>
                        </div>
                        
                        ${bill.laborCharges > 0 ? `
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; border-top: 1px solid #e9ecef;">
                                <span style="font-weight: 600;">Labor (₹):</span>
                                <strong style="font-size: 17px; color: #ffc107;">₹${Math.round(bill.laborCharges)}</strong>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 16px; border-top: 2px solid ${billColor}; margin-top: 8px; background: linear-gradient(135deg, #e3f2fd, #bbdefb); margin: 8px -14px -14px -14px; padding: 12px 14px; border-radius: 0 0 10px 10px;">
                                <span style="font-weight: 700;">Total Payable:</span>
                                <strong style="font-size: 18px; color: #1976d2;">₹${Math.round(bill.total || bill.amountPayable || 0)}</strong>
                            </div>
                        ` : ''}
                    ` : `
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px;">
                            <span style="font-weight: 600;">Sale Total:</span>
                            <strong style="font-size: 17px; color: ${billColor};">₹${Math.round(bill.total || 0)}</strong>
                        </div>
                    `}
                </div>
                
                ${paymentHTML}
            </div>
        `;
        
        document.getElementById('billDetailsContent').innerHTML = content;
        
        // Show all buttons for both purchases and sales
        const editBtn = document.getElementById('billEditBtn');
        const deleteBtn = document.getElementById('billDeleteBtn');
        if (editBtn) editBtn.style.display = '';
        if (deleteBtn) deleteBtn.style.display = '';
        
        document.getElementById('billDetailsOverlay').classList.add('active');
    }

    static closeBillDetails() {
        document.getElementById('billDetailsOverlay').classList.remove('active');
    }

    static async confirmDeleteBill(index) {
        const confirmed = await UIManager.showModal(
            'Are you sure you want to delete this bill? This action cannot be undone.',
            'Delete Bill',
            true
        );
        
        if (confirmed) {
            await this.deleteBill(index);
        }
    }

    static async deleteBill(index) {
        // Use the stored bill type from viewBill, or fall back to filter button
        const billType = window.currentBillType;
        
        // Get the correct history array based on bill type
        let history;
        let collectionName;
        
        if (billType === 'purchase') {
            history = AppState.purchaseHistory;
            collectionName = 'purchases';
        } else if (billType === 'retail') {
            history = AppState.retailSalesHistory;
            collectionName = 'retailSales';
        } else if (billType === 'wholesale') {
            history = AppState.salesHistory;
            collectionName = 'wholesaleSales';
        } else {
            // viewBill always records the type; without it we can't tell which
            // collection the bill is in, so don't guess on a delete.
            this.closeBillDetails();
            UIManager.showToast('Bill not found');
            return;
        }
        
        const billIndex = findBillIndex(history, window.currentBillId, index);
        const bill = history[billIndex];
        
        if (!bill) {
            this.closeBillDetails();
            UIManager.showToast('Bill not found');
            return;
        }

        try {
            // Only the bill's creator or an owner may delete it (enforced by firestore.rules;
            // legacy bills without a userId are owner-only)
            const uid = AppState.currentUser?.uid;
            if (AppState.userRole !== 'owner' && (!bill.userId || bill.userId !== uid)) {
                this.closeBillDetails();
                UIManager.showToast('Only the person who created this bill or an owner can delete it');
                return;
            }

            UIManager.showLoading();
            
            // Delete from Firebase by document id (the old query also ignored the dev_ prefix)
            await FirebaseService.deleteHistoryBill(collectionName, bill);
            
            // Remove from local state (re-resolve: the array may have changed during the await)
            const currentIndex = history.indexOf(bill);
            if (currentIndex !== -1) history.splice(currentIndex, 1);
            
            // Log audit entry
            const isSale = billType !== 'purchase';
            const auditAction = isSale ? AuditService.ACTIONS.DELETE_SALE : AuditService.ACTIONS.DELETE_BILL;
            await AuditService.log(auditAction, {
                billNumber: bill.billNumber || 'N/A',
                amount: bill.total || bill.grandTotal || 0,
                customer: bill.customer || bill.supplier || 'N/A'
            });
            
            // Recalculate stock after deletion
            AppState.stock = await FirebaseService.calculateStock();
            
            // Update finance overview if on Finance tab
            if (typeof window.app.finance?.calculateOverview === 'function') {
                window.app.finance.calculateOverview();
            }
            
            // Update outstanding payments
            if (typeof window.app.outstanding?.renderDue === 'function') {
                window.app.outstanding.renderDue();
            }
            
            // Close the details overlay
            this.closeBillDetails();
            
            // Refresh the history view (keeps filter and search)
            this.refreshHistory();
            
            UIManager.hideLoading();
            UIManager.showToast('Bill deleted successfully');
        } catch (error) {
            console.error('Error deleting bill:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to delete bill');
        }
    }

    static searchHistory(searchTerm) {
        this.renderHistory(this.getFilter().type, searchTerm);
    }

    static refreshHistory() {
        const searchInput = document.getElementById('historySearch');
        this.searchHistory(searchInput ? searchInput.value : '');
    }

    /**
     * Type chip (All / Purchase / Retail / Wholesale). Keeps the search text
     * and date range so they work together.
     * @param {string} type
     */
    static filterHistory(type) {
        const next = type === 'sale' ? 'all' : type;
        if (!HISTORY_TYPES.includes(next)) return;
        this.setFilter({ type: next });
        this.refreshHistory();
    }

    /** Date preset select (all/today/yesterday/week/month/lastMonth/custom). */
    static setDatePreset(preset) {
        const patch = { preset };
        if (preset === 'custom' && !this.getFilter().from && !this.getFilter().to) {
            patch.from = patch.to = todayLocalISO();
        }
        this.setFilter(patch);
        this.refreshHistory();
    }

    /** Custom range date inputs ('YYYY-MM-DD'; either may be empty). */
    static setCustomRange(from, to) {
        this.setFilter({ preset: 'custom', from: from || '', to: to || '' });
        this.refreshHistory();
    }

    /** Reflect the remembered filter in the History controls. */
    static syncFilterUi() {
        const filter = this.getFilter();
        document.querySelectorAll('#history .history-type-filter .filter-btn').forEach(btn => {
            const active = btn.dataset.type === filter.type;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const preset = document.getElementById('historyDatePreset');
        if (preset && preset.value !== filter.preset) preset.value = filter.preset;
        const custom = document.getElementById('historyCustomRange');
        if (custom) custom.hidden = filter.preset !== 'custom';
        const from = document.getElementById('historyFromDate');
        const to = document.getElementById('historyToDate');
        if (from && from.value !== filter.from) from.value = filter.from;
        if (to && to.value !== filter.to) to.value = filter.to;
    }

    /** "01/10/2026 – 22/10/2026 · 12 bills" under the filters. */
    static updateRangeLabel(range, count) {
        const label = document.getElementById('historyRangeLabel');
        if (!label) return;
        const text = formatHistoryRange(range);
        label.textContent = text ? `${text} · ${count} ${count === 1 ? 'bill' : 'bills'}` : '';
        label.hidden = !text;
    }

    /**
     * The bill open in the details overlay (re-resolved by id; arrays shift).
     * @returns {{bill: Object, type: string}|null}
     */
    static currentBill() {
        const type = window.currentBillType;
        const history = type === 'purchase' ? AppState.purchaseHistory
            : type === 'retail' ? AppState.retailSalesHistory
                : type === 'wholesale' ? AppState.salesHistory : null;
        if (!Array.isArray(history)) return null;
        const index = findBillIndex(history, window.currentBillId, window.currentBillIndex);
        const bill = history[index];
        return bill ? { bill, type } : null;
    }

    /**
     * Reprint the open bill with its own date and a "COPY / प्रति" mark.
     * Uses the normal print path (Bluetooth, else image preview with
     * share/download), works from cached bills offline, never changes the bill.
     */
    static async reprintBill() {
        const current = this.currentBill();
        if (!current) {
            UIManager.showToast('Bill not found');
            return;
        }
        try {
            await PrinterService.printBill(buildReprintPayload(current.bill, current.type));
        } catch (error) {
            console.error('Reprint failed:', error);
            UIManager.showToast('Reprint failed / प्रिंट नहीं हो पाया');
        }
    }

    /** Share the open bill on WhatsApp (bill date, COPY mark, bilingual). */
    static shareBill() {
        const current = this.currentBill();
        if (!current) {
            UIManager.showToast('Bill not found');
            return;
        }
        const url = whatsAppShareUrl(buildBillShareText(current.bill, current.type));
        if (window.Capacitor?.isNativePlatform?.()) {
            window.open(url, '_system');
            return;
        }
        const win = window.open(url, '_blank', 'noopener');
        if (!win) window.location.href = url;
    }

    static toggleView() {
        this.viewMode = this.viewMode === 'card' ? 'table' : 'card';
        const toggleBtn = document.getElementById('historyViewToggle');
        if (toggleBtn) {
            toggleBtn.textContent = this.viewMode === 'card' ? 'Table View' : 'Card View';
        }
        this.refreshHistory();
    }

    static renderHistoryTable(bills, type) {
        const container = document.getElementById("historyList");
        
        if (bills.length === 0) {
            const searchInput = document.getElementById('historySearch');
            const searchTerm = searchInput ? searchInput.value : '';
            container.innerHTML = `<p style="text-align: center; color: #888; margin-top: 40px;">${Helpers.escapeHtml(this.emptyMessage(type, searchTerm))}</p>`;
            return;
        }

        const itemColor = type === 'purchase' ? '#007bff' : (type === 'all' ? '#6366f1' : '#28a745');
        
        // Define alternating colors for different days - creative gradient backgrounds
        const dayColors = [
            'linear-gradient(to right, #fff5f5, #ffffff)',
            'linear-gradient(to right, #f0f9ff, #ffffff)',
            'linear-gradient(to right, #f5f3ff, #ffffff)',
            'linear-gradient(to right, #ecfdf5, #ffffff)',
            'linear-gradient(to right, #fffbeb, #ffffff)'
        ];
        let currentDayIndex = 0;
        let lastDate = null;
        
        let tableHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <thead>
                        <tr style="background: linear-gradient(135deg, ${itemColor}, ${itemColor}dd); color: white;">
                            <th style="padding: 12px 8px; text-align: left; font-weight: 600; font-size: 14px;">Customer</th>
                            <th style="padding: 12px 8px; text-align: left; font-weight: 600; font-size: 14px;">Items</th>
                            <th style="padding: 12px 8px; text-align: right; font-weight: 600; font-size: 14px;">Rate (₹)</th>
                            <th style="padding: 12px 8px; text-align: right; font-weight: 600; font-size: 14px;">Weight (kg)</th>
                            <th style="padding: 12px 8px; text-align: right; font-weight: 600; font-size: 14px;">Total (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        bills.forEach(bill => {
            const billNumber = bill.billNumber || (typeof bill.id === 'string' ? bill.id.substring(0, 8) : bill.id);
            const billTotal = bill.grandTotal || bill.amountPayable || bill.saleTotal || bill.total || 0;
            
            // Extract date (DD/MM/YYYY) from bill date
            const billDate = billDateOf(bill) || new Date(0);
            const dateKey = `${billDate.getDate()}-${billDate.getMonth()}-${billDate.getFullYear()}`;
            
            // Change color when date changes
            if (lastDate !== dateKey) {
                currentDayIndex = (currentDayIndex + 1) % dayColors.length;
                lastDate = dateKey;
            }
            
            const rowBackground = dayColors[currentDayIndex];
            const hoverColors = [
                'linear-gradient(to right, #fee2e2, #fef2f2)',
                'linear-gradient(to right, #dbeafe, #eff6ff)',
                'linear-gradient(to right, #e9d5ff, #f3e8ff)',
                'linear-gradient(to right, #d1fae5, #ecfdf5)',
                'linear-gradient(to right, #fef3c7, #fffbeb)'
            ];
            const hoverBackground = hoverColors[currentDayIndex];
            
            bill.items.forEach((item, index) => {
                const isFirstRow = index === 0;
                const rowspan = bill.items.length;
                
                tableHTML += `
                    <tr style="border-bottom: 1px solid #e5e7eb; background: ${rowBackground}; cursor: pointer; transition: all 0.3s ease;" 
                        onmouseover="this.style.background='${hoverBackground}'; this.style.transform='scale(1.01)'" 
                        onmouseout="this.style.background='${rowBackground}'; this.style.transform='scale(1)'"
                        onclick="window.app.history.viewBill('${billRef(bill)}', '${Helpers.escapeJsAttr(bill.type)}')">
                        ${isFirstRow ? `
                            <td rowspan="${rowspan}" style="padding: 12px 8px; border-right: 1px solid #e5e7eb; font-weight: 500;">
                                ${Helpers.escapeHtml(bill.customerName || '-')}
                            </td>
                        ` : ''}
                        <td style="padding: 12px 8px;">${Helpers.escapeHtml(item.name)}</td>
                        <td style="padding: 12px 8px; text-align: right;">₹${Helpers.escapeHtml(item.rate)}</td>
                        <td style="padding: 12px 8px; text-align: right;">${(item.qty || 0).toFixed(1)}</td>
                        ${isFirstRow ? `
                            <td rowspan="${rowspan}" style="padding: 12px 8px; text-align: right; border-left: 1px solid #e5e7eb; font-weight: 700; color: ${itemColor}; font-size: 15px;">
                                ₹${Math.round(billTotal)}
                            </td>
                        ` : ''}
                    </tr>
                `;
            });
        });

        tableHTML += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHTML;
    }
}
