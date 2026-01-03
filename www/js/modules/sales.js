// Sales Management Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { PrinterService } from '../services/printer.js';
import { pickContact } from '../utils/helpers.js';

let wholesaleSaleItems = [];

export class SalesManager {
    static async pickContact() {
        await pickContact('wholesaleCustomerName');
    }

    static loadItemsDropdown() {
        const select = document.getElementById('sellItem');
        if (!select) return;
        
        select.innerHTML = '<option value="">Select item</option>';

        // Load only items that have stock
        AppState.items.forEach(item => {
            // Check stock by itemId first, then by name
            const stockData = AppState.stock[item.id] || AppState.stock[item.name];
            
            // Only show items with positive stock quantity
            if (stockData && stockData.quantity > 0) {
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
        
        if (!stockData) {
            availableStockEl.textContent = "0.00";
            avgRateEl.textContent = "-";
            sellRateEl.value = "";
            return;
        }
        
        availableStockEl.textContent = (stockData.quantity || 0).toFixed(2);
        avgRateEl.textContent = (stockData.rate || 0).toFixed(2);
        
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
        const itemName = document.getElementById('sellItem')?.value;
        const rate = parseFloat(document.getElementById('sellRate')?.value);
        const quantity = parseFloat(document.getElementById('sellQuantity')?.value);
        
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
        const stockData = AppState.stock[item.id] || AppState.stock[itemName];
        if (!stockData || stockData.quantity < quantity) {
            const available = stockData?.quantity || 0;
            UIManager.showToast(`Insufficient stock! Available: ${available.toFixed(1)}kg`);
            return;
        }
        
        const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        const total = Math.round(quantity * rate);
        
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
            return;
        }
        
        tbody.innerHTML = wholesaleSaleItems.map((item, index) => {
            return `
                <tr>
                    <td>${item.name}</td>
                    <td>₹${item.rate.toFixed(2)}</td>
                    <td>${item.qty.toFixed(1)} kg</td>
                    <td>₹${Math.round(item.total)}</td>
                    <td><button onclick="window.app.sales.removeWholesaleItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                </tr>
            `;
        }).join('');
        
        // Calculate sale total
        const saleTotal = wholesaleSaleItems.reduce((sum, item) => sum + item.total, 0);
        totalEl.textContent = Math.round(saleTotal);
        
        // Auto-calculate buy amount (cost) from stock average rates
        let totalBuyAmount = 0;
        wholesaleSaleItems.forEach(item => {
            const stockData = AppState.stock[item.itemId];
            if (stockData && stockData.avgRate) {
                totalBuyAmount += stockData.avgRate * item.qty;
            }
        });
        
        // Update profit calculation with current expenses
        this.updateProfitCalculation(saleTotal, totalBuyAmount);
    }

    static updateProfitCalculation(saleTotal = null, buyAmount = null) {
        const totalEl = document.getElementById('salesTotalAmount');
        const expensesInput = document.getElementById('salesExpensesAmount');
        const profitEl = document.getElementById('salesProfitAmount');
        const profitPercentEl = document.getElementById('salesProfitPercent');
        
        // Get sale total if not provided
        if (saleTotal === null) {
            saleTotal = parseFloat(totalEl?.textContent) || 0;
        }
        
        // Recalculate buy amount if not provided
        if (buyAmount === null) {
            buyAmount = 0;
            wholesaleSaleItems.forEach(item => {
                const stockData = AppState.stock[item.itemId];
                if (stockData && stockData.avgRate) {
                    buyAmount += stockData.avgRate * item.qty;
                }
            });
        }
        
        const expenses = parseFloat(expensesInput?.value) || 0;
        
        // Calculate profit: Sale Amount - Buy Amount - Expenses
        const profit = saleTotal - buyAmount - expenses;
        const profitPercent = saleTotal > 0 ? (profit / saleTotal) * 100 : 0;
        
        if (profitEl) profitEl.textContent = Math.round(profit);
        if (profitPercentEl) profitPercentEl.textContent = profitPercent.toFixed(1);
    }

    static removeWholesaleItem(index) {
        wholesaleSaleItems.splice(index, 1);
        this.renderWholesaleBill();
        UIManager.hapticFeedback();
    }

    static async completeSale() {
        if (wholesaleSaleItems.length === 0) {
            UIManager.showToast('Please add items to the bill');
            return;
        }
        
        const customerName = document.getElementById('wholesaleCustomerName')?.value || '';
        const total = wholesaleSaleItems.reduce((sum, item) => sum + item.total, 0);
        const comments = document.getElementById('salesComments')?.value || '';
        const expenses = parseFloat(document.getElementById('salesExpensesAmount')?.value) || 0;
        
        // Get profit from display
        const profit = parseFloat(document.getElementById('salesProfitAmount')?.textContent) || 0;
        const profitPercent = parseFloat(document.getElementById('salesProfitPercent')?.textContent) || 0;
        
        const saleData = {
            id: Date.now(),
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
            payment: {
                online: 0,
                cash: 0,
                total: 0,
                due: total
            },
            date: new Date().toLocaleString('en-IN'),
            timestamp: Date.now(),
            createdBy: AppState.currentUser?.uid || 'unknown',
            createdByName: AppState.userName || 'User',
            source: 'sales-tab'
        };
        
        try {
            await FirebaseService.saveSale(saleData);
            
            // Update customer options
            this.updateWholesaleCustomerOptions(customerName);
            
            // Clear bill
            wholesaleSaleItems = [];
            document.getElementById('wholesaleCustomerName').value = '';
            document.getElementById('sellQuantity').value = '';
            document.getElementById('sellRate').value = '';
            document.getElementById('salesComments').value = '';
            document.getElementById('salesExpensesAmount').value = '0';
            
            // Clear stock details
            document.getElementById('availableStock').textContent = '-';
            document.getElementById('avgPurchaseRate').textContent = '-';
            
            this.renderWholesaleBill();
            this.renderSalesHistory();
            
            // Recalculate stock
            AppState.stock = await FirebaseService.calculateStock();
            this.loadItemsDropdown(); // Refresh dropdown to show updated stock
            
            UIManager.showToast('✓ Sale completed successfully');
            UIManager.hapticFeedback();
        } catch (error) {
            console.error('Error completing sale:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static async printWholesaleSale() {
        if (wholesaleSaleItems.length === 0) {
            UIManager.showToast('No items to print');
            return;
        }
        
        // Collect sale data before saving (since save will clear the bill)
        const customerName = document.getElementById('wholesaleCustomerName')?.value || '';
        const total = wholesaleSaleItems.reduce((sum, item) => sum + item.total, 0);
        const expenses = parseFloat(document.getElementById('salesExpensesAmount')?.value) || 0;
        const profit = parseFloat(document.getElementById('salesProfitAmount')?.textContent) || 0;
        const comments = document.getElementById('salesComments')?.value || '';
        
        const saleData = {
            customerName,
            items: wholesaleSaleItems.map(item => ({
                name: item.name,
                rate: item.rate,
                qty: item.qty,
                total: item.total
            })),
            total,
            expenses,
            profit,
            comments,
            date: new Date().toLocaleString('en-IN')
        };
        
        try {
            // Save the sale first
            await this.completeSale();
            
            // Then print with the data we collected
            await PrinterService.printWholesaleSale(saleData);
            
            UIManager.showToast('Sale saved and printed!');
        } catch (error) {
            console.error('Print error:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static shareViaWhatsApp() {
        if (wholesaleSaleItems.length === 0) {
            UIManager.showToast('No items to share');
            return;
        }
        
        const customerName = document.getElementById('wholesaleCustomerName')?.value || '';
        const total = wholesaleSaleItems.reduce((sum, item) => sum + item.total, 0);
        const expenses = parseFloat(document.getElementById('salesExpensesAmount')?.value) || 0;
        const profit = parseFloat(document.getElementById('salesProfitAmount')?.textContent) || 0;
        const comments = document.getElementById('salesComments')?.value || '';
        
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
        const buttons = document.querySelectorAll('#sales .filter-btn');
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
            datalist.innerHTML = uniqueCustomers.map(name => `<option value="${name}">`).join('');
        }
    }

    static async recordPayment(saleId) {
        const salesHistory = AppState.salesHistory;
        const sale = salesHistory.find(s => s.id == saleId);
        if (!sale) {
            UIManager.showToast('Error: Sale not found');
            return;
        }
        
        const paymentInput = document.getElementById(`payment_${saleId}`);
        const paymentAmount = Number(paymentInput.value) || 0;
        
        if (paymentAmount <= 0) {
            UIManager.showToast('Please enter a valid payment amount');
            return;
        }
        
        const currentReceived = (sale.payment.online || 0) + (sale.payment.cash || 0);
        const outstanding = sale.payment.due || 0;
        
        if (paymentAmount > outstanding) {
            UIManager.showToast('Payment amount exceeds outstanding amount');
            return;
        }
        
        if (!sale.payments) sale.payments = [];
        
        const payment = {
            amount: paymentAmount,
            date: new Date().toLocaleString(),
            recordedBy: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };
        
        sale.payments.push(payment);
        sale.payment.cash = (sale.payment.cash || 0) + paymentAmount;
        sale.payment.total = (sale.payment.online || 0) + sale.payment.cash;
        sale.payment.due = sale.total - sale.payment.total;
        
        try {
            await FirebaseService.updateSale(sale);
            
            paymentInput.value = '';
            this.renderSalesOutstanding();
            this.renderSalesHistory();
            window.app.outstanding.renderDue();
            UIManager.showToast(`✓ Payment of ₹${paymentAmount} recorded`);
        } catch (error) {
            console.error('Error recording payment:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    }

    static async markSaleAsCleared(saleId) {
        const salesHistory = AppState.salesHistory;
        const sale = salesHistory.find(s => s.id == saleId);
        if (!sale) {
            console.error('Sale not found:', saleId);
            UIManager.showToast('Error: Sale not found');
            return;
        }
        
        sale.cleared = true;
        
        try {
            await FirebaseService.updateSale(sale);
            
            this.renderSalesOutstanding();
            window.app.outstanding.renderDue();
            UIManager.showToast('✓ Sale marked as cleared');
        } catch (error) {
            console.error('Error updating sale:', error, 'Sale ID:', saleId);
            UIManager.showToast('Error: ' + error.message);
        }
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
                
                div.innerHTML = `
                    <div class="history-header">
                        <span><span style="cursor: pointer; color: #22c55e; text-decoration: underline;" onclick="window.app.sales.reprintSaleById('${sale.id}')">#${sale.id}</span>${sale.customerName ? `  <strong>${sale.customerName}</strong>` : ''}</span>
                        <span style="color: #dc3545; font-weight: 700;">Due: ₹${Math.round(sale.outstanding)}</span>
                    </div>
                    <div class="history-date">${sale.date}${sale.createdByName ? ` • By: <strong>${sale.createdByName}</strong>` : ''}</div>
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
                                <input type="number" inputmode="decimal" id="payment_${sale.id}" placeholder="Enter amount" style="flex: 1; padding: 6px; border: 1px solid #17a2b8; border-radius: 4px;" />
                                <button onclick="window.app.sales.recordPayment('${sale.id}')" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Record</button>
                            </div>
                            <div style="display: flex; align-items: center;">
                                <input type="checkbox" id="clear_${sale.id}" onchange="window.app.sales.markSaleAsCleared('${sale.id}')" style="margin-right: 8px; transform: scale(1.2);" />
                                <label for="clear_${sale.id}" style="cursor: pointer; font-weight: 500;">Mark as Cleared</label>
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
        
        if (salesTabHistory.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No sales yet</p>';
            return;
        }

        container.innerHTML = "";

        salesTabHistory.forEach((sale, saleIndex) => {
            const div = document.createElement("div");
            div.className = "history-item";
            
            const totalWeight = sale.items.reduce((sum, item) => sum + (item.qty || item.quantity || 0), 0);
            
            const paymentParts = [];
            if (sale.payment) {
                const totalReceived = (sale.payment.online || 0) + (sale.payment.cash || 0);
                if (totalReceived > 0) paymentParts.push(`Received: ₹${totalReceived}`);
                if (sale.payment.due > 0) paymentParts.push(`Due: ₹${sale.payment.due}`);
            }
            const paymentHTML = paymentParts.length > 0 ? `
                <div class="history-payment">
                    ${paymentParts.join(' | ')}
                </div>
            ` : '';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: #22c55e; text-decoration: underline;" onclick="window.app.sales.reprintSale(${saleIndex})">#${sale.id}</span>${sale.customerName ? `<strong>${sale.customerName}</strong>` : ''}
                    <span style="color: #28a745; font-weight: 700;">₹ ${sale.total}</span>
                </div>
                <div class="history-date">${sale.date}${sale.createdByName ? ` • By: <strong>${sale.createdByName}</strong>` : ''}</div>
                <div class="history-summary">
                    ${sale.items.map(item => item.name).join(', ')}
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
        
        const itemsHTML = sale.items.map(item => {
            const qty = item.qty || item.quantity || 0;
            return `
                <tr>
                    <td>${item.name}</td>
                    <td>${qty} kg</td>
                    <td>₹${item.rate}</td>
                    <td><strong>₹${item.total}</strong></td>
                </tr>
            `;
        }).join('');
        
        const payment = sale.payment || {};
        const paymentHTML = (payment.online > 0 || payment.cash > 0 || payment.due > 0) ? `
            <div class="bill-payment-section">
                <h4>Payment Details</h4>
                ${payment.online > 0 ? `<div class="bill-payment-row"><span>Online:</span><strong>₹${payment.online}</strong></div>` : ''}
                ${payment.cash > 0 ? `<div class="bill-payment-row"><span>Cash:</span><strong>₹${payment.cash}</strong></div>` : ''}
                ${payment.due > 0 ? `<div class="bill-payment-row" style="color: #dc3545;"><span>Due:</span><strong>₹${payment.due}</strong></div>` : ''}
            </div>
        ` : '';
        
        const paymentsHistoryHTML = sale.payments && sale.payments.length > 0 ? `
            <div class="bill-payment-section" style="background: #e7f5e9;">
                <h4 style="color: #155724;">Payment History</h4>
                ${sale.payments.map(p => `
                    <div class="bill-payment-row"><span>• ${p.date}${p.recordedBy ? ` by ${p.recordedBy}` : ''}</span><strong>₹${p.amount}</strong></div>
                `).join('')}
            </div>
        ` : '';
        
        const content = `
            <div class="bill-info-section">
                ${sale.customerName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Customer:</div>
                        <div class="bill-info-value"><strong>${sale.customerName}</strong></div>
                    </div>
                ` : ''}
                <div class="bill-info-row">
                    <div class="bill-info-label">Date:</div>
                    <div class="bill-info-value">${sale.date}</div>
                </div>
                ${sale.createdByName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Created By:</div>
                        <div class="bill-info-value">${sale.createdByName}</div>
                    </div>
                ` : ''}
                ${sale.comments ? `
                    <div class="bill-info-row" style="background: #fff3cd; padding: 8px; border-radius: 6px; border-left: 4px solid #ffc107;">
                        <div class="bill-info-label">Comments:</div>
                        <div class="bill-info-value">${sale.comments}</div>
                    </div>
                ` : ''}
            </div>
            
            <table class="bill-items-table">
                <thead>
                    <tr>
                        <th>Item</th>
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
                    <strong>₹${sale.total}</strong>
                </div>
            </div>
            
            ${paymentHTML}
            ${paymentsHistoryHTML}
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
