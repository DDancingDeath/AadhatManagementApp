// -------------------- DATABASE --------------------
let items = JSON.parse(localStorage.getItem("items")) || [];
let billItems = [];
let labourCharges = [];
let billHistory = JSON.parse(localStorage.getItem("billHistory")) || [];
let currentWeights = [];
let stock = JSON.parse(localStorage.getItem("stock")) || {};
let salesItems = [];
let salesHistory = JSON.parse(localStorage.getItem("salesHistory")) || [];
let currentDateFilter = 'today';
let customDateRange = { from: null, to: null };
let transactionMode = 'purchase'; // 'purchase' or 'sale'

// Settings with defaults
let settings = JSON.parse(localStorage.getItem("settings")) || {
    heavyWeightThreshold: 30,
    laborRate: 6,
    autoLaborEnabled: true,
    showHindi: false
};

// Modal system
let modalResolve = null;

function showModal(message, title = 'Alert', showCancel = false) {
    return new Promise((resolve) => {
        modalResolve = resolve;
        
        const modalOverlay = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalCancelBtn = document.getElementById('modalCancelBtn');
        const modalConfirmBtn = document.getElementById('modalConfirmBtn');
        
        modalTitle.textContent = title;
        modalMessage.innerHTML = message.replace(/\n/g, '<br>');
        
        if (showCancel) {
            modalCancelBtn.style.display = 'block';
            modalConfirmBtn.textContent = 'Yes';
        } else {
            modalCancelBtn.style.display = 'none';
            modalConfirmBtn.textContent = 'OK';
        }
        
        modalOverlay.classList.add('active');
    });
}

function closeModal(result) {
    const modalOverlay = document.getElementById('modalOverlay');
    modalOverlay.classList.remove('active');
    
    if (modalResolve) {
        modalResolve(result);
        modalResolve = null;
    }
}

// Save DB (without re-rendering)
function saveDB() {
    localStorage.setItem("items", JSON.stringify(items));
    loadItemsDropdown();
}

// Save DB with full re-render (only when structure changes)
function saveDBAndRender() {
    localStorage.setItem("items", JSON.stringify(items));
    renderItems();
    loadItemsDropdown();
}

// -------------------- SIDE NAVIGATION --------------------
function toggleMenu() {
    const sideNav = document.getElementById("sideNav");
    const overlay = document.getElementById("overlay");
    
    sideNav.classList.toggle("active");
    overlay.classList.toggle("active");
}

function showTabFromNav(tabId, event) {
    // Hide all tabs
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    
    // Show selected tab
    document.getElementById(tabId).classList.add("active");
    
    // Update active nav link
    document.querySelectorAll(".nav-menu a").forEach(a => a.classList.remove("active"));
    if (event) event.target.closest("a").classList.add("active");
    
    // Refresh data for specific tabs with slight delay for canvas rendering
    if (tabId === 'history') renderHistory();
    if (tabId === 'reports') {
        setTimeout(() => renderReports(), 100);
    }
    if (tabId === 'configure') loadSettings();
    if (tabId === 'stock') renderStock();
    if (tabId === 'sales') {
        loadSalesPageDropdown();
        renderSalesBill();
    }
    
    // Close menu
    toggleMenu();
}

// -------------------- HISTORY --------------------
function saveBillToHistory() {
    if (billItems.length === 0) return;

    const laborCharges = Number(document.getElementById("manualLaborCharges").value) || 0;
    const billTotal = Number(document.getElementById("billTotal").textContent);
    const amountPayable = billTotal - laborCharges;
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;

    const bill = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        items: [...billItems], // Full item details with weights
        laborCharges: laborCharges,
        billTotal: billTotal,
        total: amountPayable,
        payment: {
            online: onlinePayment,
            cash: cashPayment,
            total: totalPayment
        },
        type: 'purchase'
    };

    billHistory.unshift(bill);
    localStorage.setItem("billHistory", JSON.stringify(billHistory));
    
    // Clear current bill - set payment fields to empty
    billItems = [];
    document.getElementById("manualLaborCharges").value = 0;
    document.getElementById("onlinePayment").value = "";
    document.getElementById("cashPayment").value = "";
    document.getElementById("onlineCheckbox").checked = false;
    document.getElementById("cashCheckbox").checked = false;
    document.getElementById("totalPayment").textContent = 0;
    
    const totalPacketsElement = document.getElementById("totalPacketsInBill");
    if (totalPacketsElement) {
        totalPacketsElement.textContent = 0;
    }
    
    const laborCalcElement = document.getElementById("laborCalculation");
    if (laborCalcElement) {
        laborCalcElement.textContent = `${settings.laborRate} × 0`;
    }
    
    renderBill();
    updateTotals();
    
    // Reset item dropdown to most frequent
    loadItemsDropdown();
}

