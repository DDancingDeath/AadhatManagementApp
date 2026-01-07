/**
 * @fileoverview Finance Management Module
 * Handles financial dashboard, assets tracking, withdrawals, and profit calculations
 * @module modules/finance
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { Helpers } from '../utils/helpers.js';

/**
 * Finance Manager - Manages financial operations and reporting
 * @class FinanceManager
 */
export class FinanceManager {
    static currentDateFilter = 'all';
    static customStartDate = null;
    static customEndDate = null;
    static customAccounts = [];

    /**
     * Initialize the finance module
     */
    static init() {
        this.loadCustomAccounts();
        this.filterTab('dashboard');
        this.setupIconPicker();
        this.setDefaultDate();
    }

    /**
     * Set default date for withdrawal form
     */
    static setDefaultDate() {
        const dateInput = document.getElementById('withdrawalDate');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    }

    /**
     * Setup icon picker click handlers
     */
    static setupIconPicker() {
        const picker = document.getElementById('accountIconPicker');
        if (picker) {
            picker.querySelectorAll('.icon-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    picker.querySelectorAll('.icon-option').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
    }

    /**
     * Load custom accounts from localStorage
     */
    static loadCustomAccounts() {
        try {
            const saved = localStorage.getItem('financeCustomAccounts');
            this.customAccounts = saved ? JSON.parse(saved) : [];
        } catch (e) {
            this.customAccounts = [];
        }
    }

    /**
     * Save custom accounts to localStorage
     */
    static saveCustomAccounts() {
        localStorage.setItem('financeCustomAccounts', JSON.stringify(this.customAccounts));
    }

    /**
     * Switch between finance view tabs
     * @param {'dashboard'|'assets'|'withdrawals'} view - View to display
     * @param {Event} [evt] - Optional click event for button styling
     */
    static filterTab(view, evt) {
        // Update button states - only main tab buttons
        const buttons = document.querySelectorAll('#finance > .filter-buttons > .filter-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (evt) {
            evt.currentTarget.classList.add('active');
        } else {
            // Set first button as active if no event (initial load)
            const firstBtn = buttons[0];
            if (firstBtn) firstBtn.classList.add('active');
        }
        
        // Show/hide sections
        const dashboardSection = document.getElementById('financeDashboardSection');
        const assetsSection = document.getElementById('financeAssetsSection');
        const withdrawalsSection = document.getElementById('financeWithdrawalsSection');
        
        if (dashboardSection) dashboardSection.style.display = view === 'dashboard' ? 'block' : 'none';
        if (assetsSection) assetsSection.style.display = view === 'assets' ? 'block' : 'none';
        if (withdrawalsSection) withdrawalsSection.style.display = view === 'withdrawals' ? 'block' : 'none';
        
        // Render content for the selected view
        if (view === 'dashboard') {
            // Also ensure date filter button is correctly selected
            this.updateDateFilterButtons();
            this.renderDashboard();
        } else if (view === 'assets') {
            this.renderAssets();
        } else if (view === 'withdrawals') {
            this.renderWithdrawals();
        }
    }

    /**
     * Update date filter buttons to match current filter
     */
    static updateDateFilterButtons() {
        const buttons = document.querySelectorAll('#financeDashboardSection .card > .filter-buttons .filter-btn');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            // Match button text to current filter
            const btnText = btn.textContent.toLowerCase().trim();
            if ((btnText === 'all' && this.currentDateFilter === 'all') ||
                (btnText === 'year' && this.currentDateFilter === 'year') ||
                (btnText === 'month' && this.currentDateFilter === 'month') ||
                (btnText === 'week' && this.currentDateFilter === 'week') ||
                (btnText === 'custom' && this.currentDateFilter === 'custom')) {
                btn.classList.add('active');
            }
        });
    }

