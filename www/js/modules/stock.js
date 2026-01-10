/**
 * @fileoverview Stock Management Module
 * Handles inventory stock tracking, calculation, and adjustments
 * Calculates stock from purchase/sale history and displays current levels
 * @module modules/stock
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { Helpers } from '../utils/helpers.js';

/**
 * Stock Manager - Manages inventory stock operations
 * @class StockManager
 */
export class StockManager {
    /**
     * Update stock for a specific item
     * Adds quantity to existing stock or creates new entry
     * @param {string} itemName - Name of the item
     * @param {number} quantity - Quantity to add (can be negative)
     * @param {number} [rate] - Optional rate per kg
     */
    static updateStock(itemName, quantity, rate) {
        if (!AppState.stock[itemName]) {
            AppState.stock[itemName] = { quantity: 0, rate: rate || 0 };
        }
        AppState.stock[itemName].quantity += quantity;
        if (rate) {
            AppState.stock[itemName].rate = rate;
        }
    }

    /**
     * Render current stock levels with loading indicator
     * Calculates stock from Firebase and displays in the UI
     * @async
     * @returns {Promise<void>}
     */
    static async renderStock() {
        const container = document.getElementById("stockList");
        if (!container) return;

        try {
            // Use withLoading for the Firebase operation
            const stock = await UIManager.withLoading(async () => {
                return await FirebaseService.calculateStock();
            });
            AppState.stock = stock;

            if (Object.keys(stock).length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No stock data available</p>';
                return;
            }

            container.innerHTML = "";
            
            // Consolidate stock by itemId to prevent duplicates
            const consolidatedStock = {};
            Object.keys(stock).forEach(key => {
            // Key could be itemId or old name-based key
            const item = AppState.items.find(i => i.id === key || i.name === key || i.hindiName === key);
            if (!item) return;
            
            const itemId = item.id;
            if (!consolidatedStock[itemId]) {
                consolidatedStock[itemId] = {
                    itemId: item.id,
                    name: item.name,
                    hindiName: item.hindiName,
                    quantity: 0,
                    totalValue: 0,
                    rate: 0
                };
            }
            
            consolidatedStock[itemId].quantity += stock[key].quantity || 0;
            consolidatedStock[itemId].totalValue += (stock[key].quantity || 0) * (stock[key].rate || 0);
        });
        
        // Calculate weighted average rates
        Object.values(consolidatedStock).forEach(item => {
            if (item.quantity > 0 && item.totalValue > 0) {
                item.rate = item.totalValue / item.quantity;
            }
            delete item.totalValue;
        });
        
        // Filter and sort
        const stockWithDetails = Object.values(consolidatedStock)
            .filter(item => item.quantity > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
        
        if (stockWithDetails.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No stock available</p>';
            return;
        }
        
        // Check if user is staff (show limited quantity info for items > 100kg)
        const isStaff = AppState.userRole === 'staff';
        
        stockWithDetails.forEach(item => {
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            const div = document.createElement("div");
            div.className = "stock-item";
            
            // For staff: show "Available" if quantity > 100, otherwise show actual quantity
            // Rate is always shown, value is hidden when showing "Available"
            const showLimitedQty = isStaff && item.quantity > 100;
            const quantityDisplay = showLimitedQty ? 'Available' : `${item.quantity.toFixed(1)} kg`;
            const valueDisplay = showLimitedQty ? '' : `<div style="color: #666; font-size: 12px; margin-top: 4px;">≈ ₹${Math.round(item.quantity * (item.rate || 0))}</div>`;
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; font-size: 15px;">${displayName}</div>
                        <div style="color: #666; font-size: 13px; margin-top: 4px;">
                            Rate: ₹${item.rate ? item.rate.toFixed(2) : '0.00'}/kg
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 18px; font-weight: 700; color: #28a745;">
                            ${quantityDisplay}
                        </div>
                        ${valueDisplay}
                    </div>
                </div>
            `;
            
            container.appendChild(div);
            });
        } catch (error) {
            console.error('Error loading stock:', error);
            container.innerHTML = '<p style="text-align: center; color: #dc3545; margin-top: 40px;">Failed to load stock data</p>';
        }
    }

    /**
     * Search and filter stock items by name
     * Hides non-matching items and shows "no results" message
     */
    static searchStock() {
        const searchInput = document.getElementById("stockSearchInput");
        const searchTerm = searchInput?.value.toLowerCase().trim() || '';
        const container = document.getElementById("stockList");
        
        if (!container) return;
        
        // Get all stock items
        const stockItems = container.querySelectorAll('.stock-item');
        
        if (stockItems.length === 0) {
            // No items rendered yet, render first
            this.renderStock();
            return;
        }
        
        let visibleCount = 0;
        
        stockItems.forEach(item => {
            const itemText = item.textContent.toLowerCase();
            if (itemText.includes(searchTerm)) {
                item.style.display = '';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        // Show "no results" message if nothing matches
        let noResultsMsg = container.querySelector('.no-results-message');
        if (visibleCount === 0 && searchTerm !== '') {
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('p');
                noResultsMsg.className = 'no-results-message';
                noResultsMsg.style.cssText = 'text-align: center; color: #888; margin-top: 40px;';
                noResultsMsg.textContent = 'No items found';
                container.appendChild(noResultsMsg);
            }
        } else if (noResultsMsg) {
            noResultsMsg.remove();
        }
    }

    /**
     * Filter between stock view tabs (current stock vs adjustments)
     * @param {'current'|'adjustment'} section - Section to display
     * @param {Event} [event] - Optional click event for button styling
     */
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

    /**
     * Load items into the stock adjustment dropdown
     * Populates select element with all inventory items
     */
    static loadAdjustItemsDropdown() {
        const select = document.getElementById("adjustItem");
        if (!select) return;

        select.innerHTML = '<option value="">Select item</option>';
        AppState.items.forEach(item => {
            const option = document.createElement("option");
            option.value = item.name;
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            option.textContent = displayName;
            select.appendChild(option);
        });
    }

    static loadAdjustItemStock() {
        const itemName = document.getElementById("adjustItem")?.value;
        const display = document.getElementById("currentStockDisplay");
        const avgRateDisplay = document.getElementById("avgRateDisplay");
        const avgRateValue = document.getElementById("avgRateValue");
        
        if (!display) return;

        if (!itemName || itemName === '') {
            display.textContent = "";
            if (avgRateDisplay) avgRateDisplay.style.display = "none";
            return;
        }

        // Find the item to get both English and Hindi names
        const item = AppState.items.find(i => i.name === itemName);
        if (!item) {
            display.textContent = "0.00";
            if (avgRateDisplay) avgRateDisplay.style.display = "none";
            return;
        }

        // Check stock using itemId (primary), name, and Hindi name (legacy)
        let quantity = 0;
        let totalValue = 0;
        
        // Check by itemId first (most reliable)
        if (item.id && AppState.stock[item.id]) {
            const stockData = AppState.stock[item.id];
            quantity += stockData.quantity || 0;
            totalValue += (stockData.quantity || 0) * (stockData.rate || 0);
        }
        
        // Also check by name (for legacy data)
        if (AppState.stock[item.name]) {
            const stockData = AppState.stock[item.name];
            quantity += stockData.quantity || 0;
            totalValue += (stockData.quantity || 0) * (stockData.rate || 0);
        }
        
        // Also check by Hindi name (for legacy data)
        if (item.hindiName && AppState.stock[item.hindiName]) {
            const stockData = AppState.stock[item.hindiName];
            quantity += stockData.quantity || 0;
            totalValue += (stockData.quantity || 0) * (stockData.rate || 0);
        }
        
        display.textContent = quantity.toFixed(1);
        
        // Calculate and display average rate
        if (avgRateDisplay && avgRateValue) {
            if (quantity > 0 && totalValue > 0) {
                const avgRate = totalValue / quantity;
                avgRateValue.textContent = `₹${avgRate.toFixed(2)}/kg`;
                avgRateDisplay.style.display = "block";
            } else {
                avgRateDisplay.style.display = "none";
            }
        }
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
        const itemName = Helpers.getInputText('adjustItem');
        const adjustType = Helpers.getInputText('adjustType');
        const quantity = Helpers.getInputNumber('adjustQuantity');
        const rate = Helpers.getInputNumber('adjustRate');
        const reason = Helpers.getInputText('adjustReason');

        if (!itemName) {
            UIManager.showToast("Please select an item");
            return;
        }

        if (isNaN(quantity) || quantity <= 0) {
            UIManager.showToast("Please enter a valid quantity");
            return;
        }

        // Find item to get itemId
        const item = AppState.items.find(i => i.name === itemName);
        
        // Calculate current stock from all possible keys (itemId, name, hindiName)
        let currentStock = 0;
        if (item?.id && AppState.stock[item.id]) {
            currentStock += AppState.stock[item.id].quantity || 0;
        }
        if (AppState.stock[itemName]) {
            currentStock += AppState.stock[itemName].quantity || 0;
        }
        if (item?.hindiName && AppState.stock[item.hindiName]) {
            currentStock += AppState.stock[item.hindiName].quantity || 0;
        }
        
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
            itemId: item?.id || null,
            itemName,
            adjustType,
            quantity,
            rate: rate || 0,
            previousStock: currentStock,
            newStock,
            reason,
            date: Helpers.getCurrentDateTime(),
            timestamp: Date.now(),
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
            document.getElementById("adjustRate").value = "0";
            document.getElementById("adjustReason").value = "";
            
            // Recalculate stock from Firebase data to ensure accuracy
            const freshStock = await FirebaseService.calculateStock();
            AppState.stock = freshStock;
            
            UIManager.showToast("Stock adjustment applied successfully");
            this.renderAdjustmentHistory();
            this.loadAdjustItemStock();
            
            // Refresh current stock tab if it's visible
            if (document.getElementById('stockCurrentSection')?.classList.contains('active')) {
                this.renderStock();
            }
        } catch (error) {
            console.error("Stock adjustment error:", error);
            UIManager.showToast("Failed to apply adjustment");
        }
    }

    static async renderAdjustmentHistory() {
        const container = document.getElementById("adjustmentHistory");
        if (!container) return;

        try {
            const adjustments = await FirebaseService.loadStockAdjustments();
            AppState.stockAdjustments = adjustments;
            
            // Sort by timestamp/date (newest first)
            adjustments.sort((a, b) => {
                const timeA = a.timestamp || new Date(a.date).getTime();
                const timeB = b.timestamp || new Date(b.date).getTime();
                return timeB - timeA;
            });

            if (adjustments.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 20px;">No adjustments yet</p>';
                return;
            }

            container.innerHTML = "";
            
            adjustments.forEach(adj => {
                const div = document.createElement("div");
                div.className = "history-item";
                
                const typeLabels = { add: 'Added', remove: 'Removed', set: 'Set to' };
                const typeColors = { add: '#28a745', remove: '#dc3545', set: '#007bff' };
                
                // Handle legacy data that might not have adjustType or quantity
                const adjustType = adj.adjustType || 'set';
                const quantity = adj.quantity !== undefined ? adj.quantity : 'Unknown';
                const typeLabel = typeLabels[adjustType] || 'Adjusted';
                const typeColor = typeColors[adjustType] || '#6c757d';
                
                // Find item to show in correct language
                const item = AppState.items.find(i => i.id === adj.itemId || i.name === adj.itemName);
                const displayName = (AppState.settings.showHindi && item?.hindiName) ? item.hindiName : (item?.name || adj.itemName || 'Unknown Item');
                
                // Use adjustment rate if available, otherwise fall back to current stock rate
                const adjustmentRate = adj.rate || 0;
                const stockKey = adj.itemId || adj.itemName;
                const currentStockRate = AppState.stock[stockKey]?.rate || 0;
                const displayRate = adjustmentRate > 0 ? adjustmentRate : currentStockRate;
                
                // Calculate value impact if rate is available
                const valueImpact = (quantity !== 'Unknown' && displayRate > 0) ? quantity * displayRate : null;
                
                div.innerHTML = `
                    <div class="history-header">
                        <strong>${displayName}</strong>
                        <span style="color: ${typeColor}; font-weight: 600;">
                            ${typeLabel} ${quantity !== 'Unknown' ? quantity + ' kg' : ''}
                        </span>
                    </div>
                    <div class="history-date">${adj.date || 'Unknown date'}${adj.createdByName ? ` • By: ${adj.createdByName}` : ''}</div>
                    <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                        ${displayRate > 0 ? `<div style="font-size: 13px; color: #666; margin-bottom: 4px;">Rate: ₹${displayRate.toFixed(2)}/kg${valueImpact ? ` • Value: ₹${Math.round(valueImpact)}` : ''}</div>` : ''}
                        <div style="font-size: 13px; color: #666;">
                            ${(adj.previousStock || 0).toFixed(1)} kg → ${(adj.newStock || 0).toFixed(1)} kg
                        </div>
                        ${adj.reason ? `<div style="font-size: 13px; color: #666; margin-top: 4px;"><em>${adj.reason}</em></div>` : '<div style="font-size: 13px; color: #999; margin-top: 4px;"><em>No reason provided</em></div>'}
                    </div>
                `;
                
                container.appendChild(div);
            });
        } catch (error) {
            console.error('Error loading adjustment history:', error);
            container.innerHTML = '<p style="text-align: center; color: #dc3545; margin-top: 20px;">Failed to load history</p>';
        }
    }
}