function renderHistory() {
    const container = document.getElementById("historyList");
    
    if (billHistory.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No billing history yet</p>';
        return;
    }

    container.innerHTML = "";

    billHistory.forEach(bill => {
        const div = document.createElement("div");
        div.className = "history-item";
        
        // Calculate total packets from items
        const totalPackets = bill.items.reduce((sum, item) => sum + (item.packets || 0), 0);
        const totalWeight = bill.items.reduce((sum, item) => sum + (item.qty || 0), 0);
        
        // Build items detail HTML
        const itemsDetailHTML = bill.items.map(item => {
            const weightsDisplay = item.weights ? item.weights.map(w => `${w}kg`).join(', ') : '';
            return `
                <div class="history-item-detail">
                    <strong>${item.name}</strong> - Rate: ₹${item.rate}<br>
                    <small>${item.packets} packets: ${weightsDisplay} = ${item.qty}kg → ₹${item.total}</small>
                </div>
            `;
        }).join("");
        
        // Payment details
        const paymentHTML = bill.payment ? `
            <div class="history-payment">
                ${bill.payment.online > 0 ? `Online: ₹${bill.payment.online}` : ''}
                ${bill.payment.online > 0 && bill.payment.cash > 0 ? ' | ' : ''}
                ${bill.payment.cash > 0 ? `Cash: ₹${bill.payment.cash}` : ''}
                ${bill.payment.total > 0 ? ` = Total Payment: ₹${bill.payment.total}` : ''}
            </div>
        ` : '';
        
        div.innerHTML = `
            <div class="history-header">
                <span>Bill #${bill.id}</span>
                <span style="color: #28a745; font-weight: 700;">₹ ${bill.total}</span>
            </div>
            <div class="history-date">${bill.date}</div>
            <div class="history-summary">
                ${bill.items.length} items • ${totalPackets} packets • ${totalWeight}kg
            </div>
            ${bill.laborCharges > 0 ? `<div class="history-labor">Labor Charges: ₹${bill.laborCharges}</div>` : ''}
            ${paymentHTML}
            <div class="history-items-detail">
                ${itemsDetailHTML}
            </div>
        `;
        
        container.appendChild(div);
    });
}

// -------------------- STOCK MANAGEMENT --------------------
function updateStock(itemName, quantity, rate) {
    if (!stock[itemName]) {
        stock[itemName] = {
            quantity: 0,
            avgRate: 0,
            totalValue: 0
        };
    }
    
    // Calculate new average rate using weighted average
    const oldValue = stock[itemName].quantity * stock[itemName].avgRate;
    const newValue = quantity * rate;
    stock[itemName].quantity += quantity;
    
    if (stock[itemName].quantity > 0) {
        stock[itemName].avgRate = (oldValue + newValue) / stock[itemName].quantity;
    }
    
    localStorage.setItem("stock", JSON.stringify(stock));
}

function reduceStock(itemName, quantity) {
    if (!stock[itemName]) {
        return false;
    }
    
    if (stock[itemName].quantity < quantity) {
        return false;
    }
    
    stock[itemName].quantity -= quantity;
    localStorage.setItem("stock", JSON.stringify(stock));
    return true;
}

function renderStock() {
    const container = document.getElementById("stockList");
    
    const stockItems = Object.keys(stock);
    
    if (stockItems.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No stock data available. Start purchasing items to build stock.</p>';
        return;
    }
    
    container.innerHTML = "";
    
    stockItems.forEach(itemName => {
        const item = stock[itemName];
        const div = document.createElement("div");
        
        let stockClass = "stock-item";
        if (item.quantity === 0) stockClass += " stock-out";
        else if (item.quantity < 100) stockClass += " stock-low";
        
        div.className = stockClass;
        
        const stockValue = item.quantity * item.avgRate;
        
        div.innerHTML = `
            <div class="stock-header">
                <span>${itemName}</span>
                <span style="color: ${item.quantity > 0 ? '#28a745' : '#dc3545'};">${item.quantity.toFixed(2)} kg</span>
            </div>
            <div class="stock-details">
                <div><strong>Average Purchase Rate:</strong> ₹${item.avgRate.toFixed(2)}/kg</div>
                <div><strong>Stock Value:</strong> ₹${stockValue.toFixed(2)}</div>
                ${item.quantity < 100 && item.quantity > 0 ? '<div style="color: #ffc107; font-weight: 600; margin-top: 8px;">⚠️ Low Stock</div>' : ''}
                ${item.quantity === 0 ? '<div style="color: #dc3545; font-weight: 600; margin-top: 8px;">❌ Out of Stock</div>' : ''}
            </div>
        `;
        
        container.appendChild(div);
    });
}

// -------------------- SALES MANAGEMENT --------------------
function loadSellItemDropdown() {
    const select = document.getElementById("billItem");
    if (!select) return;
    
    select.innerHTML = '<option value="">Select item</option>';

    // Load items that have stock
    Object.keys(stock).forEach(itemName => {
        if (stock[itemName].quantity > 0) {
            const opt = document.createElement("option");
            opt.value = itemName;
            opt.textContent = itemName;
            select.appendChild(opt);
        }
    });
    
    clearWeights();
}

function loadSalesPageDropdown() {
    const select = document.getElementById("sellItem");
    if (!select) return;
    
    select.innerHTML = '<option value="">Select item</option>';

    // Load items that have stock
    Object.keys(stock).forEach(itemName => {
        if (stock[itemName].quantity > 0) {
            const opt = document.createElement("option");
            opt.value = itemName;
            opt.textContent = itemName;
            select.appendChild(opt);
        }
    });
}

function loadSellItemDetails() {
    const itemName = document.getElementById("sellItem").value;
    const availableStockEl = document.getElementById("availableStock");
    const avgRateEl = document.getElementById("avgPurchaseRate");
    const sellRateEl = document.getElementById("sellRate");
    
    if (!itemName || !stock[itemName]) {
        availableStockEl.textContent = "-";
        avgRateEl.textContent = "-";
        sellRateEl.value = "";
        return;
    }
    
    availableStockEl.textContent = stock[itemName].quantity.toFixed(2);
    avgRateEl.textContent = stock[itemName].avgRate.toFixed(2);
    
    // Check if item has predefined sale rates
    const itemData = items.find(item => item.name === itemName);
    if (itemData && itemData.saleRates && itemData.saleRates.length > 0) {
        // Use first sale rate as default
        const firstValidRate = itemData.saleRates.find(rate => rate && rate > 0);
        sellRateEl.value = firstValidRate || "";
    } else {
        // Don't suggest any rate if no sale rates are defined
        sellRateEl.value = "";
    }
}

