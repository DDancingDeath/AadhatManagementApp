// Reports Module - Comprehensive Business Reports
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';

export class ReportsManager {
    static currentTab = 'overview';
    static currentDateFilter = 'week';
    static customStartDate = null;
    static customEndDate = null;
    static reportFilters = {
        purchaseItem: 'all',
        purchaseCustomer: 'all',
        salesItem: 'all',
        salesCustomer: 'all'
    };

    // ==================== TAB MANAGEMENT ====================
    static filterTab(view, evt) {
        this.currentTab = view;
        
        // Update tab buttons
        document.querySelectorAll('.reports-tab-btn').forEach(btn => btn.classList.remove('active'));
        if (evt && evt.target) {
            evt.target.closest('.reports-tab-btn').classList.add('active');
        }

        // Hide all sections
        document.querySelectorAll('.reports-section').forEach(section => {
            section.style.display = 'none';
        });

        // Show selected section
        const sectionMap = {
            'overview': 'reportsOverviewTab',
            'purchases': 'reportsPurchasesTab',
            'sales': 'reportsSalesTab',
            'compare': 'reportsCompareTab'
        };

        const sectionId = sectionMap[view];
        if (sectionId) {
            document.getElementById(sectionId).style.display = 'block';
        }

        // Render the appropriate section
        this.renderReports();
    }

    // ==================== DATE FILTERING ====================
    static setDateFilter(filter, evt) {
        this.currentDateFilter = filter;

        // Update filter buttons
        document.querySelectorAll('.reports-date-filter .filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (evt && evt.target) {
            evt.target.classList.add('active');
        }

        // Toggle custom date range visibility
        const customRange = document.getElementById('reportsCustomDateRange');
        if (customRange) {
            customRange.style.display = filter === 'custom' ? 'block' : 'none';
        }

        // Re-render reports
        if (filter !== 'custom') {
            this.renderReports();
        }
    }

    static applyCustomDateFilter() {
        const fromInput = document.getElementById('reportsDateFrom');
        const toInput = document.getElementById('reportsDateTo');

        if (fromInput && toInput && fromInput.value && toInput.value) {
            this.customStartDate = new Date(fromInput.value);
            this.customEndDate = new Date(toInput.value);
            this.customEndDate.setHours(23, 59, 59, 999);
            this.renderReports();
        }
    }

    static filterByDate(bills) {
        const now = new Date();
        
        return bills.filter(bill => {
            const billDate = new Date(bill.date);
            
            switch(this.currentDateFilter) {
                case 'today':
                    return billDate.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return billDate >= weekAgo;
                case 'month':
                    return billDate.getMonth() === now.getMonth() && 
                           billDate.getFullYear() === now.getFullYear();
                case 'year':
                    return billDate.getFullYear() === now.getFullYear();
                case 'custom':
                    if (this.customStartDate && this.customEndDate) {
                        return billDate >= this.customStartDate && billDate <= this.customEndDate;
                    }
                    return true;
                case 'all':
                default:
                    return true;
            }
        });
    }

