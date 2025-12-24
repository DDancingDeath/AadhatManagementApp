// History Management Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';

export class HistoryManager {
    static viewMode = 'card'; // 'card' or 'table'

    // Helper to format date consistently
    static formatDate(dateString) {
        try {
            const date = new Date(dateString);
            // Format: DD/MM/YYYY, HH:MM AM/PM
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            return `${day}/${month}/${year}, ${displayHours}:${minutes} ${ampm}`;
        } catch (e) {
            return dateString; // Fallback to original if parsing fails
        }
    }

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
        
        const customerPhone = AppState.customerPhoneNumber || '';        // Update customer options
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

        await FirebaseService.saveBill(bill);
        
        const state = AppState;
        state.billHistory.unshift(bill);
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

    static updateCustomerOptions(newCustomer) {
        const billHistory = AppState.billHistory;
        const uniqueCustomers = [...new Set(
            billHistory
                .filter(b => b.customerName)
                .map(b => b.customerName)
        )];
        
        if (newCustomer && !uniqueCustomers.includes(newCustomer)) {
            uniqueCustomers.unshift(newCustomer);
        }
        
        const datalist = document.getElementById('customerOptions');
        if (datalist) {
            datalist.innerHTML = uniqueCustomers.map(name => `<option value="${name}">`).join('');
        }
    }

    static renderHistory(type = 'purchase', searchTerm = '') {
        const billHistory = AppState.billHistory || [];
        const salesHistory = AppState.salesHistory || [];
        const container = document.getElementById("historyList");
        
        // Combine bills and sales
        const bills = billHistory.map(b => ({ ...b, type: b.type || 'purchase', isPurchase: true }));
        const sales = salesHistory.map(s => ({ ...s, type: s.type || 'sale', isPurchase: false }));
        const allHistory = [...bills, ...sales];
        
        // Filter bills by type
        let filteredBills = allHistory.filter(bill => bill.type === type);
        
        // Apply search filter if search term exists
        if (searchTerm && searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            filteredBills = filteredBills.filter(bill => {
                // Search in bill number
                const billNumber = bill.billNumber || (typeof bill.id === 'string' ? bill.id.substring(0, 8) : bill.id.toString());
                if (billNumber.toLowerCase().includes(term)) return true;
                
                // Search in customer name
                if (bill.customerName && bill.customerName.toLowerCase().includes(term)) return true;
                
                // Search in item names
                if (bill.items && bill.items.some(item => item.name.toLowerCase().includes(term))) return true;
                
                return false;
            });
        }
        
        // Sort by timestamp (newest first)
        const sortedBills = filteredBills.sort((a, b) => {
            const timeA = a.timestamp || new Date(a.date).getTime();
            const timeB = b.timestamp || new Date(b.date).getTime();
            return timeB - timeA;
        });
        
        // Check view mode and render accordingly
        if (this.viewMode === 'table') {
            this.renderHistoryTable(sortedBills, type);
            return;
        }

        if (sortedBills.length === 0) {
            const message = searchTerm ? `No results found for "${searchTerm}"` : `No ${type} history yet`;
            container.innerHTML = `<p style="text-align: center; color: #888; margin-top: 40px;">${message}</p>`;
            return;
        }

        container.innerHTML = "";

        sortedBills.forEach((bill, sortedIndex) => {
            const billIndex = bill.isPurchase 
                ? billHistory.findIndex(b => b.id === bill.id)
                : salesHistory.findIndex(s => s.id === bill.id);
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
            const formattedDate = this.formatDate(bill.date);
            const itemColor = bill.type === 'sale' ? '#28a745' : '#007bff';
            
            div.innerHTML = `
                <div class="history-header">
                    <span style="cursor: pointer; color: ${itemColor}; text-decoration: underline;" onclick="window.app.history.viewBill(${billIndex}, '${bill.type}')">#${billNumber}</span>${bill.customerName ? ` <strong>${bill.customerName}</strong>` : ''}
                    <span style="color: ${itemColor}; font-weight: 700;">₹ ${Math.round(billTotal)}</span>
                </div>
                <div class="history-date">${formattedDate}${bill.createdByName || bill.userName ? ` • By: <strong>${bill.createdByName || bill.userName}</strong>` : ''}</div>
                <div class="history-summary">
                    ${bill.items.map(item => item.name).join(', ')} • ${totalPackets} packets
                </div>
                ${paymentHTML}
            `;
            
            container.appendChild(div);
        });
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
                    <td>${item.name}</td>
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
                        <div class="bill-info-value"><strong>${sale.customerName}</strong></div>
                    </div>
                ` : ''}
                <div class="bill-info-row">
                    <div class="bill-info-label">Date:</div>
                    <div class="bill-info-value">${sale.date}</div>
                </div>
                ${sale.userName ? `
                    <div class="bill-info-row">
                        <div class="bill-info-label">Created By:</div>
                        <div class="bill-info-value">${sale.userName}</div>
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
        
        document.getElementById('billDetailsTitle').textContent = `Sale #${sale.id}`;
        document.getElementById('billDetailsContent').innerHTML = content;
        document.getElementById('billDetailsOverlay').classList.add('active');
    }
    */