    /**
     * Set date filter for dashboard
     * @param {'week'|'month'|'year'|'all'|'custom'} filter - Date filter
     * @param {Event} [evt] - Click event
     */
    static setDateFilter(filter, evt) {
        this.currentDateFilter = filter;
        
        // Update button states - only date filter buttons
        const buttons = document.querySelectorAll('#financeDashboardSection .card > .filter-buttons .filter-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (evt) evt.currentTarget.classList.add('active');
        
        // Show/hide custom date range inputs
        const customRange = document.getElementById('financeCustomDateRange');
        if (customRange) {
            customRange.style.display = filter === 'custom' ? 'block' : 'none';
        }
        
        // Only render if not custom (wait for user to click Go)
        if (filter !== 'custom') {
            this.renderDashboard();
        }
    }

    /**
     * Apply custom date filter
     */
    static applyCustomDateFilter() {
        const startDate = document.getElementById('financeStartDate').value;
        const endDate = document.getElementById('financeEndDate').value;
        
        if (!startDate || !endDate) {
            UIManager.showToast('Please select both start and end dates');
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            UIManager.showToast('Start date must be before end date');
            return;
        }
        
        this.customStartDate = startDate;
        this.customEndDate = endDate;
        this.renderDashboard();
    }

    /**
     * Check if a date falls within the current filter
     * @param {Date|string} date - Date to check
     * @returns {boolean}
     */
    static isInDateRange(date) {
        const d = new Date(date);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        switch (this.currentDateFilter) {
            case 'week':
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return d >= weekAgo;
            case 'month':
                const monthAgo = new Date(today);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                return d >= monthAgo;
            case 'year':
                const yearAgo = new Date(today);
                yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                return d >= yearAgo;
            case 'custom':
                if (this.customStartDate && this.customEndDate) {
                    const start = new Date(this.customStartDate);
                    const end = new Date(this.customEndDate);
                    end.setHours(23, 59, 59, 999);
                    return d >= start && d <= end;
                }
                return true;
            case 'all':
            default:
                return true;
        }
    }

    /**
     * Get period label for display
     * @returns {string}
     */
    static getPeriodLabel() {
        switch (this.currentDateFilter) {
            case 'week': return 'This Week';
            case 'month': return 'This Month';
            case 'year': return 'This Year';
            case 'custom': 
                if (this.customStartDate && this.customEndDate) {
                    const start = new Date(this.customStartDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    const end = new Date(this.customEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    return `${start} - ${end}`;
                }
                return 'Custom';
            case 'all':
            default: return 'All Time';
        }
    }

    /**
     * Render the dashboard with financial overview
     */
    static renderDashboard() {
        const salesHistory = AppState.salesHistory || [];
        const retailSalesHistory = AppState.retailSalesHistory || [];
        const purchaseHistory = AppState.purchaseHistory || [];
        const expensesHistory = AppState.expensesHistory || [];
        const withdrawalsHistory = AppState.withdrawalsHistory || [];

        // Filter by date and calculate
        let revenue = 0, revenueCount = 0;
        let investment = 0, investmentCount = 0;
        let businessExp = 0, businessExpCount = 0;
        let personalExp = 0, personalExpCount = 0;
        let withdrawals = 0;

        // Revenue from sales
        salesHistory.filter(s => this.isInDateRange(s.date)).forEach(sale => {
            revenue += parseFloat(sale.total) || 0;
            revenueCount++;
        });
        retailSalesHistory.filter(s => this.isInDateRange(s.date)).forEach(sale => {
            revenue += parseFloat(sale.total) || 0;
            revenueCount++;
        });

        // Investment (purchases)
        purchaseHistory.filter(p => this.isInDateRange(p.date)).forEach(purchase => {
            investment += parseFloat(purchase.total) || 0;
            investmentCount++;
        });

        // Expenses
        expensesHistory.filter(e => this.isInDateRange(e.date)).forEach(expense => {
            const amount = parseFloat(expense.amount) || 0;
            if (expense.category === 'business') {
                businessExp += amount;
                businessExpCount++;
            } else {
                personalExp += amount;
                personalExpCount++;
            }
        });

        // Withdrawals (always show all-time total for context)
        withdrawalsHistory.forEach(w => {
            withdrawals += parseFloat(w.amount) || 0;
        });

        // Calculate profit
        const profit = revenue - investment - businessExp - personalExp;
        const availableBalance = profit - withdrawals;

        // Update UI
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        updateElement('financeNetProfit', `₹${Math.round(profit).toLocaleString('en-IN')}`);
        updateElement('financeProfitPeriod', this.getPeriodLabel());
        
        updateElement('financeRevenue', `₹${Math.round(revenue).toLocaleString('en-IN')}`);
        updateElement('financeRevenueCount', `${revenueCount} sales`);
        
        updateElement('financeInvestment', `₹${Math.round(investment).toLocaleString('en-IN')}`);
        updateElement('financeInvestmentCount', `${investmentCount} purchases`);
        
        updateElement('financeBusinessExp', `₹${Math.round(businessExp).toLocaleString('en-IN')}`);
        updateElement('financeBusinessExpCount', `${businessExpCount} entries`);
        
        updateElement('financePersonalExp', `₹${Math.round(personalExp).toLocaleString('en-IN')}`);
        updateElement('financePersonalExpCount', `${personalExpCount} entries`);

        updateElement('financeTotalWithdrawn', `₹${Math.round(withdrawals).toLocaleString('en-IN')}`);
        updateElement('financeAvailableBalance', `₹${Math.round(availableBalance).toLocaleString('en-IN')}`);

        // Render breakdown table
        this.renderProfitBreakdown(revenue, investment, businessExp, personalExp, withdrawals, profit, availableBalance);
        
        // Render monthly chart
        this.renderMonthlyChart();
    }

    /**
     * Render the profit breakdown table
     */
    static renderProfitBreakdown(revenue, investment, businessExp, personalExp, withdrawals, profit, balance) {
        const tbody = document.getElementById('financeProfitBreakdown');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td>📈 Sales Revenue</td>
                <td class="amount-positive">+₹${Math.round(revenue).toLocaleString('en-IN')}</td>
            </tr>
            <tr>
                <td>📦 Purchase Investment</td>
                <td class="amount-negative">-₹${Math.round(investment).toLocaleString('en-IN')}</td>
            </tr>
            <tr>
                <td>🏢 Business Expenses</td>
                <td class="amount-negative">-₹${Math.round(businessExp).toLocaleString('en-IN')}</td>
            </tr>
            <tr>
                <td>👤 Personal Expenses</td>
                <td class="amount-negative">-₹${Math.round(personalExp).toLocaleString('en-IN')}</td>
            </tr>
            <tr class="breakdown-subtotal">
                <td><strong>Net Profit</strong></td>
                <td class="${profit >= 0 ? 'amount-positive' : 'amount-negative'}"><strong>₹${Math.round(profit).toLocaleString('en-IN')}</strong></td>
            </tr>
            <tr>
                <td>💸 Total Withdrawals</td>
                <td class="amount-negative">-₹${Math.round(withdrawals).toLocaleString('en-IN')}</td>
            </tr>
            <tr class="breakdown-total">
                <td><strong>Available Balance</strong></td>
                <td class="${balance >= 0 ? 'amount-positive' : 'amount-negative'}"><strong>₹${Math.round(balance).toLocaleString('en-IN')}</strong></td>
            </tr>
        `;
    }

    /**
     * Render monthly profit chart
     */
    static renderMonthlyChart() {
        const salesHistory = AppState.salesHistory || [];
        const retailSalesHistory = AppState.retailSalesHistory || [];
        const purchaseHistory = AppState.purchaseHistory || [];
        const expensesHistory = AppState.expensesHistory || [];

        // Group by month
        const monthlyData = {};

        [...salesHistory, ...retailSalesHistory].forEach(sale => {
            const date = new Date(sale.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[key]) monthlyData[key] = { revenue: 0, costs: 0 };
            monthlyData[key].revenue += parseFloat(sale.total) || 0;
        });

        purchaseHistory.forEach(purchase => {
            const date = new Date(purchase.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[key]) monthlyData[key] = { revenue: 0, costs: 0 };
            monthlyData[key].costs += parseFloat(purchase.total) || 0;
        });

        expensesHistory.forEach(expense => {
            const date = new Date(expense.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[key]) monthlyData[key] = { revenue: 0, costs: 0 };
            monthlyData[key].costs += parseFloat(expense.amount) || 0;
        });

        const sortedMonths = Object.keys(monthlyData).sort().slice(-6);
        const container = document.getElementById('financeMonthlyChart');
        if (!container) return;

        if (sortedMonths.length === 0) {
            container.innerHTML = '<p class="empty-state">No data available yet</p>';
            return;
        }

        const maxProfit = Math.max(...sortedMonths.map(m => Math.abs(monthlyData[m].revenue - monthlyData[m].costs)), 1);

        let html = '';
        sortedMonths.forEach(month => {
            const data = monthlyData[month];
            const profit = data.revenue - data.costs;
            const height = Math.max(10, (Math.abs(profit) / maxProfit) * 150);
            const color = profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
            const [year, monthNum] = month.split('-');
            const monthName = new Date(year, parseInt(monthNum) - 1).toLocaleString('en', { month: 'short' });

            html += `
                <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                    <div style="background: ${color}; width: 100%; max-width: 40px; height: ${height}px; border-radius: 6px 6px 0 0;"></div>
                    <div style="font-size: 11px; margin-top: 6px; font-weight: 500;">${monthName}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">₹${(profit / 1000).toFixed(1)}k</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Render assets section
     */
    static renderAssets() {
        // Calculate stock value
        const stockValue = this.calculateStockValue();
        
        // Calculate outstanding amounts
        const { dueToReceive, dueToPay } = this.calculateOutstanding();
        
        // Calculate business balance (profit - withdrawals)
        const businessBalance = this.calculateBusinessBalance();
        
        // Calculate custom accounts total
        let customAssetsTotal = 0;
        let customLiabilitiesTotal = 0;
        this.customAccounts.forEach(acc => {
            if (acc.type === 'asset') {
                customAssetsTotal += acc.balance;
            } else {
                customLiabilitiesTotal += acc.balance;
            }
        });
        
        // Net worth = Stock + Due to Receive - Due to Pay + Business Balance + Custom Assets - Custom Liabilities
        const netWorth = stockValue + dueToReceive - dueToPay + businessBalance + customAssetsTotal - customLiabilitiesTotal;
        
        // Update UI
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        updateElement('financeNetWorth', `₹${Math.round(netWorth).toLocaleString('en-IN')}`);
        updateElement('assetStockValue', `₹${Math.round(stockValue).toLocaleString('en-IN')}`);
        updateElement('assetDueReceive', `₹${Math.round(dueToReceive).toLocaleString('en-IN')}`);
        updateElement('assetDuePay', `-₹${Math.round(dueToPay).toLocaleString('en-IN')}`);
        updateElement('assetBusinessBalance', `₹${Math.round(businessBalance).toLocaleString('en-IN')}`);
        
        // Render custom accounts
        this.renderCustomAccounts();
    }

    /**
     * Calculate total stock value
     * @returns {number}
     */
    static calculateStockValue() {
        const stock = AppState.stock || {};
        let total = 0;
        
        Object.values(stock).forEach(item => {
            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            total += qty * rate;
        });
        
        return total;
    }

    /**
     * Calculate outstanding amounts
     * @returns {{dueToReceive: number, dueToPay: number}}
     */
    static calculateOutstanding() {
        const salesHistory = AppState.salesHistory || [];
        const purchaseHistory = AppState.purchaseHistory || [];
        
        let dueToReceive = 0;
        let dueToPay = 0;
        
        // Due from sales
        salesHistory.forEach(sale => {
            const total = parseFloat(sale.total) || 0;
            const paid = parseFloat(sale.amountPaid) || parseFloat(sale.cashPayment) || 0;
            const online = parseFloat(sale.onlinePayment) || 0;
            const due = total - paid - online;
            if (due > 0) dueToReceive += due;
        });
        
        // Due for purchases
        purchaseHistory.forEach(purchase => {
            const total = parseFloat(purchase.total) || 0;
            const paid = parseFloat(purchase.amountPaid) || parseFloat(purchase.cashPayment) || 0;
            const online = parseFloat(purchase.onlinePayment) || 0;
            const due = total - paid - online;
            if (due > 0) dueToPay += due;
        });
        
        return { dueToReceive, dueToPay };
    }

    /**
     * Calculate business balance (all-time profit - withdrawals)
     * @returns {number}
     */
    static calculateBusinessBalance() {
        const salesHistory = AppState.salesHistory || [];
        const retailSalesHistory = AppState.retailSalesHistory || [];
        const purchaseHistory = AppState.purchaseHistory || [];
        const expensesHistory = AppState.expensesHistory || [];
        const withdrawalsHistory = AppState.withdrawalsHistory || [];
        
        let revenue = 0;
        [...salesHistory, ...retailSalesHistory].forEach(s => revenue += parseFloat(s.total) || 0);
        
        let costs = 0;
        purchaseHistory.forEach(p => costs += parseFloat(p.total) || 0);
        expensesHistory.forEach(e => costs += parseFloat(e.amount) || 0);
        
        let withdrawals = 0;
        withdrawalsHistory.forEach(w => withdrawals += parseFloat(w.amount) || 0);
        
        return revenue - costs - withdrawals;
    }

    /**
     * Render custom accounts list
     */
    static renderCustomAccounts() {
        const container = document.getElementById('customAccountsList');
        if (!container) return;
        
        if (this.customAccounts.length === 0) {
            container.innerHTML = '<p class="empty-state">No custom accounts added yet. Click + to add.</p>';
            return;
        }
        
        let html = '';
        this.customAccounts.forEach((acc, index) => {
            const isAsset = acc.type === 'asset';
            html += `
                <div class="asset-item" onclick="window.app.finance.editAccount(${index})">
                    <div class="asset-info">
                        <span class="asset-icon">${acc.icon}</span>
                        <div>
                            <div class="asset-name">${acc.name}</div>
                            <div class="asset-desc">${isAsset ? 'Asset' : 'Liability'}</div>
                        </div>
                    </div>
                    <div class="asset-amount ${isAsset ? 'asset-positive' : 'asset-negative'}">
                        ${isAsset ? '' : '-'}₹${Math.round(acc.balance).toLocaleString('en-IN')}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    /**
     * Show add account modal
     */
    static showAddAccountModal() {
        document.getElementById('addAccountModal').style.display = 'flex';
        document.getElementById('newAccountName').value = '';
        document.getElementById('newAccountBalance').value = '';
        document.getElementById('newAccountType').value = 'asset';
        
        // Reset icon selection
        const picker = document.getElementById('accountIconPicker');
        picker.querySelectorAll('.icon-option').forEach((b, i) => {
            b.classList.toggle('active', i === 0);
        });
    }

    /**
     * Close add account modal
     */
    static closeAccountModal() {
        document.getElementById('addAccountModal').style.display = 'none';
    }

    /**
     * Save new account
     */
    static saveNewAccount() {
        const name = document.getElementById('newAccountName').value.trim();
        const balance = parseFloat(document.getElementById('newAccountBalance').value) || 0;
        const type = document.getElementById('newAccountType').value;
        const activeIcon = document.querySelector('#accountIconPicker .icon-option.active');
        const icon = activeIcon ? activeIcon.dataset.icon : '💳';
        
        if (!name) {
            UIManager.showToast('Please enter account name', 'error');
            return;
        }
        
        this.customAccounts.push({ name, balance, type, icon });
        this.saveCustomAccounts();
        this.closeAccountModal();
        this.renderAssets();
        UIManager.showToast('Account added successfully', 'success');
    }

    /**
     * Quick add a common account type
     */
    static quickAddAccount(name, icon) {
        // Check if already exists
        if (this.customAccounts.some(a => a.name === name)) {
            UIManager.showToast('Account already exists', 'error');
            return;
        }
        
        this.customAccounts.push({ name, balance: 0, type: 'asset', icon });
        this.saveCustomAccounts();
        this.renderAssets();
        UIManager.showToast(`${name} added`, 'success');
    }

    /**
     * Edit existing account
     */
    static editAccount(index) {
        const acc = this.customAccounts[index];
        if (!acc) return;
        
        document.getElementById('editAccountId').value = index;
        document.getElementById('editAccountName').value = acc.name;
        document.getElementById('editAccountBalance').value = acc.balance;
        document.getElementById('editAccountModal').style.display = 'flex';
    }

    /**
     * Close edit account modal
     */
    static closeEditAccountModal() {
        document.getElementById('editAccountModal').style.display = 'none';
    }

    /**
     * Update existing account
     */
    static updateAccount() {
        const index = parseInt(document.getElementById('editAccountId').value);
        const name = document.getElementById('editAccountName').value.trim();
        const balance = parseFloat(document.getElementById('editAccountBalance').value) || 0;
        
        if (!name) {
            UIManager.showToast('Please enter account name', 'error');
            return;
        }
        
        if (this.customAccounts[index]) {
            this.customAccounts[index].name = name;
            this.customAccounts[index].balance = balance;
            this.saveCustomAccounts();
            this.closeEditAccountModal();
            this.renderAssets();
            UIManager.showToast('Account updated', 'success');
        }
    }

    /**
     * Delete account
     */
    static deleteAccount() {
        const index = parseInt(document.getElementById('editAccountId').value);
        
        if (confirm('Are you sure you want to delete this account?')) {
            this.customAccounts.splice(index, 1);
            this.saveCustomAccounts();
            this.closeEditAccountModal();
            this.renderAssets();
            UIManager.showToast('Account deleted', 'success');
        }
    }

    /**
     * Render withdrawals section
     */
    static renderWithdrawals() {
        const withdrawalsHistory = AppState.withdrawalsHistory || [];
        
        let totalWithdrawn = 0;
        withdrawalsHistory.forEach(w => totalWithdrawn += parseFloat(w.amount) || 0);
        
        // Calculate available = all-time profit - already withdrawn
        const salesHistory = AppState.salesHistory || [];
        const retailSalesHistory = AppState.retailSalesHistory || [];
        const purchaseHistory = AppState.purchaseHistory || [];
        const expensesHistory = AppState.expensesHistory || [];
        
        let revenue = 0;
        [...salesHistory, ...retailSalesHistory].forEach(s => revenue += parseFloat(s.total) || 0);
        let costs = 0;
        purchaseHistory.forEach(p => costs += parseFloat(p.total) || 0);
        expensesHistory.forEach(e => costs += parseFloat(e.amount) || 0);
        
        const profit = revenue - costs;
        const available = profit - totalWithdrawn;
        
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        updateElement('withdrawalTotal', `₹${Math.round(totalWithdrawn).toLocaleString('en-IN')}`);
        updateElement('withdrawalAvailable', `₹${Math.round(available).toLocaleString('en-IN')}`);
        
        // Populate person datalist
        this.populateWithdrawalPersons();
        
        // Render history
        this.renderWithdrawalHistory();
    }

    /**
     * Populate withdrawal persons datalist
     */
    static populateWithdrawalPersons() {
        const withdrawalsHistory = AppState.withdrawalsHistory || [];
        const persons = [...new Set(withdrawalsHistory.map(w => w.person).filter(Boolean))];
        
        const datalist = document.getElementById('withdrawalPersonOptions');
        if (datalist) {
            datalist.innerHTML = persons.map(p => `<option value="${p}">`).join('');
        }
    }

    /**
     * Toggle other purpose input visibility
     */
    static toggleOtherPurpose() {
        const purpose = document.getElementById('withdrawalPurpose').value;
        const otherRow = document.getElementById('withdrawalOtherPurposeRow');
        if (otherRow) {
            otherRow.style.display = purpose === 'Other' ? 'block' : 'none';
        }
    }

    /**
     * Record a new withdrawal
     */
    static async recordWithdrawal() {
        const amount = parseFloat(document.getElementById('withdrawalAmount').value);
        const person = document.getElementById('withdrawalPerson').value.trim();
        let purpose = document.getElementById('withdrawalPurpose').value;
        const date = document.getElementById('withdrawalDate').value;
        
        if (purpose === 'Other') {
            purpose = document.getElementById('withdrawalOtherPurpose').value.trim() || 'Other';
        }
        
        if (!amount || amount <= 0) {
            UIManager.showToast('Please enter a valid amount', 'error');
            return;
        }
        
        if (!person) {
            UIManager.showToast('Please enter who withdrew the money', 'error');
            return;
        }
        
        if (!date) {
            UIManager.showToast('Please select a date', 'error');
            return;
        }
        
        try {
            const withdrawal = {
                amount,
                person,
                purpose,
                date,
                createdAt: new Date().toISOString()
            };
            
            await FirebaseService.addWithdrawal(withdrawal);
            
            // Clear form
            document.getElementById('withdrawalAmount').value = '';
            document.getElementById('withdrawalPerson').value = '';
            document.getElementById('withdrawalPurpose').value = 'Personal Use';
            document.getElementById('withdrawalOtherPurpose').value = '';
            document.getElementById('withdrawalOtherPurposeRow').style.display = 'none';
            this.setDefaultDate();
            
            UIManager.showToast('Withdrawal recorded successfully', 'success');
            this.renderWithdrawals();
        } catch (error) {
            console.error('Error recording withdrawal:', error);
            UIManager.showToast('Error recording withdrawal', 'error');
        }
    }

    /**
     * Render withdrawal history
     */
    static renderWithdrawalHistory() {
        const container = document.getElementById('withdrawalHistoryList');
        if (!container) return;
        
        const withdrawalsHistory = AppState.withdrawalsHistory || [];
        
        if (withdrawalsHistory.length === 0) {
            container.innerHTML = '<p class="empty-state">No withdrawals recorded yet</p>';
            return;
        }
        
        // Sort by date descending
        const sorted = [...withdrawalsHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        let html = '<div class="withdrawal-list">';
        sorted.forEach(w => {
            const date = new Date(w.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            html += `
                <div class="withdrawal-item">
                    <div class="withdrawal-info">
                        <div class="withdrawal-person">💸 ${w.person}</div>
                        <div class="withdrawal-purpose">${w.purpose}</div>
                        <div class="withdrawal-date">${date}</div>
                    </div>
                    <div class="withdrawal-amount">-₹${Math.round(w.amount).toLocaleString('en-IN')}</div>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
    }
}
