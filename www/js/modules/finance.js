import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { Helpers } from '../utils/helpers.js';

export class FinanceManager {
    static filterTab(view, evt) {
        // Update button states
        const buttons = document.querySelectorAll('#finance .filter-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (evt) evt.currentTarget.classList.add('active');
        
        // Show/hide sections
        document.getElementById('financeOverviewSection').style.display = view === 'overview' ? 'block' : 'none';
        document.getElementById('financeTransactionsSection').style.display = view === 'transactions' ? 'block' : 'none';
        document.getElementById('financeWithdrawalsSection').style.display = view === 'withdrawals' ? 'block' : 'none';
        
        // Render content for the selected view
        if (view === 'overview') {
            this.calculateOverview();
        } else if (view === 'transactions') {
            this.renderTransactions();
        } else if (view === 'withdrawals') {
            this.renderWithdrawalHistory();
        }
    }

    static calculateOverview() {
        const salesHistory = AppState.salesHistory || [];
        const billHistory = AppState.billHistory || [];
        const expensesHistory = AppState.expensesHistory || [];
        const withdrawalsHistory = AppState.withdrawalsHistory || [];

        // Calculate total revenue from sales and sales expenses
        let totalRevenue = 0;
        let salesExpenses = 0;
        salesHistory.forEach(sale => {
            totalRevenue += parseFloat(sale.total) || 0;
            // Sales may have their own expenses (like transport, packaging, etc.)
            salesExpenses += parseFloat(sale.expenses) || 0;
        });
        
        // Calculate total purchases
        let totalPurchases = 0;
        billHistory.forEach(bill => {
            totalPurchases += parseFloat(bill.total) || 0;
        });
        
        // Calculate business and personal expenses (from Miscellaneous tab)
        let businessExpenses = 0;
        let personalExpenses = 0;
        expensesHistory.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0;
            if (payment.category === 'business') {
                businessExpenses += amount;
            } else if (payment.category === 'personal') {
                personalExpenses += amount;
            }
        });
        
        // Calculate total withdrawals
        let totalWithdrawals = 0;
        withdrawalsHistory.forEach(withdrawal => {
            totalWithdrawals += parseFloat(withdrawal.amount) || 0;
        });
        
        // Calculate profit and balance
        // Profit = Revenue - Purchase Costs - Sales Expenses - Business Expenses - Personal Expenses
        const totalExpenses = salesExpenses + businessExpenses + personalExpenses;
        const profit = totalRevenue - totalPurchases - totalExpenses;
        const balance = profit - totalWithdrawals;
        
        // Update stats cards (no decimals)
        document.getElementById('currentBalance').textContent = Math.round(balance);
        document.getElementById('totalRevenue').textContent = Math.round(totalRevenue);
        document.getElementById('totalProfit').textContent = Math.round(profit);
        document.getElementById('businessExpensesTotal').textContent = Math.round(businessExpenses);
        document.getElementById('personalExpensesTotal').textContent = Math.round(personalExpenses);
        document.getElementById('totalWithdrawals').textContent = Math.round(totalWithdrawals);
        
        // Render account breakdown
        this.renderAccountBreakdown(totalRevenue, totalPurchases, salesExpenses, businessExpenses, personalExpenses, totalWithdrawals, balance);
        
