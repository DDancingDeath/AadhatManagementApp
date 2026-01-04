// Reports Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';

export class ReportsManager {
    static populateFilters() {
        const billHistory = AppState.billHistory;
        
        const itemFilter = document.getElementById("reportItemFilter");
        if (itemFilter) {
            itemFilter.innerHTML = '<option value="all">All Items</option>';
            const uniqueItems = [...new Set(billHistory.flatMap(bill => bill.items.map(item => item.name)))];
            uniqueItems.forEach(itemName => {
                const opt = document.createElement("option");
                opt.value = itemName;
                opt.textContent = itemName;
                itemFilter.appendChild(opt);
            });
        }
        
        const customerFilter = document.getElementById("reportCustomerFilter");
        if (customerFilter) {
            customerFilter.innerHTML = '<option value="all">All Customers</option>';
            const uniqueCustomers = [...new Set(billHistory.map(bill => bill.customerName).filter(c => c))];
            uniqueCustomers.forEach(customerName => {
                const opt = document.createElement("option");
                opt.value = customerName;
                opt.textContent = customerName;
                customerFilter.appendChild(opt);
            });
        }
    }

    static applyFilters() {
        const state = AppState;
        state.reportFilters = {
            transaction: document.getElementById("reportTransactionFilter").value,
            item: document.getElementById("reportItemFilter").value,
            customer: document.getElementById("reportCustomerFilter").value
        };
        this.renderReports();
    }

    static filterByDate(bills) {
        const currentDateFilter = AppState.currentDateFilter; const customDateRange = AppState.customDateRange; const userRole = AppState.userRole;
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        return bills.filter(bill => {
            const billDate = new Date(bill.date);
            
            if (userRole === 'staff' && billDate < weekAgo) {
                return false;
            }
            
            switch(currentDateFilter) {
                case 'today':
                    return billDate.toDateString() === now.toDateString();
                case 'week':
                    return billDate >= weekAgo;
                case 'month':
                    return billDate.getMonth() === now.getMonth() && 
                           billDate.getFullYear() === now.getFullYear();
                case 'custom':
                    if (customDateRange.from && customDateRange.to) {
                        return billDate >= customDateRange.from && billDate <= customDateRange.to;
                    }
                    return true;
                default:
                    return true;
            }
        });
    }

    static filterByReportFilters(bills) {
        const reportFilters = AppState.reportFilters;
        
        return bills.filter(bill => {
            if (reportFilters.transaction !== 'all' && bill.type !== reportFilters.transaction) {
                return false;
            }
            
            if (reportFilters.item !== 'all') {
                const hasItem = bill.items.some(item => item.name === reportFilters.item);
                if (!hasItem) return false;
            }
            
            if (reportFilters.customer !== 'all' && bill.customerName !== reportFilters.customer) {
                return false;
            }
            
            return true;
        });
    }