    // ==================== FILTER MANAGEMENT ====================
    static populateFilters() {
        const purchaseHistory = AppState.purchaseHistory || [];
        const salesHistory = AppState.salesHistory || [];

        // Purchase Item Filter
        const purchaseItemFilter = document.getElementById('purchaseItemFilter');
        if (purchaseItemFilter) {
            const currentValue = purchaseItemFilter.value;
            purchaseItemFilter.innerHTML = '<option value="all">All Items</option>';
            const uniqueItems = [...new Set(purchaseHistory.flatMap(p => p.items?.map(i => i.name) || []))];
            uniqueItems.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                opt.textContent = item;
                purchaseItemFilter.appendChild(opt);
            });
            purchaseItemFilter.value = currentValue || 'all';
        }

        // Purchase Customer Filter
        const purchaseCustomerFilter = document.getElementById('purchaseCustomerFilter');
        if (purchaseCustomerFilter) {
            const currentValue = purchaseCustomerFilter.value;
            purchaseCustomerFilter.innerHTML = '<option value="all">All Suppliers</option>';
            const uniqueCustomers = [...new Set(purchaseHistory.map(p => p.customerName).filter(c => c))];
            uniqueCustomers.forEach(customer => {
                const opt = document.createElement('option');
                opt.value = customer;
                opt.textContent = customer;
                purchaseCustomerFilter.appendChild(opt);
            });
            purchaseCustomerFilter.value = currentValue || 'all';
        }

        // Sales Item Filter
        const salesItemFilter = document.getElementById('salesItemFilter');
        if (salesItemFilter) {
            const currentValue = salesItemFilter.value;
            salesItemFilter.innerHTML = '<option value="all">All Items</option>';
            const uniqueItems = [...new Set(salesHistory.flatMap(s => s.items?.map(i => i.name) || []))];
            uniqueItems.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                opt.textContent = item;
                salesItemFilter.appendChild(opt);
            });
            salesItemFilter.value = currentValue || 'all';
        }

        // Sales Customer Filter
        const salesCustomerFilter = document.getElementById('salesCustomerFilter');
        if (salesCustomerFilter) {
            const currentValue = salesCustomerFilter.value;
            salesCustomerFilter.innerHTML = '<option value="all">All Customers</option>';
            const uniqueCustomers = [...new Set(salesHistory.map(s => s.customerName).filter(c => c))];
            uniqueCustomers.forEach(customer => {
                const opt = document.createElement('option');
                opt.value = customer;
                opt.textContent = customer;
                salesCustomerFilter.appendChild(opt);
            });
            salesCustomerFilter.value = currentValue || 'all';
        }
    }

    static applyFilters() {
        this.reportFilters = {
            purchaseItem: document.getElementById('purchaseItemFilter')?.value || 'all',
            purchaseCustomer: document.getElementById('purchaseCustomerFilter')?.value || 'all',
            salesItem: document.getElementById('salesItemFilter')?.value || 'all',
            salesCustomer: document.getElementById('salesCustomerFilter')?.value || 'all'
        };
        this.renderReports();
    }

    static filterPurchases(purchases) {
        return purchases.filter(p => {
            if (this.reportFilters.purchaseItem !== 'all') {
                const hasItem = p.items?.some(i => i.name === this.reportFilters.purchaseItem);
                if (!hasItem) return false;
            }
            if (this.reportFilters.purchaseCustomer !== 'all') {
                if (p.customerName !== this.reportFilters.purchaseCustomer) return false;
            }
            return true;
        });
    }

    static filterSales(sales) {
        return sales.filter(s => {
            if (this.reportFilters.salesItem !== 'all') {
                const hasItem = s.items?.some(i => i.name === this.reportFilters.salesItem);
                if (!hasItem) return false;
            }
            if (this.reportFilters.salesCustomer !== 'all') {
                if (s.customerName !== this.reportFilters.salesCustomer) return false;
            }
            return true;
        });
    }

    // ==================== MAIN RENDER ====================
    static renderReports() {
        this.populateFilters();

        switch(this.currentTab) {
            case 'overview':
                this.renderOverview();
                break;
            case 'purchases':
                this.renderPurchases();
                break;
            case 'sales':
                this.renderSales();
                break;
            case 'compare':
                this.renderCompare();
                break;
        }
    }

    // ==================== OVERVIEW TAB ====================
    static renderOverview() {
        const purchaseHistory = AppState.purchaseHistory || [];
        const salesHistory = AppState.salesHistory || [];

        let filteredPurchases = this.filterByDate(purchaseHistory);
        let filteredSales = this.filterByDate(salesHistory);

        // Calculate metrics
        const totalPurchases = filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
        const totalSales = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalVolume = totalPurchases + totalSales;
        const grossProfit = totalSales - totalPurchases;
        const profitMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : 0;
        const totalLabor = filteredPurchases.reduce((sum, p) => sum + (p.laborCharges || 0), 0) +
                          filteredSales.reduce((sum, s) => sum + (s.laborCharges || 0), 0);

        // Payment calculations
        const purchaseCash = filteredPurchases.reduce((sum, p) => sum + (p.payment?.cash || 0), 0);
        const purchaseOnline = filteredPurchases.reduce((sum, p) => sum + (p.payment?.online || 0), 0);
        const salesCash = filteredSales.reduce((sum, s) => sum + (s.payment?.cash || 0), 0);
        const salesOnline = filteredSales.reduce((sum, s) => sum + (s.payment?.online || 0), 0);
        const totalCash = purchaseCash + salesCash;
        const totalOnline = purchaseOnline + salesOnline;

        // Outstanding calculations
        let dueToPay = 0;
        purchaseHistory.forEach(p => {
            const outstanding = p.payment?.due || 0;
            if (outstanding > 0) dueToPay += outstanding;
        });

        let dueToReceive = 0;
        salesHistory.forEach(s => {
            const outstanding = s.payment?.due || 0;
            if (outstanding > 0) dueToReceive += outstanding;
        });

        // Update DOM
        this.safeUpdateText('reportsTotalVolume', this.formatNumber(totalVolume));
        this.safeUpdateText('reportsTotalPurchases', this.formatNumber(totalPurchases));
        this.safeUpdateText('reportsTotalSales', this.formatNumber(totalSales));
        this.safeUpdateText('reportsPurchaseCount', filteredPurchases.length);
        this.safeUpdateText('reportsSaleCount', filteredSales.length);
        this.safeUpdateText('reportsGrossProfit', this.formatNumber(grossProfit));
        this.safeUpdateText('reportsProfitMargin', profitMargin);
        this.safeUpdateText('reportsTotalLabor', this.formatNumber(totalLabor));
        this.safeUpdateText('reportsCashPayment', this.formatNumber(totalCash));
        this.safeUpdateText('reportsOnlinePayment', this.formatNumber(totalOnline));
        this.safeUpdateText('reportsDueToPay', this.formatNumber(dueToPay));
        this.safeUpdateText('reportsDueToReceive', this.formatNumber(dueToReceive));

        // Render chart
        this.renderTrendChart(filteredPurchases, filteredSales);

        // Render top items
        this.renderTopItems(filteredPurchases, filteredSales);
    }

    static renderTrendChart(purchases, sales) {
        const canvas = document.getElementById('reportsTrendChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        canvas.width = container.offsetWidth;
        canvas.height = 250;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Combine data by date
        const dailyData = {};
        
        purchases.forEach(p => {
            const date = new Date(p.date).toLocaleDateString('en-IN');
            if (!dailyData[date]) dailyData[date] = { purchases: 0, sales: 0 };
            dailyData[date].purchases += p.total || 0;
        });

        sales.forEach(s => {
            const date = new Date(s.date).toLocaleDateString('en-IN');
            if (!dailyData[date]) dailyData[date] = { purchases: 0, sales: 0 };
            dailyData[date].sales += s.total || 0;
        });

        const dates = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b)).slice(-7);
        
        if (dates.length === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        const maxValue = Math.max(...dates.map(d => Math.max(dailyData[d].purchases, dailyData[d].sales)));
        const chartHeight = canvas.height - 60;
        const chartWidth = canvas.width - 60;
        const barWidth = (chartWidth / dates.length) / 2.5;
        const gap = barWidth * 0.3;

        dates.forEach((date, index) => {
            const x = 40 + (index * (chartWidth / dates.length)) + (chartWidth / dates.length / 4);
            
            // Purchase bar
            const purchaseHeight = (dailyData[date].purchases / maxValue) * chartHeight;
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(x, canvas.height - 40 - purchaseHeight, barWidth, purchaseHeight);
            
            // Sales bar
            const salesHeight = (dailyData[date].sales / maxValue) * chartHeight;
            ctx.fillStyle = '#10b981';
            ctx.fillRect(x + barWidth + gap, canvas.height - 40 - salesHeight, barWidth, salesHeight);

            // Date label
            ctx.save();
            ctx.translate(x + barWidth, canvas.height - 10);
            ctx.rotate(-Math.PI / 4);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#666';
            ctx.fillText(date.split('/').slice(0, 2).join('/'), 0, 0);
            ctx.restore();
        });

        // Legend
        ctx.font = '12px Arial';
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(canvas.width - 120, 10, 12, 12);
        ctx.fillStyle = '#333';
        ctx.fillText('Purchases', canvas.width - 100, 20);
        
        ctx.fillStyle = '#10b981';
        ctx.fillRect(canvas.width - 120, 28, 12, 12);
        ctx.fillStyle = '#333';
        ctx.fillText('Sales', canvas.width - 100, 38);
    }

    static renderTopItems(purchases, sales) {
        const container = document.getElementById('reportsTopItems');
        if (!container) return;

        const itemData = {};

        [...purchases, ...sales].forEach(bill => {
            (bill.items || []).forEach(item => {
                if (!itemData[item.name]) {
                    itemData[item.name] = { count: 0, value: 0, qty: 0 };
                }
                itemData[item.name].count++;
                itemData[item.name].value += item.total || 0;
                itemData[item.name].qty += item.qty || 0;
            });
        });

        const topItems = Object.entries(itemData)
            .sort((a, b) => b[1].value - a[1].value)
            .slice(0, 5);

        if (topItems.length === 0) {
            container.innerHTML = '<p class="no-data">No data available</p>';
            return;
        }

        container.innerHTML = topItems.map(([name, data], index) => `
            <div class="top-item">
                <span class="top-item-rank">${index + 1}</span>
                <div class="top-item-info">
                    <div class="top-item-name">${name}</div>
                    <div class="top-item-stats">${data.count} transactions • ${data.qty.toFixed(1)} kg</div>
                </div>
                <span class="top-item-value">₹${this.formatNumber(data.value)}</span>
            </div>
        `).join('');
    }

    // ==================== PURCHASES TAB ====================
    static renderPurchases() {
        const purchaseHistory = AppState.purchaseHistory || [];
        let filteredPurchases = this.filterByDate(purchaseHistory);
        filteredPurchases = this.filterPurchases(filteredPurchases);

        // Calculate metrics
        const totalAmount = filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
        const billCount = filteredPurchases.length;
        const avgBill = billCount > 0 ? totalAmount / billCount : 0;
        const totalLabor = filteredPurchases.reduce((sum, p) => sum + (p.laborCharges || 0), 0);
        const cashPaid = filteredPurchases.reduce((sum, p) => sum + (p.payment?.cash || 0), 0);
        const onlinePaid = filteredPurchases.reduce((sum, p) => sum + (p.payment?.online || 0), 0);
        
        let outstanding = 0;
        purchaseHistory.forEach(p => {
            const due = p.payment?.due || 0;
            if (due > 0) outstanding += due;
        });

        // Update DOM
        this.safeUpdateText('purchaseHeroTotal', this.formatNumber(totalAmount));
        this.safeUpdateText('purchaseBillCount', billCount);
        this.safeUpdateText('purchaseAvgBill', this.formatNumber(avgBill.toFixed(0)));
        this.safeUpdateText('purchaseLaborTotal', this.formatNumber(totalLabor));
        this.safeUpdateText('purchaseOutstandingTotal', this.formatNumber(outstanding));
        this.safeUpdateText('purchaseCashPaid', this.formatNumber(cashPaid));
        this.safeUpdateText('purchaseOnlinePaid', this.formatNumber(onlinePaid));
        this.safeUpdateText('purchaseTotalPaid', this.formatNumber(cashPaid + onlinePaid));

        // Render item breakdown
        this.renderItemBreakdown(filteredPurchases, 'purchaseItemsBreakdown');

        // Render recent transactions
        this.renderRecentTransactions(filteredPurchases, 'recentPurchasesList', 'purchase');
    }

    // ==================== SALES TAB ====================
    static renderSales() {
        const salesHistory = AppState.salesHistory || [];
        let filteredSales = this.filterByDate(salesHistory);
        filteredSales = this.filterSales(filteredSales);

        // Calculate metrics
        const totalAmount = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const billCount = filteredSales.length;
        const avgBill = billCount > 0 ? totalAmount / billCount : 0;
        const totalLabor = filteredSales.reduce((sum, s) => sum + (s.laborCharges || 0), 0);
        const cashReceived = filteredSales.reduce((sum, s) => sum + (s.payment?.cash || 0), 0);
        const onlineReceived = filteredSales.reduce((sum, s) => sum + (s.payment?.online || 0), 0);

        let outstanding = 0;
        salesHistory.forEach(s => {
            const due = s.payment?.due || 0;
            if (due > 0) outstanding += due;
        });

        // Update DOM
        this.safeUpdateText('salesHeroTotal', this.formatNumber(totalAmount));
        this.safeUpdateText('salesBillCount', billCount);
        this.safeUpdateText('salesAvgBill', this.formatNumber(avgBill.toFixed(0)));
        this.safeUpdateText('salesLaborTotal', this.formatNumber(totalLabor));
        this.safeUpdateText('salesOutstandingTotal', this.formatNumber(outstanding));
        this.safeUpdateText('salesCashReceived', this.formatNumber(cashReceived));
        this.safeUpdateText('salesOnlineReceived', this.formatNumber(onlineReceived));
        this.safeUpdateText('salesTotalReceived', this.formatNumber(cashReceived + onlineReceived));

        // Render item breakdown
        this.renderItemBreakdown(filteredSales, 'salesItemsBreakdown');

        // Render recent transactions
        this.renderRecentTransactions(filteredSales, 'recentSalesList', 'sale');
    }

    // ==================== COMPARE TAB ====================
    static renderCompare() {
        const purchaseHistory = AppState.purchaseHistory || [];
        const salesHistory = AppState.salesHistory || [];

        const filteredPurchases = this.filterByDate(purchaseHistory);
        const filteredSales = this.filterByDate(salesHistory);

        // Calculate metrics
        const totalPurchases = filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
        const totalSales = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const netResult = totalSales - totalPurchases;

        const purchaseBills = filteredPurchases.length;
        const salesBills = filteredSales.length;
        const avgPurchase = purchaseBills > 0 ? totalPurchases / purchaseBills : 0;
        const avgSale = salesBills > 0 ? totalSales / salesBills : 0;

        const purchaseLabor = filteredPurchases.reduce((sum, p) => sum + (p.laborCharges || 0), 0);
        const salesLabor = filteredSales.reduce((sum, s) => sum + (s.laborCharges || 0), 0);

        const purchaseCash = filteredPurchases.reduce((sum, p) => sum + (p.payment?.cash || 0), 0);
        const salesCash = filteredSales.reduce((sum, s) => sum + (s.payment?.cash || 0), 0);
        const purchaseOnline = filteredPurchases.reduce((sum, p) => sum + (p.payment?.online || 0), 0);
        const salesOnline = filteredSales.reduce((sum, s) => sum + (s.payment?.online || 0), 0);

        let purchaseOutstanding = 0;
        purchaseHistory.forEach(p => {
            const due = p.payment?.due || 0;
            if (due > 0) purchaseOutstanding += due;
        });

        let salesOutstanding = 0;
        salesHistory.forEach(s => {
            const due = s.payment?.due || 0;
            if (due > 0) salesOutstanding += due;
        });

        // Update DOM
        this.safeUpdateText('comparePurchases', this.formatNumber(totalPurchases));
        this.safeUpdateText('compareSales', this.formatNumber(totalSales));
        this.safeUpdateText('compareNetValue', this.formatNumber(Math.abs(netResult)));

        // Update net result styling
        const netResultEl = document.getElementById('compareNetResult');
        const netValueEl = netResultEl?.querySelector('.net-value');
        const netStatusEl = netResultEl?.querySelector('.net-status');
        
        if (netResultEl && netValueEl && netStatusEl) {
            netResultEl.className = 'compare-net-result ' + (netResult >= 0 ? 'profit' : 'loss');
            netValueEl.className = 'net-value ' + (netResult >= 0 ? 'positive' : 'negative');
            netStatusEl.textContent = netResult >= 0 ? 'Profit' : 'Loss';
        }

        // Comparison table values
        this.safeUpdateText('compareBillsPurchase', purchaseBills);
        this.safeUpdateText('compareBillsSale', salesBills);
        this.safeUpdateText('compareAmountPurchase', this.formatNumber(totalPurchases));
        this.safeUpdateText('compareAmountSale', this.formatNumber(totalSales));
        this.safeUpdateText('compareAvgPurchase', this.formatNumber(avgPurchase.toFixed(0)));
        this.safeUpdateText('compareAvgSale', this.formatNumber(avgSale.toFixed(0)));
        this.safeUpdateText('compareLaborPurchase', this.formatNumber(purchaseLabor));
        this.safeUpdateText('compareLaborSale', this.formatNumber(salesLabor));
        this.safeUpdateText('compareCashPurchase', this.formatNumber(purchaseCash));
        this.safeUpdateText('compareCashSale', this.formatNumber(salesCash));
        this.safeUpdateText('compareOnlinePurchase', this.formatNumber(purchaseOnline));
        this.safeUpdateText('compareOnlineSale', this.formatNumber(salesOnline));
        this.safeUpdateText('compareOutstandingPurchase', this.formatNumber(purchaseOutstanding));
        this.safeUpdateText('compareOutstandingSale', this.formatNumber(salesOutstanding));

        // Render comparison chart
        this.renderCompareChart(filteredPurchases, filteredSales);

        // Render item comparison
        this.renderItemComparison(filteredPurchases, filteredSales);
    }

    static renderCompareChart(purchases, sales) {
        const canvas = document.getElementById('reportsCompareChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        canvas.width = container.offsetWidth;
        canvas.height = 250;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Combine data by date
        const dailyData = {};
        
        purchases.forEach(p => {
            const date = new Date(p.date).toLocaleDateString('en-IN');
            if (!dailyData[date]) dailyData[date] = { purchases: 0, sales: 0 };
            dailyData[date].purchases += p.total || 0;
        });

        sales.forEach(s => {
            const date = new Date(s.date).toLocaleDateString('en-IN');
            if (!dailyData[date]) dailyData[date] = { purchases: 0, sales: 0 };
            dailyData[date].sales += s.total || 0;
        });

        const dates = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b)).slice(-7);
        
        if (dates.length === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        const maxValue = Math.max(...dates.map(d => Math.max(dailyData[d].purchases, dailyData[d].sales)));
        const chartHeight = canvas.height - 60;
        const chartWidth = canvas.width - 80;
        const pointGap = chartWidth / (dates.length - 1 || 1);

        // Draw lines
        ctx.lineWidth = 3;
        
        // Purchases line
        ctx.strokeStyle = '#3b82f6';
        ctx.beginPath();
        dates.forEach((date, index) => {
            const x = 40 + (index * pointGap);
            const y = canvas.height - 40 - (dailyData[date].purchases / maxValue) * chartHeight;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Sales line
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        dates.forEach((date, index) => {
            const x = 40 + (index * pointGap);
            const y = canvas.height - 40 - (dailyData[date].sales / maxValue) * chartHeight;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw points
        dates.forEach((date, index) => {
            const x = 40 + (index * pointGap);
            
            // Purchase point
            const yPurchase = canvas.height - 40 - (dailyData[date].purchases / maxValue) * chartHeight;
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(x, yPurchase, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Sales point
            const ySales = canvas.height - 40 - (dailyData[date].sales / maxValue) * chartHeight;
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(x, ySales, 5, 0, Math.PI * 2);
            ctx.fill();

            // Date label
            ctx.save();
            ctx.translate(x, canvas.height - 10);
            ctx.rotate(-Math.PI / 4);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#666';
            ctx.fillText(date.split('/').slice(0, 2).join('/'), 0, 0);
            ctx.restore();
        });

        // Legend
        ctx.font = '12px Arial';
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(canvas.width - 120, 10, 12, 12);
        ctx.fillStyle = '#333';
        ctx.fillText('Purchases', canvas.width - 100, 20);
        
        ctx.fillStyle = '#10b981';
        ctx.fillRect(canvas.width - 120, 28, 12, 12);
        ctx.fillStyle = '#333';
        ctx.fillText('Sales', canvas.width - 100, 38);
    }

    static renderItemComparison(purchases, sales) {
        const container = document.getElementById('itemComparisonList');
        if (!container) return;

        const itemData = {};

        purchases.forEach(p => {
            (p.items || []).forEach(item => {
                if (!itemData[item.name]) {
                    itemData[item.name] = { purchase: 0, sale: 0 };
                }
                itemData[item.name].purchase += item.total || 0;
            });
        });

        sales.forEach(s => {
            (s.items || []).forEach(item => {
                if (!itemData[item.name]) {
                    itemData[item.name] = { purchase: 0, sale: 0 };
                }
                itemData[item.name].sale += item.total || 0;
            });
        });

        const items = Object.entries(itemData)
            .sort((a, b) => (b[1].purchase + b[1].sale) - (a[1].purchase + a[1].sale))
            .slice(0, 10);

        if (items.length === 0) {
            container.innerHTML = '<p class="no-data">No data available</p>';
            return;
        }

        const maxValue = Math.max(...items.map(([_, data]) => Math.max(data.purchase, data.sale)));

        container.innerHTML = items.map(([name, data]) => `
            <div class="item-comparison-row">
                <div class="item-comparison-name">${name}</div>
                <div class="item-comparison-bars">
                    <div class="comparison-bar">
                        <span class="bar-label">Purchases</span>
                        <div class="bar-track">
                            <div class="bar-fill purchase" style="width: ${(data.purchase / maxValue) * 100}%"></div>
                        </div>
                        <span class="bar-value">₹${this.formatNumber(data.purchase)}</span>
                    </div>
                    <div class="comparison-bar">
                        <span class="bar-label">Sales</span>
                        <div class="bar-track">
                            <div class="bar-fill sale" style="width: ${(data.sale / maxValue) * 100}%"></div>
                        </div>
                        <span class="bar-value">₹${this.formatNumber(data.sale)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ==================== SHARED RENDERERS ====================
    static renderItemBreakdown(bills, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const itemData = {};
        bills.forEach(bill => {
            (bill.items || []).forEach(item => {
                if (!itemData[item.name]) {
                    itemData[item.name] = { count: 0, qty: 0, value: 0 };
                }
                itemData[item.name].count++;
                itemData[item.name].qty += item.qty || 0;
                itemData[item.name].value += item.total || 0;
            });
        });

        const items = Object.entries(itemData).sort((a, b) => b[1].value - a[1].value);

        if (items.length === 0) {
            container.innerHTML = '<p class="no-data">No data available</p>';
            return;
        }

        container.innerHTML = items.map(([name, data]) => `
            <div class="item-breakdown-row">
                <div class="item-breakdown-info">
                    <div class="item-breakdown-name">${name}</div>
                    <div class="item-breakdown-stats">${data.count} times • ${data.qty.toFixed(1)} kg</div>
                </div>
                <div class="item-breakdown-value">
                    <div class="item-breakdown-amount">₹${this.formatNumber(data.value)}</div>
                    <div class="item-breakdown-rate">₹${(data.value / data.qty).toFixed(2)}/kg</div>
                </div>
            </div>
        `).join('');
    }

    static renderRecentTransactions(bills, containerId, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const recentBills = bills.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

        if (recentBills.length === 0) {
            container.innerHTML = `<p class="no-data">No recent ${type === 'purchase' ? 'purchases' : 'sales'}</p>`;
            return;
        }

        container.innerHTML = recentBills.map(bill => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-customer">${bill.customerName || 'Unknown'}</div>
                    <div class="transaction-date">${new Date(bill.date).toLocaleDateString('en-IN')}</div>
                    <div class="transaction-items">${(bill.items || []).map(i => i.name).join(', ')}</div>
                </div>
                <span class="transaction-amount">₹${this.formatNumber(bill.total || 0)}</span>
            </div>
        `).join('');
    }

    // ==================== EXPORT FUNCTIONS ====================
    static exportCSV() {
        const purchaseHistory = AppState.purchaseHistory || [];
        const salesHistory = AppState.salesHistory || [];
        
        let filteredPurchases = this.filterByDate(purchaseHistory);
        let filteredSales = this.filterByDate(salesHistory);

        if (filteredPurchases.length === 0 && filteredSales.length === 0) {
            UIManager.showToast('No data to export for the selected period');
            return;
        }

        let csv = "Bill ID,Date,Time,Type,Customer,Item,Quantity (kg),Rate (₹/kg),Amount (₹),Labor (₹),Total (₹),Cash (₹),Online (₹),Due (₹)\n";

        const processTransaction = (bill, type) => {
            const date = new Date(bill.date);
            const dateStr = date.toLocaleDateString('en-IN');
            const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const customer = bill.customerName || '-';

            (bill.items || []).forEach(item => {
                csv += `${bill.id},"${dateStr}","${timeStr}","${type}","${customer}","${item.name}",${item.qty || 0},${item.rate || 0},${item.total || 0},${bill.laborCharges || 0},${bill.total || 0},${bill.payment?.cash || 0},${bill.payment?.online || 0},${bill.payment?.due || 0}\n`;
            });
        };

        filteredPurchases.forEach(p => processTransaction(p, 'Purchase'));
        filteredSales.forEach(s => processTransaction(s, 'Sale'));

        // Summary
        const totalPurchases = filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
        const totalSales = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);

        csv += `\n"SUMMARY",,,,,,,,,,,,\n`;
        csv += `"Total Purchases:",₹${totalPurchases},,,,,,,,,,\n`;
        csv += `"Total Sales:",₹${totalSales},,,,,,,,,,\n`;
        csv += `"Net Profit:",₹${totalSales - totalPurchases},,,,,,,,,,\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const filename = `Aadhat_Report_${new Date().toISOString().split('T')[0]}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        UIManager.hapticFeedback('medium');
        UIManager.showToast(`Exported ${filteredPurchases.length + filteredSales.length} transactions to CSV`);
    }

    static exportPDF() {
        const purchaseHistory = AppState.purchaseHistory || [];
        const salesHistory = AppState.salesHistory || [];
        
        let filteredPurchases = this.filterByDate(purchaseHistory);
        let filteredSales = this.filterByDate(salesHistory);

        if (filteredPurchases.length === 0 && filteredSales.length === 0) {
            UIManager.showToast('No data to export for the selected period');
            return;
        }

        // Calculate summary data
        const totalPurchases = filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
        const totalSales = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const netProfit = totalSales - totalPurchases;

        const dateRange = this.getDateRangeText();
        const generatedAt = new Date().toLocaleString('en-IN');

        // Item-wise data
        const itemData = {};
        [...filteredPurchases, ...filteredSales].forEach(bill => {
            (bill.items || []).forEach(item => {
                if (!itemData[item.name]) {
                    itemData[item.name] = { count: 0, qty: 0, value: 0 };
                }
                itemData[item.name].count++;
                itemData[item.name].qty += item.qty || 0;
                itemData[item.name].value += item.total || 0;
            });
        });

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Aadhat Business Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #667eea; padding-bottom: 20px; }
        .header h1 { color: #667eea; margin-bottom: 5px; }
        .header p { color: #666; font-size: 14px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #667eea; }
        .summary-card.success { border-left-color: #10b981; }
        .summary-card.danger { border-left-color: #ef4444; }
        .summary-card h4 { font-size: 12px; color: #666; margin-bottom: 8px; text-transform: uppercase; }
        .summary-card .value { font-size: 22px; font-weight: bold; color: #333; }
        .section { margin-bottom: 30px; }
        .section h3 { color: #667eea; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; color: #333; }
        tr:hover { background: #f8f9fa; }
        .text-right { text-align: right; }
        .text-success { color: #10b981; }
        .text-danger { color: #ef4444; }
        .footer { margin-top: 40px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; }
        @media print { body { padding: 10px; } .summary-grid { grid-template-columns: repeat(2, 1fr); } }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Aadhat Business Report</h1>
        <p>Period: ${dateRange} | Generated: ${generatedAt}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h4>Total Purchases</h4>
            <div class="value">₹${totalPurchases.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card success">
            <h4>Total Sales</h4>
            <div class="value">₹${totalSales.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card ${netProfit >= 0 ? 'success' : 'danger'}">
            <h4>Net ${netProfit >= 0 ? 'Profit' : 'Loss'}</h4>
            <div class="value ${netProfit >= 0 ? 'text-success' : 'text-danger'}">₹${Math.abs(netProfit).toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card">
            <h4>Total Transactions</h4>
            <div class="value">${filteredPurchases.length + filteredSales.length}</div>
        </div>
    </div>

    <div class="section">
        <h3>Item-wise Summary</h3>
        <table>
            <thead>
                <tr>
                    <th>Item Name</th>
                    <th class="text-right">Transactions</th>
                    <th class="text-right">Quantity (kg)</th>
                    <th class="text-right">Total Value (₹)</th>
                    <th class="text-right">Avg Rate (₹/kg)</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(itemData)
                    .sort((a, b) => b[1].value - a[1].value)
                    .map(([name, data]) => `
                        <tr>
                            <td>${name}</td>
                            <td class="text-right">${data.count}</td>
                            <td class="text-right">${data.qty.toFixed(2)}</td>
                            <td class="text-right">₹${data.value.toLocaleString('en-IN')}</td>
                            <td class="text-right">₹${(data.value / data.qty).toFixed(2)}</td>
                        </tr>
                    `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h3>Recent Transactions</h3>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th class="text-right">Amount (₹)</th>
                </tr>
            </thead>
            <tbody>
                ${[...filteredPurchases.map(p => ({...p, type: 'Purchase'})), ...filteredSales.map(s => ({...s, type: 'Sale'}))]
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, 20)
                    .map(bill => `
                        <tr>
                            <td>${new Date(bill.date).toLocaleDateString('en-IN')}</td>
                            <td>${bill.type}</td>
                            <td>${bill.customerName || '-'}</td>
                            <td>${(bill.items || []).map(i => i.name).join(', ')}</td>
                            <td class="text-right">₹${(bill.total || 0).toLocaleString('en-IN')}</td>
                        </tr>
                    `).join('')}
            </tbody>
        </table>
    </div>

    <div class="footer">
        <p>Report generated by Aadhat Management App</p>
    </div>
</body>
</html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();

        UIManager.hapticFeedback('medium');
        UIManager.showToast('PDF report opened - use Print > Save as PDF');
    }

    // ==================== UTILITIES ====================
    static formatNumber(num) {
        return Number(num).toLocaleString('en-IN');
    }

    static safeUpdateText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    static getDateRangeText() {
        switch (this.currentDateFilter) {
            case 'today':
                return 'Today (' + new Date().toLocaleDateString('en-IN') + ')';
            case 'week':
                return 'This Week';
            case 'month':
                return 'This Month';
            case 'year':
                return 'This Year';
            case 'custom':
                if (this.customStartDate && this.customEndDate) {
                    return `${this.customStartDate.toLocaleDateString('en-IN')} to ${this.customEndDate.toLocaleDateString('en-IN')}`;
                }
                return 'Custom Range';
            case 'all':
            default:
                return 'All Time';
        }
    }
}