async function addToSalesBill() {
    const itemName = document.getElementById("sellItem").value;
    const quantity = Number(document.getElementById("sellQuantity").value);
    const rate = Number(document.getElementById("sellRate").value);
    
    if (!itemName) {
        await showModal("Please select an item");
        return;
    }
    
    if (!quantity || quantity <= 0) {
        await showModal("Please enter valid quantity");
        return;
    }
    
    if (!rate || rate <= 0) {
        await showModal("Please enter valid selling rate");
        return;
    }
    
    if (!stock[itemName] || stock[itemName].quantity < quantity) {
        await showModal(`Insufficient stock! Only ${stock[itemName]?.quantity.toFixed(2) || 0} kg available`);
        return;
    }
    
    salesItems.push({
        name: itemName,
        quantity: quantity,
        rate: rate,
        total: Math.round(quantity * rate),
        costRate: stock[itemName].avgRate,
        profit: Math.round((rate - stock[itemName].avgRate) * quantity)
    });
    
    renderSalesBill();
    
    // Clear inputs
    document.getElementById("sellItem").value = "";
    document.getElementById("sellQuantity").value = "";
    document.getElementById("sellRate").value = "";
    document.getElementById("availableStock").textContent = "-";
    document.getElementById("avgPurchaseRate").textContent = "-";
}

function renderSalesBill() {
    const tbody = document.querySelector("#salesTable tbody");
    tbody.innerHTML = "";
    
    let total = 0;
    
    salesItems.forEach((item, i) => {
        total += item.total;
        
        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.name}</td>
            <td>₹${item.rate}</td>
            <td>${item.quantity} kg</td>
            <td>₹${item.total}</td>
            <td><button class="remove-bill-item" onclick="removeSalesItem(${i})">×</button></td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById("salesTotalAmount").textContent = total;
}

function removeSalesItem(index) {
    salesItems.splice(index, 1);
    renderSalesBill();
}

async function completeSale() {
    if (salesItems.length === 0) {
        await showModal("No items in sale");
        return;
    }
    
    // Reduce stock for each item
    const saleRecord = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        items: [...salesItems],
        total: Number(document.getElementById("salesTotalAmount").textContent)
    };
    
    let stockUpdateFailed = false;
    
    salesItems.forEach(item => {
        if (!reduceStock(item.name, item.quantity)) {
            stockUpdateFailed = true;
        }
    });
    
    if (stockUpdateFailed) {
        await showModal("Error: Some items couldn't be reduced from stock. Please check stock levels.");
        return;
    }
    
    // Save to sales history
    salesHistory.unshift(saleRecord);
    localStorage.setItem("salesHistory", JSON.stringify(salesHistory));
    
    // Clear sales bill
    salesItems = [];
    renderSalesBill();
    renderStock();
    loadSellItemDropdown();
    
    await showModal(`Sale completed! Total: ₹${saleRecord.total}`, "Success");
}

// -------------------- DATE FILTERING --------------------
function setDateFilter(filter, evt) {
    currentDateFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (evt) evt.target.classList.add('active');
    
    // Show/hide custom date range
    const customRange = document.getElementById('customDateRange');
    if (filter === 'custom') {
        customRange.style.display = 'block';
    } else {
        customRange.style.display = 'none';
        renderReports();
    }
}

function applyCustomDateFilter() {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    
    if (from && to) {
        customDateRange.from = new Date(from);
        customDateRange.to = new Date(to);
        customDateRange.to.setHours(23, 59, 59, 999);
        renderReports();
    }
}