    static renderReports() {
        this.populateFilters();
        
        const billHistory = AppState.billHistory; const salesHistory = AppState.salesHistory;
        let filteredBills = this.filterByDate(billHistory);
        filteredBills = this.filterByReportFilters(filteredBills);
        
        const totalSales = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
        const totalBills = filteredBills.length;
        const totalLabour = filteredBills.reduce((sum, bill) => sum + (bill.laborCharges || 0), 0);
        const totalCash = filteredBills.reduce((sum, bill) => sum + (bill.payment?.cash || 0), 0);
        const totalOnline = filteredBills.reduce((sum, bill) => sum + (bill.payment?.online || 0), 0);
        const totalPayment = totalCash + totalOnline;

        let purchaseOutstanding = 0;
        billHistory.forEach(bill => {
            const totalPayable = bill.total || 0;
            const onlinePaid = bill.payment ? (bill.payment.online || 0) : 0;
            const cashPaid = bill.payment ? (bill.payment.cash || 0) : 0;
            const totalPaid = onlinePaid + cashPaid;
            const outstanding = bill.payment?.due || (totalPayable - totalPaid);
            if (outstanding > 0) purchaseOutstanding += outstanding;
        });

        let saleOutstanding = 0;
        salesHistory.forEach(sale => {
            const totalReceivable = sale.total || 0;
            const onlineReceived = sale.payment ? (sale.payment.online || 0) : 0;
            const cashReceived = sale.payment ? (sale.payment.cash || 0) : 0;
            const totalReceived = onlineReceived + cashReceived;
            const outstanding = sale.payment?.due || (totalReceivable - totalReceived);
            if (outstanding > 0) saleOutstanding += outstanding;
        });

        document.getElementById("totalSales").textContent = totalSales;
        document.getElementById("totalBills").textContent = totalBills;
        document.getElementById("totalLabour").textContent = totalLabour;
        document.getElementById("totalCash").textContent = totalCash;
        document.getElementById("totalOnline").textContent = totalOnline;
        document.getElementById("totalPaymentReport").textContent = totalPayment;
        document.getElementById("purchaseOutstanding").textContent = purchaseOutstanding.toFixed(2);
        document.getElementById("saleOutstanding").textContent = saleOutstanding.toFixed(2);

        const itemCounts = {};
        const itemQuantities = {};
        const itemValues = {};
        
        filteredBills.forEach(bill => {
            bill.items.forEach(item => {
                if (!itemCounts[item.name]) {
                    itemCounts[item.name] = 0;
                    itemQuantities[item.name] = 0;
                    itemValues[item.name] = 0;
                }
                itemCounts[item.name]++;
                itemQuantities[item.name] += item.qty;
                itemValues[item.name] += item.total;
            });
        });

        const popularItems = Object.entries(itemCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const popularContainer = document.getElementById("popularItems");
        
        if (popularItems.length === 0) {
            popularContainer.innerHTML = '<p style="text-align: center; color: #888;">No data available</p>';
        } else {
            popularContainer.innerHTML = popularItems.map(([name, count]) => `
                <div class="popular-item">
                    <span>${name}</span>
                    <span>${count} purchases • ${itemQuantities[name].toFixed(0)}kg • ₹${itemValues[name]}</span>
                </div>
            `).join("");
        }
        
        this.renderItemWiseReport(itemCounts, itemQuantities, itemValues);
        this.renderPurchaseChart(filteredBills);
    }

    static renderItemWiseReport(itemCounts, itemQuantities, itemValues) {
        const container = document.getElementById("itemWiseReport");
        const items = Object.keys(itemCounts).sort((a, b) => itemValues[b] - itemValues[a]);
        
        if (items.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888;">No data available</p>';
            return;
        }
        
        container.innerHTML = items.map(itemName => `
            <div class="item-report">
                <div class="item-report-header">${itemName}</div>
                <div class="item-report-details">
                    <strong>Purchases:</strong> ${itemCounts[itemName]} times<br>
                    <strong>Quantity:</strong> ${itemQuantities[itemName].toFixed(2)} kg<br>
                    <strong>Total Value:</strong> ₹${itemValues[itemName]}<br>
                    <strong>Avg Rate:</strong> ₹${(itemValues[itemName] / itemQuantities[itemName]).toFixed(2)}/kg
                </div>
            </div>
        `).join("");
    }

    static renderPurchaseChart(bills) {
        const canvas = document.getElementById('purchaseChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        canvas.width = container.offsetWidth - 40;
        canvas.height = 250;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (bills.length === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        const dailyData = {};
        bills.forEach(bill => {
            const date = new Date(bill.date).toLocaleDateString();
            if (!dailyData[date]) dailyData[date] = 0;
            dailyData[date] += bill.total;
        });
        
        const dates = Object.keys(dailyData).slice(-7);
        const values = dates.map(date => dailyData[date]);
        
        if (values.length === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        const maxValue = Math.max(...values);
        const barWidth = (canvas.width - 40) / dates.length;
        const chartHeight = canvas.height - 60;
        
        ctx.fillStyle = '#007bff';
        
        values.forEach((value, index) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x = 20 + index * barWidth;
            const y = canvas.height - 40 - barHeight;
            
            ctx.fillRect(x, y, barWidth - 10, barHeight);
            
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('₹' + value, x + (barWidth - 10) / 2, y - 5);
            
            ctx.save();
            ctx.translate(x + (barWidth - 10) / 2, canvas.height - 10);
            ctx.rotate(-Math.PI / 4);
            ctx.font = '10px Arial';
            ctx.fillText(dates[index], 0, 0);
            ctx.restore();
            
            ctx.fillStyle = '#007bff';
        });
    }

    static exportToCSV() {
        const billHistory = AppState.billHistory; const reportFilters = AppState.reportFilters;
        let filteredBills = this.filterByDate(billHistory);
        filteredBills = this.filterByReportFilters(filteredBills);
        
        if (filteredBills.length === 0) {
            UIManager.showAlert("No data to export for the selected filters");
            return;
        }
        
        let csv = "Bill ID,Date,Time,Type,Customer,Item,Quantity (kg),Rate (₹/kg),Amount (₹),Labor Charges (₹),Total (₹),Cash Payment (₹),Online Payment (₹)\n";
        
        filteredBills.forEach(bill => {
            const date = new Date(bill.date);
            const dateStr = date.toLocaleDateString('en-IN');
            const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const type = bill.type === 'sale' ? 'Sale' : 'Purchase';
            const customer = bill.customerName || '-';
            
            bill.items.forEach(item => {
                csv += `${bill.id},"${dateStr}","${timeStr}","${type}","${customer}","${item.name}",${item.qty},${item.rate},${item.total},${bill.laborCharges || 0},${bill.total},${bill.payment?.cash || 0},${bill.payment?.online || 0}\n`;
            });
        });
        
        const totalSales = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
        const totalLabor = filteredBills.reduce((sum, bill) => sum + (bill.laborCharges || 0), 0);
        const totalCash = filteredBills.reduce((sum, bill) => sum + (bill.payment?.cash || 0), 0);
        const totalOnline = filteredBills.reduce((sum, bill) => sum + (bill.payment?.online || 0), 0);
        
        csv += `\n"SUMMARY",,,,,,,,,,,,\n`;
        csv += `"Total Bills:",${filteredBills.length},,,,,,,,,,\n`;
        csv += `"Total Amount:",₹${totalSales},,,,,,,,,,\n`;
        csv += `"Total Labor:",₹${totalLabor},,,,,,,,,,\n`;
        csv += `"Cash Payment:",₹${totalCash},,,,,,,,,,\n`;
        csv += `"Online Payment:",₹${totalOnline},,,,,,,,,,\n`;
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const filename = `Aadhat_Report_${new Date().toISOString().split('T')[0]}.csv`;
        
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        UIManager.hapticFeedback('medium');
        UIManager.showToast(`Exported ${filteredBills.length} bills to CSV`);
    }

    static exportToPDF() {
        const billHistory = AppState.billHistory;
        const salesHistory = AppState.salesHistory;
        let filteredBills = this.filterByDate(billHistory);
        filteredBills = this.filterByReportFilters(filteredBills);
        
        if (filteredBills.length === 0) {
            UIManager.showToast("No data to export for the selected filters");
            return;
        }

        // Calculate summary data
        const totalSales = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
        const totalBills = filteredBills.length;
        const totalLabour = filteredBills.reduce((sum, bill) => sum + (bill.laborCharges || 0), 0);
        const totalCash = filteredBills.reduce((sum, bill) => sum + (bill.payment?.cash || 0), 0);
        const totalOnline = filteredBills.reduce((sum, bill) => sum + (bill.payment?.online || 0), 0);

        let purchaseOutstanding = 0;
        billHistory.forEach(bill => {
            const outstanding = bill.payment?.due || 0;
            if (outstanding > 0) purchaseOutstanding += outstanding;
        });

        let saleOutstanding = 0;
        salesHistory.forEach(sale => {
            const outstanding = sale.payment?.due || 0;
            if (outstanding > 0) saleOutstanding += outstanding;
        });

        // Item-wise data
        const itemData = {};
        filteredBills.forEach(bill => {
            bill.items.forEach(item => {
                if (!itemData[item.name]) {
                    itemData[item.name] = { count: 0, qty: 0, value: 0 };
                }
                itemData[item.name].count++;
                itemData[item.name].qty += item.qty;
                itemData[item.name].value += item.total;
            });
        });

        const dateRange = this.getDateRangeText();
        const generatedAt = new Date().toLocaleString('en-IN');

        // Build HTML for PDF
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Aadhat Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #007bff; padding-bottom: 20px; }
        .header h1 { color: #007bff; margin-bottom: 5px; }
        .header p { color: #666; font-size: 14px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
        .summary-card.warning { border-left-color: #ffc107; background: #fff3cd; }
        .summary-card.success { border-left-color: #28a745; background: #d4edda; }
        .summary-card h4 { font-size: 12px; color: #666; margin-bottom: 8px; text-transform: uppercase; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #333; }
        .section { margin-bottom: 30px; }
        .section h3 { color: #007bff; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; color: #333; }
        tr:hover { background: #f8f9fa; }
        .text-right { text-align: right; }
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
            <div class="value">₹${totalSales.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card">
            <h4>Total Bills</h4>
            <div class="value">${totalBills}</div>
        </div>
        <div class="summary-card">
            <h4>Labor Cost</h4>
            <div class="value">₹${totalLabour.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card">
            <h4>Cash Payment</h4>
            <div class="value">₹${totalCash.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card">
            <h4>Online Payment</h4>
            <div class="value">₹${totalOnline.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card">
            <h4>Total Payment</h4>
            <div class="value">₹${(totalCash + totalOnline).toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card warning">
            <h4>Purchase Outstanding</h4>
            <div class="value" style="color: #dc3545;">₹${purchaseOutstanding.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card success">
            <h4>Sale Outstanding</h4>
            <div class="value" style="color: #28a745;">₹${saleOutstanding.toLocaleString('en-IN')}</div>
        </div>
    </div>

    <div class="section">
        <h3>Item-wise Summary</h3>
        <table>
            <thead>
                <tr>
                    <th>Item Name</th>
                    <th class="text-right">Purchases</th>
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
                ${filteredBills.slice(0, 20).map(bill => `
                    <tr>
                        <td>${new Date(bill.date).toLocaleDateString('en-IN')}</td>
                        <td>${bill.type === 'sale' ? 'Sale' : 'Purchase'}</td>
                        <td>${bill.customerName || '-'}</td>
                        <td>${bill.items.map(i => i.name).join(', ')}</td>
                        <td class="text-right">₹${bill.total.toLocaleString('en-IN')}</td>
                    </tr>
                `).join('')}
                ${filteredBills.length > 20 ? `<tr><td colspan="5" style="text-align: center; color: #888;">... and ${filteredBills.length - 20} more transactions</td></tr>` : ''}
            </tbody>
        </table>
    </div>

    <div class="footer">
        <p>Report generated by Aadhat Management App</p>
    </div>
</body>
</html>`;

        // Open in new window for printing/saving as PDF
        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
        
        // Trigger print dialog after content loads
        printWindow.onload = () => {
            printWindow.print();
        };

        UIManager.hapticFeedback('medium');
        UIManager.showToast('PDF report opened - use Print > Save as PDF');
    }

    static getDateRangeText() {
        const filter = AppState.currentDateFilter;
        const customRange = AppState.customDateRange;
        
        switch (filter) {
            case 'today':
                return 'Today (' + new Date().toLocaleDateString('en-IN') + ')';
            case 'week':
                return 'This Week';
            case 'month':
                return 'This Month';
            case 'custom':
                if (customRange.from && customRange.to) {
                    return `${customRange.from.toLocaleDateString('en-IN')} to ${customRange.to.toLocaleDateString('en-IN')}`;
                }
                return 'Custom Range';
            default:
                return 'All Time';
        }
    }
}
