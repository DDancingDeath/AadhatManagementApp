// -------------------- DAY MODULE --------------------
// Manages the Day page with Today's Summary and Cash Management sub-tabs

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { Helpers } from '../utils/helpers.js';

// Use helper functions
const formatCurrency = (amount) => Helpers.formatCurrency(amount);
const formatDate = (date) => Helpers.formatDate(date);

export const DayManager = {
    currentSubTab: 'today',
    
    /**
     * Initialize the Day page
     */
    init() {
        this.updateTodayHeader();
        this.loadTodayData();
    },

    /**
     * Show a sub-tab (today or cash)
     * @param {string} tab - 'today' or 'cash'
     */
    showSubTab(tab) {
        this.currentSubTab = tab;
        
        // Update tab button styles
        const todayBtn = document.getElementById('dayTabToday');
        const cashBtn = document.getElementById('dayTabCash');
        const todayContent = document.getElementById('dayTodayContent');
        const cashContent = document.getElementById('dayCashContent');
        
        if (tab === 'today') {
            todayBtn.classList.add('active');
            cashBtn.classList.remove('active');
            todayContent.style.display = 'block';
            cashContent.style.display = 'none';
            this.loadTodayData();
        } else {
            cashBtn.classList.add('active');
            todayBtn.classList.remove('active');
            todayContent.style.display = 'none';
            cashContent.style.display = 'block';
            this.loadCashManagement();
        }
    },

    /**
     * Update the today header with current date
     */
    updateTodayHeader() {
        const header = document.getElementById('todayDateHeader');
        const subheader = document.getElementById('todayDateSubheader');
        
        if (header) {
            const today = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            header.textContent = "Today's Activity";
            if (subheader) {
                subheader.textContent = today.toLocaleDateString('en-IN', options);
            }
        }
    },

    /**
     * Load today's summary data
     */
    loadTodayData() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Filter today's purchases
        const todayPurchases = (AppState.purchaseHistory || []).filter(p => {
            const date = Helpers.parseDate(p.date);
            return date && date >= today && date < tomorrow;
        });

        // Filter today's wholesale sales
        const todayWholesaleSales = (AppState.salesHistory || []).filter(s => {
            const date = Helpers.parseDate(s.date);
            return date && date >= today && date < tomorrow;
        });

        // Filter today's retail sales
        const todayRetailSales = (AppState.retailSalesHistory || []).filter(s => {
            const date = Helpers.parseDate(s.date);
            return date && date >= today && date < tomorrow;
        });

        // Filter today's expenses
        const todayExpenses = (AppState.expensesHistory || []).filter(e => {
            const date = Helpers.parseDate(e.date);
            return date && date >= today && date < tomorrow;
        });

        // Calculate totals
        // Purchases can have: grandTotal, amountPayable, billTotal, or total
        const totalPurchases = todayPurchases.reduce((sum, p) => {
            const amount = Number(p.grandTotal) || Number(p.amountPayable) || Number(p.billTotal) || Number(p.total) || 0;
            return sum + amount;
        }, 0);
        const totalWholesaleSales = todayWholesaleSales.reduce((sum, s) => {
            const amount = Number(s.grandTotal) || Number(s.total) || Number(s.saleTotal) || 0;
            return sum + amount;
        }, 0);
        const totalRetailSales = todayRetailSales.reduce((sum, s) => {
            const amount = Number(s.grandTotal) || Number(s.total) || Number(s.saleTotal) || 0;
            return sum + amount;
        }, 0);
        const totalSales = totalWholesaleSales + totalRetailSales;
        
        // Expenses split by category
        const businessExpenses = todayExpenses.filter(e => e.category === 'business');
        const personalExpenses = todayExpenses.filter(e => e.category === 'personal');
        
        const totalBusinessExpenses = businessExpenses.reduce((sum, e) => {
            return sum + (Number(e.amount) || Number(e.total) || 0);
        }, 0);
        const totalPersonalExpenses = personalExpenses.reduce((sum, e) => {
            return sum + (Number(e.amount) || Number(e.total) || 0);
        }, 0);
        const totalExpenses = totalBusinessExpenses + totalPersonalExpenses;

        // Calculate labor cost from purchases
        const totalLaborCost = todayPurchases.reduce((sum, p) => sum + (p.laborCharges || p.labour || 0), 0);

        // Calculate quantities
        let qtyPurchased = 0;
        todayPurchases.forEach(p => {
            (p.items || []).forEach(item => {
                qtyPurchased += parseFloat(item.qty || item.quantity || 0);
            });
        });

        let qtySold = 0;
        [...todayWholesaleSales, ...todayRetailSales].forEach(s => {
            (s.items || []).forEach(item => {
                qtySold += parseFloat(item.qty || item.quantity || 0);
            });
        });

        // Calculate payments
        let cashReceived = 0, onlineReceived = 0, cashPaid = 0, onlinePaid = 0;
        let dueToReceive = 0, dueToPay = 0;

        // From purchases (cash/online paid out, due to pay)
        todayPurchases.forEach(p => {
            cashPaid += (p.cashPayment || p.payment?.cash || 0);
            onlinePaid += (p.onlinePayment || p.payment?.online || 0);
            dueToPay += (p.due || p.payment?.due || 0);
        });

        // From sales (cash/online received, due to receive)
        [...todayWholesaleSales, ...todayRetailSales].forEach(s => {
            cashReceived += (s.cashPayment || s.payment?.cash || 0);
            onlineReceived += (s.onlinePayment || s.payment?.online || 0);
            dueToReceive += (s.due || s.payment?.due || 0);
        });

        // Calculate due paid and due received from cash management transactions
        let duePaid = 0, dueReceived = 0;
        const todayCashTransactions = (AppState.cashManagement || []).filter(t => {
            const date = Helpers.parseDate(t.date);
            return date && date >= today && date < tomorrow;
        });
        
        todayCashTransactions.forEach(t => {
            if (t.type === 'paid' || t.transactionType === 'paid') {
                duePaid += (t.amount || 0);
            } else if (t.type === 'received' || t.transactionType === 'received') {
                dueReceived += (t.amount || 0);
            }
        });

        // Total cash flow (all cash + online in - all cash + online out)
        const totalCashIn = cashReceived + onlineReceived + dueReceived;
        const totalCashOut = cashPaid + onlinePaid + totalExpenses + duePaid;
        const totalCashFlow = totalCashIn - totalCashOut;

        // Net outflow (Out - In): positive means money went out, negative means money came in
        const netOutflow = (cashPaid + onlinePaid + totalExpenses) - (cashReceived + onlineReceived);

        // Update UI - Main Stats
        this.updateElement('todayTotalPurchases', formatCurrency(totalPurchases));
        this.updateElement('todayPurchaseCount', `${todayPurchases.length} bills`);
        this.updateElement('todayTotalSales', formatCurrency(totalSales));
        this.updateElement('todaySaleCount', `${todayWholesaleSales.length + todayRetailSales.length} bills`);
        this.updateElement('todayLaborCost', formatCurrency(totalLaborCost));
        
        // Expenses breakdown
        this.updateElement('todayBusinessExpenses', formatCurrency(totalBusinessExpenses));
        this.updateElement('todayBusinessExpenseCount', `${businessExpenses.length} entries`);
        this.updateElement('todayPersonalExpenses', formatCurrency(totalPersonalExpenses));
        this.updateElement('todayPersonalExpenseCount', `${personalExpenses.length} entries`);
        
        // Total In and Total Out for hero card
        this.updateElement('todayTotalIn', formatCurrency(cashReceived + onlineReceived));
        this.updateElement('todayTotalOut', formatCurrency(cashPaid + onlinePaid + totalExpenses));
        
        // Net outflow with color coding
        const cashFlowLabel = document.getElementById('todayCashFlowLabel');
        if (cashFlowLabel) {
            cashFlowLabel.textContent = netOutflow >= 0 ? 'Net Outflow:' : 'Net Inflow:';
        }
        
        const netCashFlowEl = document.getElementById('todayNetCashFlow');
        if (netCashFlowEl) {
            netCashFlowEl.style.color = netOutflow >= 0 ? 'white' : '#a5f3fc';
            netCashFlowEl.textContent = formatCurrency(Math.abs(netOutflow));
        }

        // Payment summary
        this.updateElement('todayCashReceived', formatCurrency(cashReceived));
        this.updateElement('todayOnlineReceived', formatCurrency(onlineReceived));
        this.updateElement('todayCashPaid', formatCurrency(cashPaid + totalExpenses));
        this.updateElement('todayOnlinePaid', formatCurrency(onlinePaid));
        
        // Total cash flow with color
        const totalCashFlowEl = document.getElementById('todayTotalCashFlow');
        if (totalCashFlowEl) {
            totalCashFlowEl.textContent = (totalCashFlow >= 0 ? '+' : '') + formatCurrency(totalCashFlow);
        }

        // Due summary
        this.updateElement('todayDueReceived', formatCurrency(dueReceived));
        this.updateElement('todayDuePaid', formatCurrency(duePaid));
        this.updateElement('todayDueToReceive', formatCurrency(dueToReceive));
        this.updateElement('todayDueToPay', formatCurrency(dueToPay));

        // Render item-wise details
        this.renderItemWiseDetails(todayPurchases, 'purchase');
        this.renderItemWiseDetails([...todayWholesaleSales, ...todayRetailSales], 'sale');
    },

    /**
     * Render item-wise purchase or sale details
     * @param {Array} transactions - Array of purchase or sale transactions
     * @param {string} type - 'purchase' or 'sale'
     */
    renderItemWiseDetails(transactions, type) {
        const containerId = type === 'purchase' ? 'todayPurchaseItems' : 'todaySaleItems';
        const container = document.getElementById(containerId);
        if (!container) return;

        // Aggregate items from all transactions
        const itemsMap = {};

        transactions.forEach(t => {
            const items = t.items || [];
            items.forEach(item => {
                const name = item.item || item.name || 'Unknown';
                if (!itemsMap[name]) {
                    itemsMap[name] = {
                        name: name,
                        count: 0,
                        quantity: 0,
                        totalValue: 0,
                        rates: []
                    };
                }
                itemsMap[name].count += 1;
                itemsMap[name].quantity += parseFloat(item.qty || item.quantity || 0);
                itemsMap[name].totalValue += parseFloat(item.total || item.amount || 0);
                if (item.rate) {
                    itemsMap[name].rates.push(parseFloat(item.rate));
                }
            });
        });

        // Convert to array and sort by total value (popularity)
        const itemsArray = Object.values(itemsMap).sort((a, b) => b.totalValue - a.totalValue);

        if (itemsArray.length === 0) {
            container.innerHTML = `<p class="empty-state">No ${type === 'purchase' ? 'purchases' : 'sales'} today</p>`;
            return;
        }

        const cardClass = type === 'purchase' ? 'stat-card-info-light' : 'stat-card-success-light';
        const labelClass = type === 'purchase' ? 'stat-value-info' : 'stat-value-success';

        container.innerHTML = itemsArray.map(item => {
            const avgRate = item.rates.length > 0 
                ? (item.rates.reduce((a, b) => a + b, 0) / item.rates.length).toFixed(2)
                : 0;
            
            return `
                <div class="stat-card ${cardClass}" style="text-align: left; padding: 14px;">
                    <div style="font-weight: 600; color: var(--text-primary); font-size: 15px; margin-bottom: 8px;">${item.name}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 13px;">
                        <div><span style="color: var(--text-secondary);">${type === 'purchase' ? 'Purchases:' : 'Sales:'}</span> <strong>${item.count}x</strong></div>
                        <div><span style="color: var(--text-secondary);">Qty:</span> <strong>${item.quantity.toFixed(2)} kg</strong></div>
                        <div><span style="color: var(--text-secondary);">Total:</span> <strong class="${labelClass}">${formatCurrency(item.totalValue)}</strong></div>
                        <div><span style="color: var(--text-secondary);">Avg Rate:</span> <strong>₹${avgRate}/kg</strong></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Helper to update element text
     */
    updateElement(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    },

    /**
     * Render today's transactions list
     */
    renderTransactionsList(purchases, wholesaleSales, retailSales, expenses) {
        const container = document.getElementById('todayTransactionsList');
        if (!container) return;

        const filter = document.getElementById('todayTransactionFilter')?.value || 'all';

        // Combine all transactions with type
        let transactions = [];

        if (filter === 'all' || filter === 'purchase') {
            purchases.forEach(p => transactions.push({
                type: 'purchase',
                icon: '🛒',
                label: 'Purchase',
                party: p.seller || 'Unknown',
                amount: p.total || 0,
                date: p.date,
                color: '#059669',
                bgColor: '#d1fae5'
            }));
        }

        if (filter === 'all' || filter === 'sale') {
            wholesaleSales.forEach(s => transactions.push({
                type: 'sale',
                icon: '💰',
                label: 'Wholesale Sale',
                party: s.buyer || 'Unknown',
                amount: s.total || 0,
                date: s.date,
                color: '#2563eb',
                bgColor: '#dbeafe'
            }));
        }

        if (filter === 'all' || filter === 'retail') {
            retailSales.forEach(s => transactions.push({
                type: 'retail',
                icon: '🛍️',
                label: 'Retail Sale',
                party: s.buyer || 'Walk-in',
                amount: s.total || 0,
                date: s.date,
                color: '#7c3aed',
                bgColor: '#f3e8ff'
            }));
        }

        if (filter === 'all' || filter === 'expense') {
            expenses.forEach(e => transactions.push({
                type: 'expense',
                icon: '💳',
                label: e.type || 'Expense',
                party: e.description || e.category || 'Misc',
                amount: e.amount || 0,
                date: e.date,
                color: '#d97706',
                bgColor: '#fef3c7'
            }));
        }

        // Sort by date (newest first)
        transactions.sort((a, b) => {
            const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dateB - dateA;
        });

        if (transactions.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 20px;">No transactions for today</p>`;
            return;
        }

        container.innerHTML = transactions.map(t => {
            const time = t.date?.toDate ? t.date.toDate() : new Date(t.date);
            const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            
            return `
                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #f3f4f6;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: ${t.bgColor}; display: flex; align-items: center; justify-content: center; font-size: 18px;">
                        ${t.icon}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #374151; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.party}</div>
                        <div style="font-size: 12px; color: #9ca3af;">${t.label} • ${timeStr}</div>
                    </div>
                    <div style="font-weight: 700; color: ${t.color}; font-size: 15px;">
                        ${t.type === 'expense' || t.type === 'purchase' ? '-' : '+'}${formatCurrency(t.amount)}
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Filter transactions based on dropdown
     */
    filterTransactions() {
        this.loadTodayData();
    },

    /**
     * Load cash management content into the sub-tab
     */
    loadCashManagement() {
        const container = document.getElementById('dayCashManagementContainer');
        const cashManagementTab = document.getElementById('cash-management');
        
        if (container && cashManagementTab) {
            // Clone the inner content of cash management (skip the outer div)
            const innerContent = cashManagementTab.querySelector('div[style*="padding"]');
            if (innerContent) {
                container.innerHTML = innerContent.innerHTML;
            } else {
                container.innerHTML = cashManagementTab.innerHTML;
            }
            
            // Re-initialize cash management
            if (window.app && window.app.cashManagement) {
                setTimeout(() => {
                    window.app.cashManagement.init();
                }, 100);
            }
        }
    }
};