    static async viewBill(index, type = 'purchase') {
        const history = type === 'sale' ? AppState.salesHistory : AppState.billHistory;
        const bill = history[index];
        
        if (!bill) {
            UIManager.showModal('Bill not found');
            return;
        }
        
        // Store bill index for edit functionality (purchases only)
        if (type === 'purchase') {
            window.currentBillIndex = index;
        }
        
        const totalPackets = bill.totalPackets || 0;
        const isPurchase = type === 'purchase';
        const billColor = isPurchase ? '#007bff' : '#28a745';
        
        // Build weight breakdown (purchases only)
        let weightBreakdownHTML = '';
        if (isPurchase) {
            bill.items.forEach(item => {
                if (item.weights && item.weights.length > 0) {
                    const weightsDisplay = item.weights.map(w => `${w}`).join(' ');
                    weightBreakdownHTML += `
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${billColor};">
                            <div style="font-weight: 600; color: #495057; margin-bottom: 6px;">${item.name} (${item.weights.length} packets, ${(item.qty || 0).toFixed(1)}kg)</div>
                            <div style="color: #6c757d; font-size: 14px;">${weightsDisplay}</div>
                        </div>
                    `;
                }
            });
        }
        
        // Build items table
        const itemsHTML = bill.items.map(item => `
            <tr>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.rate}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${(item.qty || 0).toFixed(1)}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>${item.total}</strong></td>
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
                        <span style="display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; background: #cfe2ff; color: #084298;">₹${payment.online}</span>
                    </div>
                ` : ''}
                ${payment.cash > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                        <span>Cash:</span>
                        <span style="display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; background: #d1e7dd; color: #0f5132;">₹${payment.cash}</span>
                    </div>
                ` : ''}
                ${payment.due > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                        <span>Due:</span>
                        <span style="display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; background: #fff3cd; color: #997404;">₹${payment.due}</span>
                    </div>
                ` : ''}
            </div>
        ` : '';
        
        const content = `
            <div style="padding: 16px; max-width: 100%;">
                ${bill.customerName ? `
                    <div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                        <span style="color: #6c757d; font-size: 14px;">Customer:</span>
                        <strong style="display: block; font-size: 16px; color: #212529; margin-top: 4px;">${bill.customerName}</strong>
                    </div>
                ` : ''}
                
                <div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                    <span style="color: #6c757d; font-size: 14px;">Date:</span>
                    <div style="font-size: 14px; color: #212529; margin-top: 4px;">${this.formatDate(bill.date)}</div>
                </div>
                
                ${bill.createdByName || bill.userName ? `
                    <div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                        <span style="color: #6c757d; font-size: 14px;">Created By:</span>
                        <div style="font-size: 14px; color: #212529; margin-top: 4px;">${bill.createdByName || bill.userName}</div>
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
                    Total Packets: <strong style="color: #212529; font-size: 15px;">${totalPackets}</strong>
                </div>
                
                <div style="background: white; padding: 14px; border-radius: 10px; border: 1px solid #dee2e6;">
                    ${isPurchase ? `
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px;">
                            <span style="font-weight: 600;">Purchase Total:</span>
                            <strong style="font-size: 17px; color: ${billColor};">₹${bill.billTotal || bill.grandTotal || bill.amountPayable || 0}</strong>
                        </div>
                        
                        ${bill.laborCharges > 0 ? `
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; border-top: 1px solid #e9ecef;">
                                <span style="font-weight: 600;">Labor (₹):</span>
                                <strong style="font-size: 17px; color: #ffc107;">₹${bill.laborCharges}</strong>
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
        
        const billNumber = bill.billNumber || (typeof bill.id === 'string' ? bill.id.substring(0, 8) : bill.id);
        const billType = isPurchase ? 'Purchase Bill' : 'Sale';
        document.getElementById('billDetailsTitle').textContent = `${billType} #${billNumber}`;
        document.getElementById('billDetailsContent').innerHTML = content;
        
        // Show all buttons for both purchases and sales
        const editBtn = document.getElementById('billEditBtn');
        const deleteBtn = document.getElementById('billDeleteBtn');
        if (editBtn) editBtn.style.display = '';
        if (deleteBtn) deleteBtn.style.display = '';
        
        document.getElementById('billDetailsOverlay').classList.add('active');
    }

    static async reprintBill(index) {
        // Backward compatibility - redirect to viewBill
        return this.viewBill(index, 'purchase');
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
        const billHistory = AppState.billHistory;
        const bill = billHistory[index];
        
        if (!bill) {
            UIManager.showToast('Bill not found');
            return;
        }

        try {
            UIManager.showLoading();
            
            // Delete from Firebase - need to find the document by matching bill data
            // The bill.id might be a timestamp, but Firestore doc ID could be different
            const userId = AppState.currentUser?.uid;
            if (userId) {
                // Query to find the bill document
                const snapshot = await db.collection('bills')
                    .where('userId', '==', userId)
                    .where('timestamp', '==', bill.timestamp || bill.id)
                    .get();
                
                // Delete all matching documents
                const batch = db.batch();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }
            
            // Remove from local state
            billHistory.splice(index, 1);
            
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
            
            // Refresh the history view
            const activeFilterBtn = document.querySelector('#history .filter-btn.active');
            const currentType = activeFilterBtn?.classList.contains('filter-sale') ? 'sale' : 'purchase';
            this.renderHistory(currentType);
            
            UIManager.hideLoading();
            UIManager.showToast('Bill deleted successfully');
        } catch (error) {
            console.error('Error deleting bill:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to delete bill');
        }
    }

    static searchHistory(searchTerm) {
        const activeFilterBtn = document.querySelector('#history .filter-btn.active');
        const currentType = activeFilterBtn?.classList.contains('filter-sale') ? 'sale' : 'purchase';
        
        this.renderHistory(currentType, searchTerm);
    }

    static filterHistory(type, event) {
        // Update button states
        const buttons = event.target.parentElement.querySelectorAll('.filter-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        // Clear search when switching tabs
        const searchInput = document.getElementById('historySearch');
        if (searchInput) searchInput.value = '';
        
        this.renderHistory(type);
    }

    static toggleView() {
        this.viewMode = this.viewMode === 'card' ? 'table' : 'card';
        const toggleBtn = document.getElementById('historyViewToggle');
        if (toggleBtn) {
            toggleBtn.textContent = this.viewMode === 'card' ? 'Table View' : 'Card View';
        }
        
        // Re-render with current filter and search
        const activeFilterBtn = document.querySelector('#history .filter-btn.active');
        const currentType = activeFilterBtn?.classList.contains('filter-sale') ? 'sale' : 'purchase';
        const searchInput = document.getElementById('historySearch');
        const searchTerm = searchInput ? searchInput.value : '';
        
        this.renderHistory(currentType, searchTerm);
    }

    static renderHistoryTable(bills, type) {
        const container = document.getElementById("historyList");
        
        if (bills.length === 0) {
            const searchInput = document.getElementById('historySearch');
            const searchTerm = searchInput ? searchInput.value : '';
            const message = searchTerm ? `No results found for "${searchTerm}"` : `No ${type} history yet`;
            container.innerHTML = `<p style="text-align: center; color: #888; margin-top: 40px;">${message}</p>`;
            return;
        }

        const billHistory = AppState.billHistory || [];
        const itemColor = type === 'sale' ? '#28a745' : '#007bff';
        
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
            const billIndex = bill.isPurchase 
                ? billHistory.findIndex(b => b.id === bill.id)
                : -1;
            const billNumber = bill.billNumber || (typeof bill.id === 'string' ? bill.id.substring(0, 8) : bill.id);
            const billTotal = bill.grandTotal || bill.amountPayable || bill.saleTotal || bill.total || 0;
            
            bill.items.forEach((item, index) => {
                const isFirstRow = index === 0;
                const rowspan = bill.items.length;
                
                tableHTML += `
                    <tr style="border-bottom: 1px solid #e5e7eb; cursor: pointer; transition: background 0.2s;" 
                        onmouseover="this.style.background='#f9fafb'" 
                        onmouseout="this.style.background='white'"
                        onclick="window.app.history.reprintBill(${billIndex})">
                        ${isFirstRow ? `
                            <td rowspan="${rowspan}" style="padding: 12px 8px; border-right: 1px solid #e5e7eb; font-weight: 500;">
                                ${bill.customerName || '-'}
                            </td>
                        ` : ''}
                        <td style="padding: 12px 8px;">${item.name}</td>
                        <td style="padding: 12px 8px; text-align: right;">₹${item.rate}</td>
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
