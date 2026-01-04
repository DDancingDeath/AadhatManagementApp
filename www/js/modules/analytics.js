/**
 * @fileoverview Analytics Module
 * Provides data visualization and business insights
 * Includes overview metrics, sales analytics, item performance, and customer analysis
 * @module modules/analytics
 */

import { AppState } from '../utils/state.js';

/**
 * Analytics Manager - Manages business analytics and reporting
 * @class AnalyticsManager
 */
export class AnalyticsManager {
    /**
     * Current analytics view
     * @type {'overview'|'sales'|'items'|'customers'}
     */
    static currentView = 'overview';
    
    /**
     * Current time period filter
     * @type {'7days'|'30days'|'90days'|'all'}
     */
    static currentPeriod = '30days';

    /**
     * Get item ID and display name from item name
     * Resolves item by name or Hindi name to get consistent ID
     * @param {string} itemName - Name of the item to look up
     * @returns {{id: string, displayName: string}} Item info object
     */
    static getItemInfo(itemName) {
        if (!itemName) return { id: 'unknown', displayName: 'Unknown' };
        
        // Try to find the item in AppState.items by name or Hindi name
        const item = AppState.items.find(i => 
            i.name === itemName || i.hindiName === itemName
        );
        
        if (item) {
            // Use English name for display
            return { id: item.id, displayName: item.name };
        }
        
        // If not found, use the name itself as both ID and display name
        return { id: itemName, displayName: itemName };
    }

    /**
     * Switch between analytics view tabs
     * @param {'overview'|'sales'|'items'|'customers'} view - View to display
     * @param {Event} [evt] - Optional click event for button styling
     */
    static filterTab(view, evt) {
        this.currentView = view;
        
        // Update button states
        document.querySelectorAll('#analytics .filter-btn').forEach(btn => {
            if (btn.textContent.toLowerCase().includes(view)) {
                btn.classList.add('active');
            } else if (!btn.textContent.toLowerCase().includes('days') && !btn.textContent.toLowerCase().includes('time')) {
                btn.classList.remove('active');
            }
        });
        
        // Show/hide sections
        const sections = {
            overview: document.getElementById('analyticsOverviewSection'),
            sales: document.getElementById('analyticsSalesSection'),
            items: document.getElementById('analyticsItemsSection'),
            customers: document.getElementById('analyticsCustomersSection')
        };
        
        Object.keys(sections).forEach(key => {
            if (sections[key]) {
                sections[key].style.display = key === view ? 'block' : 'none';
            }
        });
        
        this.renderAnalytics();
    }

