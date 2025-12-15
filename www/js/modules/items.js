// -------------------- ITEMS & RATES MANAGEMENT --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';

const ItemsManager = {
    // Debounce timers for item updates
    updateTimers: {},

    // Render items list
    renderItems() {
        const container = document.getElementById('itemsList');
        if (!container) return;
        
        container.innerHTML = '';
        
        AppState.items.forEach((item, index) => {
            // Initialize rates arrays if they don't exist
            if (!item.rates) item.rates = [];
            if (!item.saleRates) item.saleRates = [];
            
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            
            // Build purchase rates HTML
            const purchaseRatesHTML = item.rates.map((rate, rateIndex) => `
                <div class="rate-group">
                    <input type="number" class="rate-input purchase" 
                           value="${rate}" 
                           oninput="window.app.items.updateRate(${index}, ${rateIndex}, this.value)"
                           placeholder="Rate">
                    <button class="delete-rate" onclick="window.app.items.deleteRate(${index}, ${rateIndex})">×</button>
                </div>
            `).join('');
            
            // Build sale rates HTML
            const saleRatesHTML = item.saleRates.map((rate, rateIndex) => `
                <div class="rate-group">
                    <input type="number" class="rate-input sale" 
                           value="${rate}" 
                           oninput="window.app.items.updateSaleRate(${index}, ${rateIndex}, this.value)"
                           placeholder="Rate">
                    <button class="delete-rate" onclick="window.app.items.deleteSaleRate(${index}, ${rateIndex})">×</button>
                </div>
            `).join('');
            
            itemCard.innerHTML = `
                <div class="item-header">
                    <input type="text" class="item-name-input" 
                           value="${item.name}" 
                           oninput="window.app.items.updateName(${index}, this.value)"
                           placeholder="Enter item name (English)">
                    <button class="delete-item-btn" onclick="window.app.items.deleteItem(${index})">Delete</button>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 13px; font-weight: 600; color: #666; margin-bottom: 4px; display: block;">Hindi Name:</label>
                    <input type="text" 
                           value="${item.hindiName || ''}" 
                           oninput="window.app.items.updateHindiName(${index}, this.value)"
                           placeholder="हिंदी नाम"
                           style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px; font-size: 15px;">
                </div>
                <div class="item-row">
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 14px; font-weight: 600; color: #007bff; margin-bottom: 8px; display: block;">Purchase Rates (₹/kg):</label>
                        <div class="rates-container">${purchaseRatesHTML}<button class="add-rate-plus purchase" onclick="window.app.items.addRate(${index})">+</button></div>
                    </div>
                    <div>
                        <label style="font-size: 14px; font-weight: 600; color: #28a745; margin-bottom: 8px; display: block;">Sale Rates (₹/kg):</label>
                        <div class="rates-container">${saleRatesHTML}<button class="add-rate-plus sale" onclick="window.app.items.addSaleRate(${index})">+</button></div>
                    </div>
                </div>
            `;
            
            container.appendChild(itemCard);
        });
    },

    // Add new item
    async addItem() {
        const newItem = {
            name: '',
            hindiName: '',
            rates: [],
            saleRates: []
        };
        
        UIManager.showLoading();
        try {
            const savedItem = await FirebaseService.saveItem(newItem);
            AppState.items.push(savedItem);
            this.renderItems();
            UIManager.hideLoading();
            UIManager.showToast('Item added');
        } catch (error) {
            console.error('Error adding item:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to add item');
        }
    },

    // Update item name (AUTO-SAVE with debounce)
    updateItemName(index, value) {
        clearTimeout(this.updateTimers[`name_${index}`]);
        AppState.items[index].name = value;
        
        this.updateTimers[`name_${index}`] = setTimeout(async () => {
            try {
                await FirebaseService.saveItem(AppState.items[index]);
            } catch (error) {
                console.error('Error updating item name:', error);
            }
        }, 500);
    },

    // Update item Hindi name (AUTO-SAVE with debounce)
    updateItemHindiName(index, value) {
        clearTimeout(this.updateTimers[`hindi_${index}`]);
        AppState.items[index].hindiName = value;
        
        this.updateTimers[`hindi_${index}`] = setTimeout(async () => {
            try {
                await FirebaseService.saveItem(AppState.items[index]);
            } catch (error) {
                console.error('Error updating Hindi name:', error);
            }
        }, 500);
    },

    // Add purchase rate
    async addRate(index) {
        if (!AppState.items[index].rates) {
            AppState.items[index].rates = [];
        }
        AppState.items[index].rates.push('');
        await FirebaseService.saveItem(AppState.items[index]);
        this.renderItems();
    },

    // Update purchase rate (AUTO-SAVE with debounce)
    updateRate(itemIndex, rateIndex, value) {
        clearTimeout(this.updateTimers[`rate_${itemIndex}_${rateIndex}`]);
        AppState.items[itemIndex].rates[rateIndex] = Number(value);
        
        this.updateTimers[`rate_${itemIndex}_${rateIndex}`] = setTimeout(async () => {
            try {
                await FirebaseService.saveItem(AppState.items[itemIndex]);
            } catch (error) {
                console.error('Error updating rate:', error);
            }
        }, 500);
    },

    // Delete purchase rate
    async deleteRate(itemIndex, rateIndex) {
        AppState.items[itemIndex].rates.splice(rateIndex, 1);
        await FirebaseService.saveItem(AppState.items[itemIndex]);
        this.renderItems();
    },

    // Add sale rate
    async addSaleRate(index) {
        if (!AppState.items[index].saleRates) {
            AppState.items[index].saleRates = [];
        }
        AppState.items[index].saleRates.push('');
        await FirebaseService.saveItem(AppState.items[index]);
        this.renderItems();
    },

    // Update sale rate (AUTO-SAVE with debounce)
    updateSaleRate(itemIndex, rateIndex, value) {
        clearTimeout(this.updateTimers[`salerate_${itemIndex}_${rateIndex}`]);
        if (!AppState.items[itemIndex].saleRates) {
            AppState.items[itemIndex].saleRates = [];
        }
        AppState.items[itemIndex].saleRates[rateIndex] = Number(value);
        
        this.updateTimers[`salerate_${itemIndex}_${rateIndex}`] = setTimeout(async () => {
            try {
                await FirebaseService.saveItem(AppState.items[itemIndex]);
            } catch (error) {
                console.error('Error updating sale rate:', error);
            }
        }, 500);
    },

    // Delete sale rate
    async deleteSaleRate(itemIndex, rateIndex) {
        if (AppState.items[itemIndex].saleRates) {
            AppState.items[itemIndex].saleRates.splice(rateIndex, 1);
            await FirebaseService.saveItem(AppState.items[itemIndex]);
            this.renderItems();
        }
    },

    // Delete item
    async deleteItem(index) {
        const confirmed = await UIManager.showModal(
            `Delete "${AppState.items[index].name}"?`,
            'Confirm Delete',
            true
        );
        
        if (!confirmed) return;
        
        UIManager.showLoading();
        try {
            await FirebaseService.deleteItem(AppState.items[index].id);
            AppState.items.splice(index, 1);
            this.renderItems();
            UIManager.hideLoading();
            UIManager.showToast('Item deleted');
        } catch (error) {
            console.error('Error deleting item:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to delete item');
        }
    },

    // Export items to Excel
    async exportToExcel() {
        try {
            const workbook = XLSX.utils.book_new();
            
            const data = AppState.items.map(item => ({
                'Item Name': item.name,
                'Hindi Name': item.hindiName || '',
                'Purchase Rates': (item.rates || []).join(', '),
                'Sale Rates': (item.saleRates || []).join(', ')
            }));
            
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Items');
            
            XLSX.writeFile(workbook, `items_${new Date().toISOString().split('T')[0]}.xlsx`);
            UIManager.showToast('Items exported successfully!');
        } catch (error) {
            console.error('Export error:', error);
            UIManager.showToast('Failed to export items');
        }
    },

    // Import items from Excel
    async importFromExcel(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const confirmed = await UIManager.showModal(
            'This will delete ALL existing items and replace them with items from the Excel file. Continue?',
            'Confirm Import',
            true
        );
        
        if (!confirmed) {
            event.target.value = '';
            return;
        }
        
        UIManager.showLoading();
        
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            // Delete all existing items
            for (const item of AppState.items) {
                await FirebaseService.deleteItem(item.id);
            }
            AppState.items = [];
            
            // Import new items
            let imported = 0;
            
            for (const row of jsonData) {
                const itemName = row['Item Name']?.trim();
                if (!itemName) continue;
                
                const itemData = {
                    name: itemName,
                    hindiName: row['Hindi Name'] || '',
                    rates: row['Purchase Rates'] ? 
                        row['Purchase Rates'].toString().split(',').map(r => parseFloat(r.trim()) || 0).filter(r => r > 0) : [],
                    saleRates: row['Sale Rates'] ? 
                        row['Sale Rates'].toString().split(',').map(r => parseFloat(r.trim()) || 0).filter(r => r > 0) : []
                };
                
                const savedItem = await FirebaseService.saveItem(itemData);
                AppState.items.push(savedItem);
                imported++;
            }
            
            this.renderItems();
            UIManager.hideLoading();
            UIManager.showToast(`Import complete! ${imported} items imported`);
            
            event.target.value = '';
        } catch (error) {
            console.error('Import error:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to import items: ' + error.message);
        }
    },

    // Render items table view
    renderItemsTable() {
        const tbody = document.getElementById('itemsViewTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        AppState.items.forEach((item) => {
            // Determine which name to display based on settings
            const displayName = (AppState.settings.showHindi && item.hindiName) 
                ? item.hindiName 
                : item.name;
            
            // Format purchase rates
            const purchaseRates = item.rates && item.rates.length > 0 
                ? item.rates.map(r => `${r}`).join(', ') 
                : '-';
            
            // Format sale rates
            const saleRates = item.saleRates && item.saleRates.length > 0 
                ? item.saleRates.map(r => `${r}`).join(', ') 
                : '-';
            
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';
            row.innerHTML = `
                <td style="padding: 12px; font-weight: 500;">${displayName || item.name || '-'}</td>
                <td style="padding: 12px; color: #666;">${purchaseRates}</td>
                <td style="padding: 12px; color: #666;">${saleRates}</td>
            `;
            tbody.appendChild(row);
        });
        
        if (AppState.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="padding: 24px; text-align: center; color: #999;">No items found</td></tr>';
        }
    }
};

// Export ItemsManager
export { ItemsManager };
