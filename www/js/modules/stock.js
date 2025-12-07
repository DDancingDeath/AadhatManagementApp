// Stock Management Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';

export class StockManager {
    static updateStock(itemName, quantity, rate) {
        if (!AppState.stock[itemName]) {
            AppState.stock[itemName] = { quantity: 0, rate: rate || 0 };
        }
        AppState.stock[itemName].quantity += quantity;
        if (rate) {
            AppState.stock[itemName].rate = rate;
        }
    }

    static async renderStock() {
        const container = document.getElementById("stockList");
        if (!container) return;

        const stock = await FirebaseService.calculateStock();
        AppState.stock = stock;

        if (Object.keys(stock).length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No stock data available</p>';
            return;
        }

        container.innerHTML = "";
        
        // Filter to show only items with quantity > 0
        const availableStock = Object.keys(stock)
            .filter(itemName => stock[itemName].quantity > 0)
            .sort();
        
        if (availableStock.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No stock available</p>';
            return;
        }
        
        availableStock.forEach(itemName => {
            const item = stock[itemName];
            const div = document.createElement("div");
            div.className = "stock-item";
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; font-size: 15px;">${itemName}</div>
                        <div style="color: #666; font-size: 13px; margin-top: 4px;">
                            Rate: ₹${item.rate ? item.rate.toFixed(2) : '0.00'}/kg
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 18px; font-weight: 700; color: #28a745;">
                            ${item.quantity.toFixed(2)} kg
                        </div>
                        <div style="color: #666; font-size: 12px; margin-top: 4px;">
                            ≈ ₹${(item.quantity * (item.rate || 0)).toFixed(2)}
                        </div>
                    </div>
                </div>
            `;
            
            container.appendChild(div);
        });
    }

    static filterStockTab(section, event) {
        const sections = {
            current: document.getElementById("currentStockSection"),
            adjustment: document.getElementById("stockAdjustmentSection")
        };

        Object.values(sections).forEach(s => s && (s.style.display = 'none'));
        if (sections[section]) sections[section].style.display = 'block';

        document.querySelectorAll('#stock .filter-btn').forEach(btn => btn.classList.remove('active'));
        if (event?.target) {
            event.target.classList.add('active');
        } else {
            // If no event (programmatic call), set the active button based on section
            const btnIndex = section === 'current' ? 0 : 1;
            const buttons = document.querySelectorAll('#stock .filter-btn');
            if (buttons[btnIndex]) buttons[btnIndex].classList.add('active');
        }

        if (section === 'current') {
            this.renderStock();
        } else if (section === 'adjustment') {
            this.loadAdjustItemsDropdown();
            this.renderAdjustmentHistory();
        }
    }

    static loadAdjustItemsDropdown() {
        const select = document.getElementById("adjustItem");
        if (!select) return;

        select.innerHTML = '<option value="">Select item</option>';
        AppState.items.forEach(item => {
            const option = document.createElement("option");
            option.value = item.name;
            option.textContent = item.name;
            select.appendChild(option);
        });
    }

    static loadAdjustItemStock() {
        const itemName = document.getElementById("adjustItem")?.value;
        const display = document.getElementById("currentStockDisplay");
        
        if (!display) return;

        if (!itemName) {
            display.textContent = "-";
            return;
        }

        const currentStock = AppState.stock[itemName]?.quantity || 0;
        display.textContent = currentStock.toFixed(2);
    }

    static updateAdjustmentPlaceholder() {
        const adjustType = document.getElementById("adjustType")?.value;
        const quantityInput = document.getElementById("adjustQuantity");
        
        if (!quantityInput) return;
        
        switch (adjustType) {
            case 'add':
                quantityInput.placeholder = 'Quantity to add';
                break;
            case 'remove':
                quantityInput.placeholder = 'Quantity to remove';
                break;
            case 'set':
                quantityInput.placeholder = 'New stock quantity';
                break;
        }
    }

    static async applyStockAdjustment() {
        const itemName = document.getElementById("adjustItem")?.value;
        const adjustType = document.getElementById("adjustType")?.value;
        const quantity = parseFloat(document.getElementById("adjustQuantity")?.value || 0);
        const reason = document.getElementById("adjustReason")?.value || "";

        if (!itemName) {
            UIManager.showToast("Please select an item");
            return;
        }

        if (isNaN(quantity) || quantity <= 0) {
            UIManager.showToast("Please enter a valid quantity");
            return;
        }

        const currentStock = AppState.stock[itemName]?.quantity || 0;
        let newStock = currentStock;

        switch (adjustType) {
            case 'add':
                newStock = currentStock + quantity;
                break;
            case 'remove':
                newStock = Math.max(0, currentStock - quantity);
                break;
            case 'set':
                newStock = quantity;
                break;
        }

        const adjustment = {
            itemName,
            adjustType,
            quantity,
            previousStock: currentStock,
            newStock,
            reason,
            date: new Date().toLocaleString('en-IN'),
            createdBy: AppState.currentUser?.uid || 'unknown',
            createdByName: AppState.userName || 'User'
        };

        try {
            await FirebaseService.saveStockAdjustment(adjustment);
            
            if (!AppState.stock[itemName]) {
                AppState.stock[itemName] = { quantity: 0, rate: 0 };
            }
            AppState.stock[itemName].quantity = newStock;

            document.getElementById("adjustQuantity").value = "";
            document.getElementById("adjustReason").value = "";
            
            UIManager.showToast("Stock adjustment applied successfully");
            this.renderAdjustmentHistory();
            this.loadAdjustItemStock();
        } catch (error) {
            console.error("Stock adjustment error:", error);
            UIManager.showToast("Failed to apply adjustment");
        }
    }

    static async renderAdjustmentHistory() {
        const container = document.getElementById("adjustmentHistory");
        if (!container) return;

        const adjustments = await FirebaseService.loadStockAdjustments();
        AppState.stockAdjustments = adjustments;

        if (adjustments.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 20px;">No adjustments yet</p>';
            return;
        }

        container.innerHTML = "";
        
        adjustments.slice().reverse().forEach(adj => {
            const div = document.createElement("div");
            div.className = "history-item";
            
            const typeLabels = { add: 'Added', remove: 'Removed', set: 'Set to' };
            const typeColors = { add: '#28a745', remove: '#dc3545', set: '#007bff' };
            
            // Handle legacy data that might not have adjustType or quantity
            const adjustType = adj.adjustType || 'set';
            const quantity = adj.quantity !== undefined ? adj.quantity : 'Unknown';
            const typeLabel = typeLabels[adjustType] || 'Adjusted';
            const typeColor = typeColors[adjustType] || '#6c757d';
            
            div.innerHTML = `
                <div class="history-header">
                    <strong>${adj.itemName || 'Unknown Item'}</strong>
                    <span style="color: ${typeColor}; font-weight: 600;">
                        ${typeLabel} ${quantity !== 'Unknown' ? quantity + ' kg' : ''}
                    </span>
                </div>
                <div class="history-date">${adj.date || 'Unknown date'}${adj.createdByName ? ` • By: ${adj.createdByName}` : ''}</div>
                <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                    <div style="font-size: 13px; color: #666;">
                        ${(adj.previousStock || 0).toFixed(2)} kg → ${(adj.newStock || 0).toFixed(2)} kg
                    </div>
                    ${adj.reason ? `<div style="font-size: 13px; color: #666; margin-top: 4px;"><em>${adj.reason}</em></div>` : '<div style="font-size: 13px; color: #999; margin-top: 4px;"><em>No reason provided</em></div>'}
                </div>
            `;
            
            container.appendChild(div);
        });
    }
}