    /**
     * Set the time period filter for analytics data
     * @param {'7days'|'30days'|'90days'|'all'} period - Period to filter by
     * @param {Event} [evt] - Optional click event for button styling
     */
    static setPeriod(period, evt) {
        this.currentPeriod = period;
        AppState.analyticsPeriod = period;
        
        // Update period button states
        const periodButtons = document.querySelectorAll('#analytics .settings-card .filter-btn');
        periodButtons.forEach(btn => {
            if (btn.onclick && btn.onclick.toString().includes(period)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        this.renderAnalytics();
    }

    /**
     * Get filtered data based on current period
     * Filters bills, sales, and expenses by date
     * @returns {{bills: Array, sales: Array, expenses: {business: Array, personal: Array}}}
     */
    static getFilteredData() {
        const now = new Date();
        let cutoffDate = null;
        
        switch (this.currentPeriod) {
            case '7days':
                cutoffDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30days':
                cutoffDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90days':
                cutoffDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
                break;
            case 'all':
            default:
                cutoffDate = null;
        }
        
        const filterByDate = (item) => {
            if (!cutoffDate) return true;
            const itemDate = item.timestamp ? new Date(item.timestamp) : new Date(item.date);
            return itemDate >= cutoffDate;
        };
        
        return {
            bills: AppState.billHistory.filter(filterByDate),
            sales: AppState.salesHistory.filter(filterByDate),
            expenses: {
                business: (AppState.businessExpenses || []).filter(filterByDate),
                personal: (AppState.personalExpenses || []).filter(filterByDate)
            }
        };
    }

    /**
     * Render the appropriate analytics view based on currentView
     */
    static renderAnalytics() {
        switch (this.currentView) {
            case 'overview':
                this.renderOverview();
                break;
            case 'sales':
                this.renderSalesAnalytics();
                break;
            case 'items':
                this.renderItemsAnalytics();
                break;
            case 'customers':
                this.renderCustomersAnalytics();
                break;
        }
    }

    /**
     * Render the overview analytics section
     * Shows key metrics, trends, and health scorecard
     */
    static renderOverview() {
        const data = this.getFilteredData();
        const { bills, sales } = data;
        
        // Calculate key metrics
        const totalTransactions = bills.length + sales.length;
        
        const totalPurchases = bills.reduce((sum, bill) => sum + (bill.grandTotal || bill.total || 0), 0);
        const totalSalesRevenue = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
        
        // Calculate profit from sales (includes expenses)
        const totalProfit = sales.reduce((sum, sale) => sum + (sale.profit || 0), 0);
        
        const avgTransaction = totalTransactions > 0 ? (totalPurchases + totalSalesRevenue) / totalTransactions : 0;
        const profitMargin = totalSalesRevenue > 0 ? (totalProfit / totalSalesRevenue) * 100 : 0;
        
        // Update key metrics
        document.getElementById('analyticsTransactionCount').textContent = totalTransactions;
        document.getElementById('analyticsAvgTransaction').textContent = Math.round(avgTransaction);
        document.getElementById('analyticsTotalProfit').textContent = Math.round(totalProfit);
        document.getElementById('analyticsProfitMargin').textContent = profitMargin.toFixed(1);
        
        // Render daily trend chart
        this.renderDailyTrendChart(sales);
        
        // Render health scorecard
        this.renderHealthScorecard(data);
    }

    static renderDailyTrendChart(sales) {
        const chartContainer = document.getElementById('dailyTrendChart');
        if (!chartContainer) return;
        
        // Group sales by day
        const dailyData = {};
        
        sales.forEach(sale => {
            const date = sale.date ? new Date(sale.date).toLocaleDateString('en-IN') : 'Unknown';
            if (!dailyData[date]) {
                dailyData[date] = { revenue: 0, profit: 0, count: 0 };
            }
            dailyData[date].revenue += sale.total || 0;
            dailyData[date].profit += sale.profit || 0;
            dailyData[date].count += 1;
        });
        
        // Sort by date
        const sortedDates = Object.keys(dailyData).sort((a, b) => {
            return new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-'));
        });
        
        if (sortedDates.length === 0) {
            chartContainer.innerHTML = '<p style="text-align: center; color: #888; padding: 40px;">No sales data available for this period</p>';
            return;
        }
        
        // Find max values for scaling
        const maxRevenue = Math.max(...sortedDates.map(date => dailyData[date].revenue));
        const maxProfit = Math.max(...sortedDates.map(date => dailyData[date].profit));
        const maxValue = Math.max(maxRevenue, maxProfit);
        
        let chartHTML = '<div style="display: flex; gap: 8px; align-items: flex-end; height: 200px; padding: 10px; overflow-x: auto;">';
        
        sortedDates.forEach(date => {
            const data = dailyData[date];
            const revenueHeight = maxValue > 0 ? (data.revenue / maxValue) * 180 : 0;
            const profitHeight = maxValue > 0 ? (data.profit / maxValue) * 180 : 0;
            
            chartHTML += `
                <div style="flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 60px;">
                    <div style="display: flex; gap: 4px; align-items: flex-end; height: 180px;">
                        <div style="width: 20px; height: ${revenueHeight}px; background: linear-gradient(to top, #667eea, #764ba2); border-radius: 4px 4px 0 0;" 
                             title="Revenue: ₹${Math.round(data.revenue)}"></div>
                        <div style="width: 20px; height: ${profitHeight}px; background: linear-gradient(to top, #11998e, #38ef7d); border-radius: 4px 4px 0 0;"
                             title="Profit: ₹${Math.round(data.profit)}"></div>
                    </div>
                    <div style="font-size: 10px; color: #666; writing-mode: horizontal-tb; transform: rotate(-45deg); transform-origin: center; margin-top: 20px;">
                        ${date.split('/').slice(0, 2).join('/')}
                    </div>
                </div>
            `;
        });
        
        chartHTML += '</div>';
        chartHTML += `
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px; font-size: 13px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 16px; height: 16px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 3px;"></div>
                    <span>Revenue</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 16px; height: 16px; background: linear-gradient(135deg, #11998e, #38ef7d); border-radius: 3px;"></div>
                    <span>Profit</span>
                </div>
            </div>
        `;
        
        chartContainer.innerHTML = chartHTML;
    }

    static renderHealthScorecard(data) {
        const container = document.getElementById('healthScorecard');
        if (!container) return;
        
        const { bills, sales } = data;
        
        // Calculate metrics
        const totalOutstanding = [...bills, ...sales].reduce((sum, txn) => {
            return sum + (txn.payment?.due || 0);
        }, 0);
        
        const clearedCount = [...bills, ...sales].filter(txn => txn.cleared).length;
        const totalCount = bills.length + sales.length;
        const clearanceRate = totalCount > 0 ? (clearedCount / totalCount) * 100 : 0;
        
        const avgDaysToPayment = this.calculateAvgDaysToPayment([...bills, ...sales]);
        
        const stockValue = Object.keys(AppState.stock).reduce((sum, itemKey) => {
            const stockItem = AppState.stock[itemKey];
            return sum + (stockItem.quantity || 0) * (stockItem.rate || 0);
        }, 0);
        
        const salesWithExpenses = sales.filter(s => s.expenses && s.expenses > 0).length;
        const expenseTrackingRate = sales.length > 0 ? (salesWithExpenses / sales.length) * 100 : 0;
        
        const avgProfitPerSale = sales.length > 0 ? sales.reduce((sum, s) => sum + (s.profit || 0), 0) / sales.length : 0;
        
        container.innerHTML = `
            <div class="stats-card" style="background: ${totalOutstanding > 50000 ? '#fee' : '#efe'}; border-left: 4px solid ${totalOutstanding > 50000 ? '#dc3545' : '#28a745'};">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Outstanding Amount</div>
                <div style="font-size: 20px; font-weight: 700; color: ${totalOutstanding > 50000 ? '#dc3545' : '#28a745'};">₹${Math.round(totalOutstanding)}</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">${totalOutstanding > 50000 ? '⚠️ High' : '✓ Good'}</div>
            </div>
            
            <div class="stats-card" style="background: ${clearanceRate < 70 ? '#fee' : '#efe'}; border-left: 4px solid ${clearanceRate < 70 ? '#ffa500' : '#28a745'};">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Clearance Rate</div>
                <div style="font-size: 20px; font-weight: 700; color: ${clearanceRate < 70 ? '#ffa500' : '#28a745'};">${clearanceRate.toFixed(0)}%</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">${clearedCount}/${totalCount} cleared</div>
            </div>
            
            <div class="stats-card" style="background: #e3f2fd; border-left: 4px solid #2196f3;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Avg Collection Time</div>
                <div style="font-size: 20px; font-weight: 700; color: #2196f3;">${avgDaysToPayment.toFixed(0)} days</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">Payment cycle</div>
            </div>
            
            <div class="stats-card" style="background: #fff3e0; border-left: 4px solid #ff9800;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Stock Value</div>
                <div style="font-size: 20px; font-weight: 700; color: #ff9800;">₹${Math.round(stockValue)}</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">Current inventory</div>
            </div>
            
            <div class="stats-card" style="background: ${expenseTrackingRate > 50 ? '#efe' : '#fee'}; border-left: 4px solid ${expenseTrackingRate > 50 ? '#28a745' : '#ffa500'};">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Expense Tracking</div>
                <div style="font-size: 20px; font-weight: 700; color: ${expenseTrackingRate > 50 ? '#28a745' : '#ffa500'};">${expenseTrackingRate.toFixed(0)}%</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">${expenseTrackingRate > 50 ? '✓ Good practice' : '⚠️ Track more'}</div>
            </div>
            
            <div class="stats-card" style="background: #f3e5f5; border-left: 4px solid #9c27b0;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Avg Profit/Sale</div>
                <div style="font-size: 20px; font-weight: 700; color: #9c27b0;">₹${Math.round(avgProfitPerSale)}</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">Per transaction</div>
            </div>
        `;
    }

    static calculateAvgDaysToPayment(transactions) {
        const paidTransactions = transactions.filter(txn => {
            return txn.payments && txn.payments.length > 0;
        });
        
        if (paidTransactions.length === 0) return 0;
        
        const totalDays = paidTransactions.reduce((sum, txn) => {
            const createdDate = new Date(txn.date);
            const lastPayment = txn.payments[txn.payments.length - 1];
            const paymentDate = new Date(lastPayment.date);
            const daysDiff = (paymentDate - createdDate) / (1000 * 60 * 60 * 24);
            return sum + Math.max(0, daysDiff);
        }, 0);
        
        return totalDays / paidTransactions.length;
    }

    static renderSalesAnalytics() {
        const data = this.getFilteredData();
        const { bills, sales } = data;
        
        const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalPurchases = bills.reduce((sum, b) => sum + (b.grandTotal || b.total || 0), 0);
        
        document.getElementById('analyticsTotalSales').textContent = Math.round(totalSales);
        document.getElementById('analyticsTotalPurchases').textContent = Math.round(totalPurchases);
        document.getElementById('analyticsSalesCount').textContent = sales.length;
        document.getElementById('analyticsPurchaseCount').textContent = bills.length;
        
        this.renderSalesPurchasesChart(bills, sales);
        this.renderPaymentMethodsChart(bills, sales);
    }

    static renderSalesPurchasesChart(bills, sales) {
        const chartContainer = document.getElementById('salesPurchasesChart');
        if (!chartContainer) return;
        
        // Group by date
        const dailyData = {};
        
        bills.forEach(bill => {
            const date = bill.date ? new Date(bill.date).toLocaleDateString('en-IN') : 'Unknown';
            if (!dailyData[date]) dailyData[date] = { purchases: 0, sales: 0 };
            dailyData[date].purchases += bill.grandTotal || bill.total || 0;
        });
        
        sales.forEach(sale => {
            const date = sale.date ? new Date(sale.date).toLocaleDateString('en-IN') : 'Unknown';
            if (!dailyData[date]) dailyData[date] = { purchases: 0, sales: 0 };
            dailyData[date].sales += sale.total || 0;
        });
        
        const sortedDates = Object.keys(dailyData).sort((a, b) => {
            return new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-'));
        });
        
        if (sortedDates.length === 0) {
            chartContainer.innerHTML = '<p style="text-align: center; color: #888; padding: 40px;">No data available</p>';
            return;
        }
        
        const maxValue = Math.max(...sortedDates.map(date => Math.max(dailyData[date].purchases, dailyData[date].sales)));
        
        let chartHTML = '<div style="display: flex; gap: 8px; align-items: flex-end; height: 200px; padding: 10px; overflow-x: auto;">';
        
        sortedDates.forEach(date => {
            const data = dailyData[date];
            const purchasesHeight = maxValue > 0 ? (data.purchases / maxValue) * 180 : 0;
            const salesHeight = maxValue > 0 ? (data.sales / maxValue) * 180 : 0;
            
            chartHTML += `
                <div style="flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 60px;">
                    <div style="display: flex; gap: 4px; align-items: flex-end; height: 180px;">
                        <div style="width: 20px; height: ${purchasesHeight}px; background: linear-gradient(to top, #ee0979, #ff6a00); border-radius: 4px 4px 0 0;" 
                             title="Purchases: ₹${Math.round(data.purchases)}"></div>
                        <div style="width: 20px; height: ${salesHeight}px; background: linear-gradient(to top, #11998e, #38ef7d); border-radius: 4px 4px 0 0;"
                             title="Sales: ₹${Math.round(data.sales)}"></div>
                    </div>
                    <div style="font-size: 10px; color: #666; transform: rotate(-45deg); margin-top: 20px;">
                        ${date.split('/').slice(0, 2).join('/')}
                    </div>
                </div>
            `;
        });
        
        chartHTML += '</div>';
        chartHTML += `
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px; font-size: 13px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 16px; height: 16px; background: linear-gradient(135deg, #ee0979, #ff6a00); border-radius: 3px;"></div>
                    <span>Purchases</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 16px; height: 16px; background: linear-gradient(135deg, #11998e, #38ef7d); border-radius: 3px;"></div>
                    <span>Sales</span>
                </div>
            </div>
        `;
        
        chartContainer.innerHTML = chartHTML;
    }

    static renderPaymentMethodsChart(bills, sales) {
        const chartContainer = document.getElementById('paymentMethodsChart');
        if (!chartContainer) return;
        
        let totalCash = 0;
        let totalOnline = 0;
        let totalDue = 0;
        
        [...bills, ...sales].forEach(txn => {
            totalCash += txn.payment?.cash || 0;
            totalOnline += txn.payment?.online || 0;
            totalDue += txn.payment?.due || 0;
        });
        
        const total = totalCash + totalOnline + totalDue;
        
        if (total === 0) {
            chartContainer.innerHTML = '<p style="text-align: center; color: #888;">No payment data available</p>';
            return;
        }
        
        const cashPercent = (totalCash / total) * 100;
        const onlinePercent = (totalOnline / total) * 100;
        const duePercent = (totalDue / total) * 100;
        
        chartContainer.innerHTML = `
            <div style="display: flex; gap: 30px; align-items: center; flex-wrap: wrap; justify-content: center;">
                <div style="position: relative; width: 150px; height: 150px;">
                    <svg viewBox="0 0 36 36" style="transform: rotate(-90deg);">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e0e0e0" stroke-width="3"></circle>
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#28a745" stroke-width="3" 
                                stroke-dasharray="${cashPercent} ${100 - cashPercent}" stroke-dashoffset="0"></circle>
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#007bff" stroke-width="3" 
                                stroke-dasharray="${onlinePercent} ${100 - onlinePercent}" stroke-dashoffset="${-cashPercent}"></circle>
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#dc3545" stroke-width="3" 
                                stroke-dasharray="${duePercent} ${100 - duePercent}" stroke-dashoffset="${-(cashPercent + onlinePercent)}"></circle>
                    </svg>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                        <div style="font-size: 20px; font-weight: 700;">100%</div>
                        <div style="font-size: 11px; color: #666;">Payments</div>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: #28a745; border-radius: 3px;"></div>
                        <div>
                            <div style="font-size: 13px; color: #666;">Cash</div>
                            <div style="font-weight: 600;">₹${Math.round(totalCash)} (${cashPercent.toFixed(1)}%)</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: #007bff; border-radius: 3px;"></div>
                        <div>
                            <div style="font-size: 13px; color: #666;">Online</div>
                            <div style="font-weight: 600;">₹${Math.round(totalOnline)} (${onlinePercent.toFixed(1)}%)</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: #dc3545; border-radius: 3px;"></div>
                        <div>
                            <div style="font-size: 13px; color: #666;">Due</div>
                            <div style="font-weight: 600;">₹${Math.round(totalDue)} (${duePercent.toFixed(1)}%)</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    static renderItemsAnalytics() {
        const data = this.getFilteredData();
        
        this.renderTopSellingItemsByRevenue(data.sales);
        this.renderTopSellingItemsByQuantity(data.sales);
        this.renderTopPurchasedItems(data.bills);
        this.renderItemProfitability(data.sales);
    }

    static renderTopSellingItemsByRevenue(sales) {
        const container = document.getElementById('topSellingItemsRevenue');
        if (!container) return;
        
        const itemData = {};
        
        sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const itemInfo = this.getItemInfo(item.name);
                    if (!itemData[itemInfo.id]) {
                        itemData[itemInfo.id] = {
                            name: itemInfo.displayName,
                            revenue: 0
                        };
                    }
                    itemData[itemInfo.id].revenue += item.total || (item.rate * item.qty) || 0;
                });
            }
        });
        
        const sortedItems = Object.values(itemData)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
        
        if (sortedItems.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No item data available</p>';
            return;
        }
        
        const maxRevenue = sortedItems[0].revenue;
        
        let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
        
        sortedItems.forEach((item, index) => {
            const width = (item.revenue / maxRevenue) * 100;
            html += `
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 500; font-size: 14px;">${index + 1}. ${item.name}</span>
                        <span style="font-weight: 600; color: #28a745;">₹${Math.round(item.revenue)}</span>
                    </div>
                    <div style="background: #f0f0f0; height: 24px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #11998e, #38ef7d); height: 100%; width: ${width}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    static renderTopSellingItemsByQuantity(sales) {
        const container = document.getElementById('topSellingItemsQuantity');
        if (!container) return;
        
        const itemData = {};
        
        sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const itemInfo = this.getItemInfo(item.name);
                    if (!itemData[itemInfo.id]) {
                        itemData[itemInfo.id] = {
                            name: itemInfo.displayName,
                            qty: 0
                        };
                    }
                    itemData[itemInfo.id].qty += item.qty || 0;
                });
            }
        });
        
        const sortedItems = Object.values(itemData)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 10);
        
        if (sortedItems.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No item data available</p>';
            return;
        }
        
        const maxQty = sortedItems[0].qty;
        
        let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
        
        sortedItems.forEach((item, index) => {
            const width = (item.qty / maxQty) * 100;
            html += `
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 500; font-size: 14px;">${index + 1}. ${item.name}</span>
                        <span style="font-weight: 600; color: #007bff;">${item.qty.toFixed(1)} kg</span>
                    </div>
                    <div style="background: #f0f0f0; height: 24px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; width: ${width}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    static renderTopPurchasedItems(bills) {
        const container = document.getElementById('topPurchasedItems');
        if (!container) return;
        
        const itemData = {};
        
        bills.forEach(bill => {
            if (bill.items) {
                bill.items.forEach(item => {
                    const itemInfo = this.getItemInfo(item.name);
                    if (!itemData[itemInfo.id]) {
                        itemData[itemInfo.id] = {
                            name: itemInfo.displayName,
                            qty: 0,
                            value: 0
                        };
                    }
                    itemData[itemInfo.id].qty += item.qty || 0;
                    itemData[itemInfo.id].value += item.total || (item.rate * item.qty) || 0;
                });
            }
        });
        
        const sortedItems = Object.values(itemData)
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
        
        if (sortedItems.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No purchase data available</p>';
            return;
        }
        
        const maxValue = sortedItems[0].value;
        
        let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
        
        sortedItems.forEach((item, index) => {
            const width = (item.value / maxValue) * 100;
            html += `
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 500; font-size: 14px;">${index + 1}. ${item.name}</span>
                        <span style="font-weight: 600; color: #dc3545;">₹${Math.round(item.value)} (${item.qty.toFixed(1)} kg)</span>
                    </div>
                    <div style="background: #f0f0f0; height: 24px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #ee0979, #ff6a00); height: 100%; width: ${width}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    static renderItemProfitability(sales) {
        const container = document.getElementById('itemProfitability');
        if (!container) return;
        
        const itemData = {};
        
        sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const itemInfo = this.getItemInfo(item.name);
                    if (!itemData[itemInfo.id]) {
                        itemData[itemInfo.id] = {
                            name: itemInfo.displayName,
                            revenue: 0,
                            qty: 0,
                            count: 0
                        };
                    }
                    itemData[itemInfo.id].revenue += item.total || (item.rate * item.qty) || 0;
                    itemData[itemInfo.id].qty += item.qty || 0;
                    itemData[itemInfo.id].count += 1;
                });
            }
        });
        
        const sortedItems = Object.values(itemData)
            .map(item => ({
                name: item.name,
                revenue: item.revenue,
                qty: item.qty,
                count: item.count,
                avgRate: item.qty > 0 ? item.revenue / item.qty : 0
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 15);
        
        if (sortedItems.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No profitability data available</p>';
            return;
        }
        
        let html = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 12px; text-align: left; font-size: 13px;">#</th>
                            <th style="padding: 12px; text-align: left; font-size: 13px;">Item</th>
                            <th style="padding: 12px; text-align: right; font-size: 13px;">Revenue</th>
                            <th style="padding: 12px; text-align: right; font-size: 13px;">Quantity</th>
                            <th style="padding: 12px; text-align: right; font-size: 13px;">Avg Rate</th>
                            <th style="padding: 12px; text-align: right; font-size: 13px;">Sales</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sortedItems.forEach((item, index) => {
            html += `
                <tr style="border-bottom: 1px solid #e9ecef;">
                    <td style="padding: 12px; font-size: 13px;">${index + 1}</td>
                    <td style="padding: 12px; font-weight: 500; font-size: 13px;">${item.name}</td>
                    <td style="padding: 12px; text-align: right; font-weight: 600; color: #28a745; font-size: 13px;">₹${Math.round(item.revenue)}</td>
                    <td style="padding: 12px; text-align: right; font-size: 13px;">${item.qty.toFixed(1)} kg</td>
                    <td style="padding: 12px; text-align: right; font-size: 13px;">₹${item.avgRate.toFixed(2)}</td>
                    <td style="padding: 12px; text-align: right; font-size: 13px;">${item.count}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
    }

    static renderCustomersAnalytics() {
        const data = this.getFilteredData();
        
        this.renderTopCustomersByRevenue(data.sales);
        this.renderTopSuppliersByVolume(data.bills);
        this.renderCustomerPaymentBehavior(data.sales, data.bills);
        this.renderCustomerActivity(data.sales, data.bills);
    }

    static renderTopCustomersByRevenue(sales) {
        const container = document.getElementById('topCustomersByRevenue');
        if (!container) return;
        
        const customerRevenue = {};
        
        sales.forEach(sale => {
            const customer = sale.customerName || 'Walk-in';
            if (!customerRevenue[customer]) {
                customerRevenue[customer] = {
                    revenue: 0,
                    count: 0,
                    avgTransaction: 0
                };
            }
            customerRevenue[customer].revenue += sale.total || 0;
            customerRevenue[customer].count += 1;
        });
        
        Object.keys(customerRevenue).forEach(customer => {
            customerRevenue[customer].avgTransaction = customerRevenue[customer].revenue / customerRevenue[customer].count;
        });
        
        const sortedCustomers = Object.entries(customerRevenue)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .slice(0, 10);
        
        if (sortedCustomers.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No customer data available</p>';
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 16px;">';
        
        sortedCustomers.forEach(([name, data], index) => {
            const colors = ['#667eea', '#f093fb', '#4facfe', '#fa709a', '#11998e', '#ee0979', '#834d9b', '#2193b0', '#38ef7d', '#ff6a00'];
            const color = colors[index % colors.length];
            
            html += `
                <div style="background: linear-gradient(135deg, ${color}22, ${color}11); border-left: 4px solid ${color}; padding: 16px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; font-size: 15px;">${index + 1}. ${name}</span>
                        <span style="font-weight: 700; font-size: 18px; color: ${color};">₹${Math.round(data.revenue)}</span>
                    </div>
                    <div style="display: flex; gap: 20px; font-size: 13px; color: #666;">
                        <span>Transactions: <strong>${data.count}</strong></span>
                        <span>Avg: <strong>₹${Math.round(data.avgTransaction)}</strong></span>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    static renderTopSuppliersByVolume(bills) {
        const container = document.getElementById('topSuppliersByVolume');
        if (!container) return;
        
        const supplierData = {};
        
        bills.forEach(bill => {
            const supplier = bill.customerName || 'Unknown';
            if (!supplierData[supplier]) {
                supplierData[supplier] = {
                    volume: 0,
                    count: 0,
                    avgPurchase: 0
                };
            }
            supplierData[supplier].volume += bill.grandTotal || bill.total || 0;
            supplierData[supplier].count += 1;
        });
        
        Object.keys(supplierData).forEach(supplier => {
            supplierData[supplier].avgPurchase = supplierData[supplier].volume / supplierData[supplier].count;
        });
        
        const sortedSuppliers = Object.entries(supplierData)
            .sort((a, b) => b[1].volume - a[1].volume)
            .slice(0, 10);
        
        if (sortedSuppliers.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No supplier data available</p>';
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 16px;">';
        
        sortedSuppliers.forEach(([name, data], index) => {
            const colors = ['#ee0979', '#2193b0', '#834d9b', '#11998e', '#667eea', '#fa709a', '#4facfe', '#f093fb', '#ff6a00', '#38ef7d'];
            const color = colors[index % colors.length];
            
            html += `
                <div style="background: linear-gradient(135deg, ${color}22, ${color}11); border-left: 4px solid ${color}; padding: 16px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; font-size: 15px;">${index + 1}. ${name}</span>
                        <span style="font-weight: 700; font-size: 18px; color: ${color};">₹${Math.round(data.volume)}</span>
                    </div>
                    <div style="display: flex; gap: 20px; font-size: 13px; color: #666;">
                        <span>Orders: <strong>${data.count}</strong></span>
                        <span>Avg: <strong>₹${Math.round(data.avgPurchase)}</strong></span>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    static renderCustomerPaymentBehavior(sales, bills) {
        const container = document.getElementById('customerPaymentBehavior');
        if (!container) return;
        
        const paymentStats = {
            promptPayers: 0,
            delayedPayers: 0,
            defaulters: 0
        };
        
        [...sales, ...bills].forEach(txn => {
            if (txn.cleared) {
                paymentStats.promptPayers++;
            } else if (txn.payment && txn.payment.due > 0) {
                const daysSince = (new Date() - new Date(txn.date)) / (1000 * 60 * 60 * 24);
                if (daysSince > 30) {
                    paymentStats.defaulters++;
                } else {
                    paymentStats.delayedPayers++;
                }
            }
        });
        
        const total = paymentStats.promptPayers + paymentStats.delayedPayers + paymentStats.defaulters;
        
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                <div class="stats-card" style="background: linear-gradient(135deg, #11998e, #38ef7d); color: white;">
                    <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px;">Prompt Payers</div>
                    <div style="font-size: 32px; font-weight: 700;">${paymentStats.promptPayers}</div>
                    <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">${total > 0 ? ((paymentStats.promptPayers / total) * 100).toFixed(0) : 0}% of customers</div>
                </div>
                <div class="stats-card" style="background: linear-gradient(135deg, #fa709a, #fee140); color: white;">
                    <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px;">Delayed Payers</div>
                    <div style="font-size: 32px; font-weight: 700;">${paymentStats.delayedPayers}</div>
                    <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">${total > 0 ? ((paymentStats.delayedPayers / total) * 100).toFixed(0) : 0}% of customers</div>
                </div>
                <div class="stats-card" style="background: linear-gradient(135deg, #ee0979, #ff6a00); color: white;">
                    <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px;">Defaulters (30+ days)</div>
                    <div style="font-size: 32px; font-weight: 700;">${paymentStats.defaulters}</div>
                    <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">${total > 0 ? ((paymentStats.defaulters / total) * 100).toFixed(0) : 0}% of customers</div>
                </div>
            </div>
        `;
    }

    static renderCustomerActivity(sales, bills) {
        const container = document.getElementById('customerActivity');
        if (!container) return;
        
        const uniqueCustomers = new Set();
        const uniqueSuppliers = new Set();
        
        sales.forEach(sale => {
            if (sale.customerName) uniqueCustomers.add(sale.customerName);
        });
        
        bills.forEach(bill => {
            if (bill.customerName) uniqueSuppliers.add(bill.customerName);
        });
        
        const repeatCustomers = sales.filter(sale => {
            const customerSales = sales.filter(s => s.customerName === sale.customerName);
            return customerSales.length > 1;
        }).length;
        
        const repeatSuppliers = bills.filter(bill => {
            const supplierBills = bills.filter(b => b.customerName === bill.customerName);
            return supplierBills.length > 1;
        }).length;
        
        container.innerHTML = `
            <div class="stats-card" style="background: #e3f2fd; border-left: 4px solid #2196f3;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Unique Customers</div>
                <div style="font-size: 24px; font-weight: 700; color: #2196f3;">${uniqueCustomers.size}</div>
            </div>
            <div class="stats-card" style="background: #fce4ec; border-left: 4px solid #e91e63;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Unique Suppliers</div>
                <div style="font-size: 24px; font-weight: 700; color: #e91e63;">${uniqueSuppliers.size}</div>
            </div>
            <div class="stats-card" style="background: #f3e5f5; border-left: 4px solid #9c27b0;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Repeat Customers</div>
                <div style="font-size: 24px; font-weight: 700; color: #9c27b0;">${repeatCustomers}</div>
            </div>
            <div class="stats-card" style="background: #fff3e0; border-left: 4px solid #ff9800;">
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Repeat Suppliers</div>
                <div style="font-size: 24px; font-weight: 700; color: #ff9800;">${repeatSuppliers}</div>
            </div>
        `;
    }

    static init() {
        this.currentView = 'overview';
        this.currentPeriod = AppState.analyticsPeriod || '30days';
        this.renderAnalytics();
    }
}