function filterBillsByDate(bills) {
    const now = new Date();
    
    return bills.filter(bill => {
        const billDate = new Date(bill.date);
        
        switch(currentDateFilter) {
            case 'today':
                return billDate.toDateString() === now.toDateString();
            
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
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

// -------------------- REPORTS --------------------
function renderReports() {
    const filteredBills = filterBillsByDate(billHistory);
    
    const totalSales = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalBills = filteredBills.length;
    const totalLabour = filteredBills.reduce((sum, bill) => sum + (bill.laborCharges || 0), 0);
    const totalCash = filteredBills.reduce((sum, bill) => sum + (bill.payment?.cash || 0), 0);
    const totalOnline = filteredBills.reduce((sum, bill) => sum + (bill.payment?.online || 0), 0);
    const totalPayment = totalCash + totalOnline;

    document.getElementById("totalSales").textContent = totalSales;
    document.getElementById("totalBills").textContent = totalBills;
    document.getElementById("totalLabour").textContent = totalLabour;
    document.getElementById("totalCash").textContent = totalCash;
    document.getElementById("totalOnline").textContent = totalOnline;
    document.getElementById("totalPaymentReport").textContent = totalPayment;

    // Popular items
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
    
    // Item-wise detailed report
    renderItemWiseReport(itemCounts, itemQuantities, itemValues);
    
    // Render chart
    renderPurchaseChart(filteredBills);
}

function renderItemWiseReport(itemCounts, itemQuantities, itemValues) {
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

function renderPurchaseChart(bills) {
    const canvas = document.getElementById('purchaseChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Set canvas size based on container
    const container = canvas.parentElement;
    canvas.width = container.offsetWidth - 40;
    canvas.height = 250;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (bills.length === 0) {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Group by date
    const dailyData = {};
    bills.forEach(bill => {
        const date = new Date(bill.date).toLocaleDateString();
        if (!dailyData[date]) {
            dailyData[date] = 0;
        }
        dailyData[date] += bill.total;
    });
    
    const dates = Object.keys(dailyData).slice(-7); // Last 7 days
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
        
        // Draw bar
        ctx.fillRect(x, y, barWidth - 10, barHeight);
        
        // Draw value
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('₹' + value, x + (barWidth - 10) / 2, y - 5);
        
        // Draw date
        ctx.save();
        ctx.translate(x + (barWidth - 10) / 2, canvas.height - 10);
        ctx.rotate(-Math.PI / 4);
        ctx.font = '10px Arial';
        ctx.fillText(dates[index], 0, 0);
        ctx.restore();
        
        ctx.fillStyle = '#007bff';
    });
}

// -------------------- HELPER: GET MOST FREQUENT ITEMS --------------------
function getMostFrequentItem(mode) {
    const freq = {};
    
    if (mode === 'purchase') {
        // Count purchase frequency from billHistory
        billHistory.forEach(bill => {
            if (bill.type === 'purchase' || !bill.type) {
                bill.items.forEach(item => {
                    freq[item.name] = (freq[item.name] || 0) + 1;
                });
            }
        });
    } else {
        // Count sale frequency from both billHistory (sale mode) and salesHistory
        billHistory.forEach(bill => {
            if (bill.type === 'sale') {
                bill.items.forEach(item => {
                    freq[item.name] = (freq[item.name] || 0) + 1;
                });
            }
        });
        salesHistory.forEach(sale => {
            sale.items.forEach(item => {
                freq[item.name] = (freq[item.name] || 0) + 1;
            });
        });
    }
    
    // Find most frequent
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
}

// -------------------- TABS --------------------
function showTab(tabId, evt) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));

    document.getElementById(tabId).classList.add("active");
    if (evt) evt.target.classList.add("active");
}

// -------------------- ITEMS & RATES PAGE --------------------
function renderItems() {
    const container = document.getElementById("itemsList");
    container.innerHTML = "";

    items.forEach((item, index) => {
        let card = document.createElement("div");
        card.className = "item-card";

        // Build purchase rates - wrap each rate+button in a container
        const purchaseRatesHTML = item.rates.map((rate, rIndex) => `
            <div class="rate-group">
                <input type="number" value="${rate}" class="rate-input purchase" oninput="updateRate(${index}, ${rIndex}, this.value)" placeholder="Rate" />
                <button class="delete-rate" onclick="deleteRate(${index}, ${rIndex})">×</button>
            </div>
        `).join('');

        // Build sale rates - wrap each rate+button in a container
        const saleRatesHTML = (item.saleRates || []).map((rate, rIndex) => `
            <div class="rate-group">
                <input type="number" value="${rate}" class="rate-input sale" oninput="updateSaleRate(${index}, ${rIndex}, this.value)" placeholder="Rate" />
                <button class="delete-rate" onclick="deleteSaleRate(${index}, ${rIndex})">×</button>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="item-header">
                <input type="text" class="item-name-input" 
                       value="${item.name}" 
                       oninput="updateItemName(${index}, this.value)"
                       placeholder="Enter item name (English)">
                <button class="delete-item-btn" onclick="deleteItem(${index})">Delete</button>
            </div>
            <div style="margin-bottom: 12px;">
                <label style="font-size: 13px; font-weight: 600; color: #666; margin-bottom: 4px; display: block;">Hindi Name (Optional):</label>
                <input type="text" 
                       value="${item.hindiName || ''}" 
                       oninput="updateItemHindiName(${index}, this.value)"
                       placeholder="हिंदी नाम"
                       style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px; font-size: 15px;">
            </div>
            <div class="item-row">
                <div style="margin-bottom: 8px;">
                    <label style="font-size: 14px; font-weight: 600; color: #007bff; margin-bottom: 8px; display: block;">Purchase Rates (₹/kg):</label>
                    <div class="rates-container">${purchaseRatesHTML}<button class="add-rate-plus purchase" onclick="addRate(${index})">+</button></div>
                </div>

                <div>
                    <label style="font-size: 14px; font-weight: 600; color: #28a745; margin-bottom: 8px; display: block;">Sale Rates (₹/kg):</label>
                    <div class="rates-container">${saleRatesHTML}<button class="add-rate-plus sale" onclick="addSaleRate(${index})">+</button></div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// Add item
function addItem() {
    items.push({ name: "", hindiName: "", rates: [], saleRates: [] });
    saveDBAndRender();
}

// Update item name (AUTO-SAVE without re-render)
function updateItemName(index, value) {
    items[index].name = value;
    saveDB();
}

// Update item Hindi name (AUTO-SAVE without re-render)
function updateItemHindiName(index, value) {
    items[index].hindiName = value;
    saveDB();
}

// Add rate inline
function addRate(index) {
    items[index].rates.push('');
    saveDBAndRender();
}

// Update rate (AUTO-SAVE without re-render)
function updateRate(itemIndex, rateIndex, value) {
    items[itemIndex].rates[rateIndex] = Number(value);
    saveDB();
}

// Delete rate
function deleteRate(itemIndex, rateIndex) {
    items[itemIndex].rates.splice(rateIndex, 1);
    saveDBAndRender();
}

// Add sale rate inline
function addSaleRate(index) {
    if (!items[index].saleRates) {
        items[index].saleRates = [];
    }
    items[index].saleRates.push('');
    saveDBAndRender();
}

// Update sale rate (AUTO-SAVE without re-render)
function updateSaleRate(itemIndex, rateIndex, value) {
    if (!items[itemIndex].saleRates) {
        items[itemIndex].saleRates = [];
    }
    items[itemIndex].saleRates[rateIndex] = Number(value);
    saveDB();
}

// Delete sale rate
function deleteSaleRate(itemIndex, rateIndex) {
    if (items[itemIndex].saleRates) {
        items[itemIndex].saleRates.splice(rateIndex, 1);
        saveDBAndRender();
    }
}

// Delete item
function deleteItem(index) {
    items.splice(index, 1);
    saveDBAndRender();
}

// -------------------- BILLING PAGE --------------------
function loadItemsDropdown() {
    let select = document.getElementById("billItem");
    if (!select) return;
    
    select.innerHTML = "";

    items.forEach((item, index) => {
        let opt = document.createElement("option");
        opt.value = index;
        const displayName = (settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        opt.textContent = displayName;
        select.appendChild(opt);
    });

    // Select most frequent purchased item by default
    if (items.length > 0) {
        const mostFrequent = getMostFrequentItem('purchase');
        if (mostFrequent) {
            const frequentIndex = items.findIndex(item => item.name === mostFrequent);
            if (frequentIndex !== -1) {
                select.value = frequentIndex;
            }
        }
        loadRates();
    }
    clearWeights(); // Clear weights when loading items
}

// Load sale items dropdown (items with stock)
function loadSaleItemsDropdown() {
    const select = document.getElementById("billItem");
    if (!select) return;
    
    select.innerHTML = '';

    // Load items that have stock
    const stockItems = Object.keys(stock).filter(itemName => stock[itemName].quantity > 0);
    
    stockItems.forEach(itemName => {
        const opt = document.createElement("option");
        opt.value = itemName;
        const item = items.find(i => i.name === itemName);
        const displayName = (settings.showHindi && item && item.hindiName) ? item.hindiName : itemName;
        opt.textContent = displayName;
        select.appendChild(opt);
    });
    
    // Select most frequent sold item by default
    if (stockItems.length > 0) {
        const mostFrequent = getMostFrequentItem('sale');
        if (mostFrequent && stock[mostFrequent] && stock[mostFrequent].quantity > 0) {
            select.value = mostFrequent;
        }
        loadRates();
    }
    
    clearWeights();
}

// Load rates of selected item
function loadRates() {
    const itemIndex = document.getElementById("billItem").value;
    const rateInput = document.getElementById("billRate");
    const rateDatalist = document.getElementById("rateOptions");
    
    if (!rateInput) return;
    
    rateDatalist.innerHTML = "";
    rateInput.value = "";
    rateInput.placeholder = "Select or enter rate";

    if (transactionMode === 'sale') {
        // For sale mode, load predefined sale rates
        const itemName = itemIndex;
        
        // Try to find item in items list to get sale rates
        const itemData = items.find(item => item.name === itemName);
        
        if (itemData && itemData.saleRates && itemData.saleRates.length > 0) {
            // Load sale rates into datalist
            itemData.saleRates.forEach(rate => {
                if (rate && rate > 0) {
                    let opt = document.createElement("option");
                    opt.value = rate;
                    rateDatalist.appendChild(opt);
                }
            });
        }
        // Don't auto-fill any rate - leave empty for manual entry
    } else {
        // For purchase mode, load predefined purchase rates
        if (!items[itemIndex]) return;

        items[itemIndex].rates.forEach(rate => {
            let opt = document.createElement("option");
            opt.value = rate;
            rateDatalist.appendChild(opt);
        });
    }

    clearWeights();
}

// Handle rate selection change
function handleRateChange() {
    const rateSelect = document.getElementById("billRate");
    const customRateInput = document.getElementById("customRate");
    
    // Clear custom rate when predefined rate is selected
    customRateInput.value = "";
}

// Update rate select when custom rate is entered
function updateRateFromCustom() {
    const customRateInput = document.getElementById("customRate");
    const rateSelect = document.getElementById("billRate");
    
    if (customRateInput.value) {
        // Clear selection when custom rate is entered
        rateSelect.value = "";
    }
}

// -------------------- WEIGHTS MANAGEMENT --------------------
async function addWeight() {
    const weightInput = document.getElementById("newWeight");
    const weight = Number(weightInput.value);

    if (!weight || weight <= 0) {
        await showModal("Enter valid weight");
        return;
    }

    currentWeights.push(weight);
    renderWeights();
    weightInput.value = "";
    weightInput.focus();
}

function renderWeights() {
    const container = document.getElementById("weightsDisplay");
    
    let totalWeight = 0;

    currentWeights.forEach(w => {
        totalWeight += w;
    });

    // Update summary
    document.getElementById("totalWeights").textContent = totalWeight;
    document.getElementById("totalPackets").textContent = currentWeights.length;

    // Render weight chips
    if (currentWeights.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div class="weights-compact-list">
            ${currentWeights.map((weight, index) => `
                <div class="weight-chip">
                    <span class="weight-chip-value">${weight}</span>
                    <button class="weight-chip-remove" onclick="removeWeight(${index})">×</button>
                </div>
            `).join("")}
        </div>
    `;
}

function removeWeight(index) {
    currentWeights.splice(index, 1);
    renderWeights();
}

function clearWeights() {
    currentWeights = [];
    renderWeights();
    if (document.getElementById("newWeight")) {
        document.getElementById("newWeight").value = "";
    }
}

// Add to bill
async function addToBill() {
    // Check if there's a weight entered but not added
    const weightInput = document.getElementById("newWeight");
    const pendingWeight = Number(weightInput.value);
    
    if (pendingWeight && pendingWeight > 0) {
        currentWeights.push(pendingWeight);
        weightInput.value = "";
        renderWeights();
    }

    let itemIndex = document.getElementById("billItem").value;
    let rate = Number(document.getElementById("billRate").value);

    if (!itemIndex) {
        await showModal("Please select an item");
        return;
    }

    if (!rate || rate <= 0) {
        await showModal("Please enter a valid rate");
        return;
    }

    if (currentWeights.length === 0) {
        await showModal("Please add at least one weight");
        return;
    }

    const totalQty = currentWeights.reduce((sum, w) => sum + w, 0);

    if (transactionMode === 'sale') {
        // Sale mode
        const itemName = itemIndex;
        
        if (!stock[itemName] || stock[itemName].quantity < totalQty) {
            await showModal(`Insufficient stock! Only ${stock[itemName]?.quantity.toFixed(2) || 0} kg available`);
            return;
        }

        billItems.push({
            name: itemName,
            rate,
            qty: totalQty,
            weights: [...currentWeights],
            packets: currentWeights.length,
            total: Math.round(rate * totalQty),
            mode: 'sale'
        });
    } else {
        // Purchase mode
        let item = items[itemIndex];
        const heavyPackets = currentWeights.filter(w => w > settings.heavyWeightThreshold).length;

        billItems.push({
            name: item.name,
            rate,
            qty: totalQty,
            weights: [...currentWeights],
            packets: currentWeights.length,
            heavyPackets: heavyPackets,
            total: Math.round(rate * totalQty),
            mode: 'purchase'
        });

        // Update stock - ADD to stock when purchasing
        updateStock(item.name, totalQty, rate);

        // Auto-add labor charge for heavy packets if checkbox is enabled
        const autoLaborEnabled = document.getElementById("autoLaborCharge").checked;
        if (heavyPackets > 0 && autoLaborEnabled) {
            const autoLabor = heavyPackets * settings.laborRate;
            const currentLabor = Number(document.getElementById("manualLaborCharges").value) || 0;
            document.getElementById("manualLaborCharges").value = currentLabor + autoLabor;
        }
    }

    renderBill();
    clearWeights();
    updateTotals();
    
    // Reset selection
    document.getElementById("billItem").value = "";
    document.getElementById("billRate").value = "";
}

// Render bill items in the table
function renderBill() {
    const tbody = document.querySelector("#billTable tbody");
    tbody.innerHTML = "";

    let total = 0;
    let totalPacketsCount = 0;
    let totalHeavyPacketsCount = 0;

    billItems.forEach((b, i) => {
        total += b.total;
        totalPacketsCount += b.packets;
        totalHeavyPacketsCount += b.heavyPackets || 0;

        // Format weights display - show formula for multiple weights, just total for single weight
        let weightsDisplay = '';
        if (b.weights) {
            if (b.weights.length === 1) {
                weightsDisplay = `<strong>${b.qty}kg</strong>`;
            } else {
                weightsDisplay = b.weights.join('+') + ` = <strong>${b.qty}kg</strong>`;
            }
        }

        let row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${b.name}</strong></td>
            <td>₹${b.rate}</td>
            <td>${weightsDisplay}</td>
            <td><strong>₹${b.total}</strong></td>
            <td><button class="remove-bill-item" onclick="deleteBillItem(${i})">×</button></td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById("billTotal").textContent = total;
    
    // Update total packets display
    const totalPacketsElement = document.getElementById("totalPacketsInBill");
    if (totalPacketsElement) {
        totalPacketsElement.textContent = totalPacketsCount;
    }
    
    // Update labor calculation display (only for purchase mode)
    if (transactionMode === 'purchase') {
        const laborCalcElement = document.getElementById("laborCalculation");
        if (laborCalcElement) {
            laborCalcElement.textContent = `${settings.laborRate} × ${totalHeavyPacketsCount}`;
        }
    }
    
    updateTotals();
}

function deleteBillItem(index) {
    billItems.splice(index, 1);
    renderBill();
}

// Update totals calculation
function updateTotals() {
    const billTotal = Number(document.getElementById("billTotal").textContent) || 0;
    
    if (transactionMode === 'sale') {
        // For sales, no labor charges
        document.getElementById("amountPayable").textContent = Math.round(billTotal);
    } else {
        // For purchases, subtract labor charges
        const laborCharges = Number(document.getElementById("manualLaborCharges").value) || 0;
        const amountPayable = Math.round(billTotal - laborCharges);
        document.getElementById("amountPayable").textContent = amountPayable;
    }
}

// Update payment total
function updatePaymentTotal() {
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;
    
    const totalPaymentElement = document.getElementById("totalPayment");
    totalPaymentElement.textContent = totalPayment;
    
    // Get amount payable
    const amountPayable = Number(document.getElementById("amountPayable").textContent) || 0;
    
    // Check if payment exceeds amount payable
    const paymentTotalRow = document.querySelector('.payment-total');
    if (totalPayment > amountPayable && amountPayable > 0) {
        paymentTotalRow.classList.add('payment-excess');
    } else {
        paymentTotalRow.classList.remove('payment-excess');
    }
}

function fillPayableAmount(type) {
    const onlineCheckbox = document.getElementById('onlineCheckbox');
    const cashCheckbox = document.getElementById('cashCheckbox');
    const onlinePayment = document.getElementById('onlinePayment');
    const cashPayment = document.getElementById('cashPayment');
    const amountPayable = Number(document.getElementById('amountPayable').textContent) || 0;

    if (type === 'online') {
        if (onlineCheckbox.checked) {
            cashCheckbox.checked = false;
            onlinePayment.value = amountPayable;
            cashPayment.value = '';
        } else {
            onlinePayment.value = '';
        }
    } else if (type === 'cash') {
        if (cashCheckbox.checked) {
            onlineCheckbox.checked = false;
            cashPayment.value = amountPayable;
            onlinePayment.value = '';
        } else {
            cashPayment.value = '';
        }
    }

    updatePaymentTotal();
}

// -------------------- PRINT BILL --------------------
async function printBill() {
    if (billItems.length === 0) {
        await showModal("No items in bill");
        return;
    }

    // Get payment details - treat empty as 0
    const amountPayable = Number(document.getElementById("amountPayable").textContent) || 0;
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;
    
    // Check if payment is sufficient
    if (totalPayment < amountPayable) {
        const shortfall = amountPayable - totalPayment;
        const confirmPrint = await showModal(
            `⚠️ Payment Insufficient!\n\n` +
            `Amount Payable: ₹${amountPayable}\n` +
            `Total Payment: ₹${totalPayment}\n` +
            `Shortfall: ₹${shortfall.toFixed(2)}\n\n` +
            `Do you still want to print the bill?`,
            'Confirmation',
            true
        );
        
        if (!confirmPrint) {
            return;
        }
    }

    const isPurchase = billItems[0].mode === 'purchase';
    
    // Get values before clearing
    const billTotal = Number(document.getElementById("billTotal").textContent);
    const laborCharges = isPurchase ? Number(document.getElementById("manualLaborCharges").value) || 0 : 0;
    const amountPayableFinal = isPurchase ? billTotal - laborCharges : billTotal;

    // Calculate totals before clearing
    const totalHeavyPackets = billItems.reduce((sum, b) => sum + (b.heavyPackets || 0), 0);
    const totalPackets = billItems.reduce((sum, b) => sum + (b.packets || 0), 0);

    // Build bill items HTML with current data (always use Hindi names in print)
    let billItemsHTML = billItems.map(b => {
        let weightsDisplay = '';
        if (b.weights) {
            if (b.weights.length === 1) {
                weightsDisplay = `<strong>${b.qty}kg</strong>`;
            } else {
                weightsDisplay = b.weights.join('+') + ` = <strong>${b.qty}kg</strong>`;
            }
        }
        const item = items.find(i => i.name === b.name);
        const printName = (item && item.hindiName) ? item.hindiName : b.name;
        
        return `
            <tr>
                <td>${printName}</td>
                <td>₹ ${b.rate}</td>
                <td>${weightsDisplay}</td>
                <td>₹ ${b.total}</td>
            </tr>
        `;
    }).join("");

    // Calculate labor charge breakdown
    const laborCalc = totalHeavyPackets > 0 ? `(${settings.laborRate} × ${totalHeavyPackets}) = ₹${laborCharges}` : '';

    const printContent = `
        <html>
        <head>
            <title>Bill</title>
            <style>
                body { font-family: Arial; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border-bottom: 1px solid #ccc; padding: 8px; text-align: center; }
                h2, h3 { text-align: center; }
                .totals { margin-top: 30px; font-size: 16px; }
                .totals div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                .grand-total { font-size: 20px; font-weight: bold; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; }
            </style>
        </head>
        <body>
            <h2>${isPurchase ? 'Purchase Receipt' : 'Sale Receipt'}</h2>
            <table>
                <tr><th>Item</th><th>Rate</th><th>Qty</th><th>Total</th></tr>
                ${billItemsHTML}
            </table>

            <div class="totals">
                <div><span>${isPurchase ? 'Purchase Total:' : 'Sale Total:'}</span><span>₹ ${billTotal}</span></div>
                ${isPurchase && laborCharges > 0 ? `<div><span>Labor Charges:</span><span>${laborCalc}</span></div>` : ''}
                <div><span>Total Packets:</span><span>${totalPackets}</span></div>
                <div class="grand-total"><span>${isPurchase ? 'Total Paid:' : 'Total Received:'}</span><span>₹ ${amountPayableFinal}</span></div>
            </div>
        </body>
        </html>
    `;

    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printContent);
    doc.close();
    
    // Wait for content to load, then print
    iframe.contentWindow.focus();
    setTimeout(() => {
        iframe.contentWindow.print();
        // Remove iframe after printing
        setTimeout(() => document.body.removeChild(iframe), 100);
    }, 250);

    // Save to appropriate history
    if (isPurchase) {
        saveBillToHistory();
    } else {
        saveSaleToHistory();
    }
}

function saveSaleToHistory() {
    if (billItems.length === 0) return;

    const billTotal = Number(document.getElementById("billTotal").textContent);
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;

    // Reduce stock for each item
    billItems.forEach(item => {
        reduceStock(item.name, item.qty);
    });

    const sale = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        items: [...billItems],
        total: billTotal,
        payment: {
            online: onlinePayment,
            cash: cashPayment,
            total: totalPayment
        },
        type: 'sale'
    };

    salesHistory.unshift(sale);
    localStorage.setItem("salesHistory", JSON.stringify(salesHistory));
    
    // Clear current bill - set payment fields to empty
    billItems = [];
    document.getElementById("onlinePayment").value = "";
    document.getElementById("cashPayment").value = "";
    document.getElementById("onlineCheckbox").checked = false;
    document.getElementById("cashCheckbox").checked = false;
    document.getElementById("totalPayment").textContent = 0;
    
    const totalPacketsElement = document.getElementById("totalPacketsInBill");
    if (totalPacketsElement) {
        totalPacketsElement.textContent = 0;
    }
    
    renderBill();
    updateTotals();
    
    // Reload stock dropdown for next sale with most frequent item
    if (transactionMode === 'sale') {
        loadSaleItemsDropdown();
    }
}

// -------------------- SAVE BILL ONLY --------------------
async function saveBillOnly() {
    if (billItems.length === 0) {
        await showModal("No items in bill");
        return;
    }

    // Get payment details
    const amountPayable = Number(document.getElementById("amountPayable").textContent) || 0;
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;
    
    // Check if payment is sufficient
    if (totalPayment < amountPayable) {
        const shortfall = amountPayable - totalPayment;
        const confirmSave = await showModal(
            `⚠️ Payment Insufficient!\n\n` +
            `Amount Payable: ₹${amountPayable}\n` +
            `Total Payment: ₹${totalPayment}\n` +
            `Shortfall: ₹${shortfall.toFixed(2)}\n\n` +
            `Do you still want to save the bill?`,
            'Confirmation',
            true
        );
        
        if (!confirmSave) {
            return;
        }
    }

    const isPurchase = billItems[0].mode === 'purchase';
    
    // Save to appropriate history
    if (isPurchase) {
        saveBillToHistory();
        await showModal("Purchase bill saved successfully!", "Success");
    } else {
        saveSaleToHistory();
        await showModal("Sale bill saved successfully!", "Success");
    }
}

// -------------------- TRANSACTION MODE --------------------
async function toggleTransactionMode() {
    transactionMode = transactionMode === 'purchase' ? 'sale' : 'purchase';
    updateModeUI();
    
    // Load appropriate items
    if (transactionMode === 'sale') {
        loadSaleItemsDropdown();
    } else {
        loadItemsDropdown();
    }
    
    // Clear current bill if switching modes
    if (billItems.length > 0) {
        const shouldContinue = await showModal('Switching modes will clear current bill. Continue?', 'Confirmation', true);
        if (shouldContinue) {
            billItems = [];
            renderBill();
            updateTotals();
        } else {
            // Revert mode
            transactionMode = transactionMode === 'purchase' ? 'sale' : 'purchase';
            updateModeUI();
            return;
        }
    }
}

function updateModeUI() {
    const billingTab = document.getElementById('billing');
    const toggleBtn = document.getElementById('modeToggleBtn');
    const title = document.getElementById('billingTitle');
    const laborSection = document.querySelector('.labor-input-row');
    const paymentSection = document.querySelector('.payment-details');
    const totalLabel = document.querySelector('.bill-totals .total-row span');
    const grandTotalLabel = document.querySelector('.grand-total span');
    const printBtn = document.getElementById('printBillBtn');
    const saveBtn = document.getElementById('saveBillBtn');
    
    if (transactionMode === 'sale') {
        // Sale mode
        billingTab.classList.remove('purchase-theme');
        billingTab.classList.add('sale-theme');
        toggleBtn.textContent = '📦 Switch to Purchase';
        toggleBtn.classList.add('sale-mode');
        title.textContent = 'Sale Entry';
        title.style.color = '#28a745';
        
        // Hide labor charges for sales
        if (laborSection) laborSection.style.display = 'none';
        
        totalLabel.textContent = 'Sale Total:';
        grandTotalLabel.textContent = 'Total Receivable:';
        
        // Update payment row label
        const paymentTotalSpan = document.querySelector('.payment-total span');
        if (paymentTotalSpan) {
            paymentTotalSpan.textContent = 'Total Received:';
        }
        
        // Update buttons
        if (printBtn) {
            printBtn.textContent = 'Print Sale';
            printBtn.classList.remove('print-purchase-btn');
            printBtn.classList.add('print-sale-btn');
        }
        if (saveBtn) {
            saveBtn.textContent = 'Save Sale';
            saveBtn.classList.remove('save-purchase-btn');
            saveBtn.classList.add('save-sale-btn');
        }
        
    } else {
        // Purchase mode
        billingTab.classList.remove('sale-theme');
        billingTab.classList.add('purchase-theme');
        toggleBtn.textContent = '💰 Switch to Sale';
        toggleBtn.classList.remove('sale-mode');
        title.textContent = 'Purchase Entry';
        title.style.color = '#007bff';
        
        // Show labor charges for purchases
        if (laborSection) laborSection.style.display = 'flex';
        
        totalLabel.textContent = 'Purchase Total:';
        grandTotalLabel.textContent = 'Total Payable:';
        
        // Update payment row label
        const paymentTotalSpan = document.querySelector('.payment-total span');
        if (paymentTotalSpan) {
            paymentTotalSpan.textContent = 'Total Paid:';
        }
        
        // Update buttons
        if (printBtn) {
            printBtn.textContent = 'Print Purchase';
            printBtn.classList.remove('print-sale-btn');
            printBtn.classList.add('print-purchase-btn');
        }
        if (saveBtn) {
            saveBtn.textContent = 'Save Purchase';
            saveBtn.classList.remove('save-sale-btn');
            saveBtn.classList.add('save-purchase-btn');
        }
    }
}

// -------------------- SETTINGS --------------------
function loadSettings() {
    document.getElementById('settingHeavyWeight').value = settings.heavyWeightThreshold;
    document.getElementById('settingLaborRate').value = settings.laborRate;
    document.getElementById('settingAutoLabor').checked = settings.autoLaborEnabled;
    document.getElementById('settingShowHindi').checked = settings.showHindi || false;
}

function saveSettings() {
    settings.heavyWeightThreshold = Number(document.getElementById('settingHeavyWeight').value) || 30;
    settings.laborRate = Number(document.getElementById('settingLaborRate').value) || 6;
    settings.autoLaborEnabled = document.getElementById('settingAutoLabor').checked;
    settings.showHindi = document.getElementById('settingShowHindi').checked;
    
    localStorage.setItem('settings', JSON.stringify(settings));
    
    // Re-render items to show/hide Hindi names
    renderItems();
    loadItemsDropdown();
}

async function clearAllData() {
    const confirmed = await showModal(
        'Are you sure you want to delete ALL data? This cannot be undone!',
        'Clear All Data',
        true
    );
    
    if (confirmed) {
        localStorage.clear();
        location.reload();
    }
}

// -------------------- INIT --------------------
document.addEventListener('DOMContentLoaded', function() {
    renderItems();
    loadItemsDropdown();
    loadSettings();
    updateModeUI(); // Initialize with purchase theme
    
    // Set today's date as default for custom filter
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('dateTo')) {
        document.getElementById('dateTo').value = today;
    }
    
    // Set billing as default active nav item
    const billingNavLink = document.querySelector('.nav-menu a[onclick*="billing"]');
    if (billingNavLink) {
        billingNavLink.classList.add("active");
    }
});