        // Render monthly profit chart
        this.renderMonthlyProfitChart();
    }

    static renderAccountBreakdown(revenue, purchases, salesExp, businessExp, personalExp, withdrawals, balance) {
        const tbody = document.querySelector('#accountBreakdownTable tbody');
        if (!tbody) return;
        
        let html = `
            <tr>
                <td>Sales Revenue</td>
                <td style="color: #22c55e;">+₹${Math.round(revenue)}</td>
            </tr>
            <tr>
                <td>Purchase Costs</td>
                <td style="color: #dc3545;">-₹${Math.round(purchases)}</td>
            </tr>`;
        
        // Only show sales expenses if there are any
        if (salesExp > 0) {
            html += `
            <tr>
                <td>Sales Expenses</td>
                <td style="color: #dc3545;">-₹${Math.round(salesExp)}</td>
            </tr>`;
        }
        
        html += `
            <tr>
                <td>Business Expenses</td>
                <td style="color: #dc3545;">-₹${Math.round(businessExp)}</td>
            </tr>
            <tr>
                <td>Personal Expenses</td>
                <td style="color: #dc3545;">-₹${Math.round(personalExp)}</td>
            </tr>
            <tr>
                <td>Withdrawals</td>
                <td style="color: #dc3545;">-₹${Math.round(withdrawals)}</td>
            </tr>
            <tr style="border-top: 2px solid #333; font-weight: bold;">
                <td>Current Balance</td>
                <td style="color: ${balance >= 0 ? '#22c55e' : '#dc3545'};">₹${Math.round(balance)}</td>
            </tr>
        `;
        
        tbody.innerHTML = html;
    }

    static renderMonthlyProfitChart() {
        const salesHistory = AppState.salesHistory || [];
        const billHistory = AppState.billHistory || [];
        const expensesHistory = AppState.expensesHistory || [];
        
        // Group transactions by month
        const monthlyData = {};
        
        // Process sales (revenue and their expenses)
        salesHistory.forEach(sale => {
            const date = new Date(sale.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { revenue: 0, costs: 0 };
            }
            monthlyData[monthKey].revenue += parseFloat(sale.total) || 0;
            monthlyData[monthKey].costs += parseFloat(sale.expenses) || 0; // Add sales expenses
        });
        
        // Process purchases
        billHistory.forEach(bill => {
            const date = new Date(bill.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { revenue: 0, costs: 0 };
            }
            monthlyData[monthKey].costs += parseFloat(bill.total) || 0;
        });
        
        // Process expenses (business and personal from Miscellaneous tab)
        expensesHistory.forEach(payment => {
            const date = new Date(payment.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { revenue: 0, costs: 0 };
            }
            monthlyData[monthKey].costs += parseFloat(payment.amount) || 0;
        });
        
        // Sort by month and get last 6 months
        const sortedMonths = Object.keys(monthlyData).sort().slice(-6);
        
        // Create simple bar chart HTML
        const chartContainer = document.getElementById('monthlyProfitChart');
        if (!chartContainer) return;
        
        let chartHTML = '<div style="display: flex; align-items: flex-end; justify-content: space-around; height: 200px; padding: 10px;">';
        
        if (sortedMonths.length === 0) {
            chartHTML = '<p style="text-align: center; color: #888; padding: 40px;">No data available</p>';
        } else {
            sortedMonths.forEach(month => {
                const data = monthlyData[month];
                const profit = data.revenue - data.costs;
                const maxProfit = Math.max(...sortedMonths.map(m => monthlyData[m].revenue - monthlyData[m].costs), 1);
                const height = Math.max(10, Math.abs(profit / maxProfit) * 180);
                const color = profit >= 0 ? '#22c55e' : '#dc3545';
                const [year, monthNum] = month.split('-');
                const monthName = new Date(year, parseInt(monthNum) - 1).toLocaleString('en', { month: 'short' });
                
                chartHTML += `
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <div style="background: ${color}; width: 40px; height: ${height}px; border-radius: 4px 4px 0 0;"></div>
                        <div style="font-size: 10px; margin-top: 5px;">${monthName}</div>
                        <div style="font-size: 9px; color: #888;">₹${(profit / 1000).toFixed(1)}k</div>
                    </div>
                `;
            });
            chartHTML += '</div>';
        }
        
        chartContainer.innerHTML = chartHTML;
    }

    static renderTransactions() {
        const salesHistory = AppState.salesHistory || [];
        const billHistory = AppState.billHistory || [];
        const expensesHistory = AppState.expensesHistory || [];
        const withdrawalsHistory = AppState.withdrawalsHistory || [];
        
        const container = document.getElementById('allTransactionsList');
        if (!container) return;
        
        // Combine all transactions
        const allTransactions = [];
        
        salesHistory.forEach(sale => {
            allTransactions.push({
                date: new Date(sale.date),
                type: 'Sale',
                description: sale.customerName ? `Sale to ${sale.customerName}` : 'Sale',
                amount: parseFloat(sale.total),
                isIncome: true,
                id: sale.id
            });
            
            // Add sales expenses as separate transaction if present
            const expenses = parseFloat(sale.expenses);
            if (expenses > 0) {
                allTransactions.push({
                    date: new Date(sale.date),
                    type: 'Sale Expense',
                    description: `Expense for ${sale.customerName ? 'sale to ' + sale.customerName : 'sale'}`,
                    amount: expenses,
                    isIncome: false,
                    id: sale.id + '_expense'
                });
            }
        });
        
        billHistory.forEach(bill => {
            allTransactions.push({
                date: new Date(bill.date),
                type: 'Purchase',
                description: bill.customerName ? `Purchase from ${bill.customerName}` : 'Purchase',
                amount: parseFloat(bill.total),
                isIncome: false,
                id: bill.id
            });
        });
        
        expensesHistory.forEach(payment => {
            allTransactions.push({
                date: new Date(payment.date),
                type: payment.category === 'business' ? 'Business Expense' : 'Personal Expense',
                description: payment.purpose || 'Expense',
                amount: parseFloat(payment.amount),
                isIncome: false,
                id: payment.id
            });
        });
        
        withdrawalsHistory.forEach(withdrawal => {
            allTransactions.push({
                date: new Date(withdrawal.date),
                type: 'Withdrawal',
                description: `${withdrawal.purpose || 'Withdrawal'} (${withdrawal.person || 'Unknown'})`,
                amount: parseFloat(withdrawal.amount),
                isIncome: false,
                id: withdrawal.id
            });
        });
        
        // Sort by date descending
        allTransactions.sort((a, b) => b.date - a.date);
        
        // Render transactions
        if (allTransactions.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No transactions yet</p>';
            return;
        }
        
        let html = '<div class="history-list">';
        allTransactions.forEach(txn => {
            const dateStr = txn.date.toLocaleDateString('en-IN');
            const amountColor = txn.isIncome ? '#22c55e' : '#dc3545';
            const amountSign = txn.isIncome ? '+' : '-';
            
            html += `
                <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #333;">
                    <div>
                        <div style="font-weight: 500;">${txn.type}</div>
                        <div style="font-size: 12px; color: #888;">${txn.description}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">${dateStr}</div>
                    </div>
                    <div style="font-weight: 600; color: ${amountColor}; font-size: 14px;">
                        ${amountSign}₹${Math.round(txn.amount)}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
    }

    static async recordWithdrawal() {
        const amount = Helpers.getInputInt('withdrawalAmount');
        const person = Helpers.getInputText('withdrawalPerson');
        const purpose = Helpers.getInputText('withdrawalPurpose');
        const date = Helpers.getInputText('withdrawalDate');
        
        if (!amount || amount <= 0) {
            UIManager.showToast('Please enter a valid withdrawal amount');
            return;
        }
        
        if (!person) {
            UIManager.showToast('Please enter the person name');
            return;
        }
        
        if (!purpose) {
            UIManager.showToast('Please enter the withdrawal purpose');
            return;
        }
        
        if (!date) {
            UIManager.showToast('Please select a date');
            return;
        }
        
        try {
            const withdrawal = {
                amount: amount,
                person: person,
                purpose: purpose,
                date: date,
                withdrawnBy: AppState.currentUser?.uid || 'unknown',
                withdrawnByName: AppState.userName || 'Unknown',
                timestamp: Date.now(),
                createdAt: Helpers.getCurrentDateTime()
            };
            
            await FirebaseService.saveWithdrawal(withdrawal);
            
            // Add to local state
            AppState.withdrawalsHistory.push(withdrawal);
            
            // Clear form
            document.getElementById('withdrawalAmount').value = '';
            document.getElementById('withdrawalPerson').value = '';
            document.getElementById('withdrawalPurpose').value = '';
            document.getElementById('withdrawalDate').value = new Date().toISOString().split('T')[0];
            
            UIManager.showToast('✓ Withdrawal recorded successfully');
            UIManager.hapticFeedback();
            
            // Update displays
            this.renderWithdrawalHistory();
            this.calculateOverview();
            
        } catch (error) {
            console.error('Error recording withdrawal:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static renderWithdrawalHistory() {
        const withdrawalsHistory = AppState.withdrawalsHistory || [];
        const container = document.getElementById('withdrawalHistoryList');
        if (!container) return;
        
        if (withdrawalsHistory.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No withdrawals recorded yet</p>';
            return;
        }
        
        // Sort by date descending
        const sorted = [...withdrawalsHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        let html = '<div class="history-list">';
        sorted.forEach(withdrawal => {
            const date = new Date(withdrawal.date).toLocaleDateString('en-IN');
            
            html += `
                <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #333;">
                    <div>
                        <div style="font-weight: 500;">${withdrawal.person}</div>
                        <div style="font-size: 12px; color: #888;">${withdrawal.purpose}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">${date} • ${withdrawal.withdrawnByName || 'Unknown'}</div>
                    </div>
                    <div style="font-weight: 600; color: #dc3545; font-size: 14px;">
                        -₹${Math.round(withdrawal.amount)}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
    }

    static updateWithdrawalPersonOptions() {
        const datalist = document.getElementById('withdrawalPersonOptions');
        if (!datalist) return;
        
        const withdrawalsHistory = AppState.withdrawalsHistory || [];
        const people = new Set();
        
        withdrawalsHistory.forEach(w => {
            if (w.person) people.add(w.person);
        });
        
        datalist.innerHTML = '';
        people.forEach(person => {
            const option = document.createElement('option');
            option.value = person;
            datalist.appendChild(option);
        });
    }

    static init() {
        // Set default date for withdrawal form
        const dateInput = document.getElementById('withdrawalDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        
        // Update person options
        this.updateWithdrawalPersonOptions();
        
        // Show overview by default
        this.filterTab('overview', null);
    }
}
