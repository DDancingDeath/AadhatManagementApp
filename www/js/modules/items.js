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
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            
            let purchaseRatesHTML = '';
            if (item.purchaseRates && item.purchaseRates.length > 0) {
                purchaseRatesHTML = item.purchaseRates.map((rate, rateIndex) => `
                    <div class="rate-group">
                        <input type="number" class="rate-input purchase" 
                               value="${rate}" 
                               onchange="ItemsManager.updateRate(${index}, ${rateIndex}, this.value)"
                               placeholder="Purchase Rate">
                        <button class="delete-rate" onclick="ItemsManager.deleteRate(${index}, ${rateIndex})">×</button>
                    </div>
                `).join('');
            }
            
            let saleRatesHTML = '';
            if (item.saleRates && item.saleRates.length > 0) {
                saleRatesHTML = item.saleRates.map((rate, rateIndex) => `
                    <div class="rate-group">
                        <input type="number" class="rate-input sale" 
                               value="${rate}" 
                               onchange="ItemsManager.updateSaleRate(${index}, ${rateIndex}, this.value)"
                               placeholder="Sale Rate">
                        <button class="delete-rate" onclick="ItemsManager.deleteSaleRate(${index}, ${rateIndex})">×</button>
                    </div>
                `).join('');
            }
            
            itemCard.innerHTML = `
                <div class="item-header">
                    <input type="text" class="item-name-input" 
                           value="${item.name}" 
                           onchange="ItemsManager.updateItemName(${index}, this.value)"
                           placeholder="Item Name">
                    ${AppState.settings.showHindi ? `
                        <input type="text" class="item-name-input" 
                               value="${item.hindiName || ''}" 
                               onchange="ItemsManager.updateItemHindiName(${index}, this.value)"
                               placeholder="Hindi Name"
                               style="margin-top: 8px;">
                    ` : ''}
                    <button class="delete-item-btn" onclick="ItemsManager.deleteItem(${index})">Delete</button>
                </div>
                <div class="item-row">
                    <div class="rates-container">
                        <h4>Purchase Rates:</h4>
                        ${purchaseRatesHTML}
                        <button class="add-rate-plus purchase" onclick="ItemsManager.addRate(${index})">+ Add Purchase Rate</button>
                    </div>
                    <div class="rates-container">
                        <h4>Sale Rates:</h4>
                        ${saleRatesHTML}
                        <button class="add-rate-plus sale" onclick="ItemsManager.addSaleRate(${index})">+ Add Sale Rate</button>
                    </div>
                </div>
            `;
            
            container.appendChild(itemCard);
        });
    },

    // Add new item
    async addItem() {
        const newItem = {
            name: 'New Item',
            hindiName: '',
            purchaseRates: [0],
            saleRates: [0]
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
        AppState.items[index].purchaseRates.push(0);
        await FirebaseService.saveItem(AppState.items[index]);
        this.renderItems();
    },

    // Update purchase rate (AUTO-SAVE with debounce)
    updateRate(itemIndex, rateIndex, value) {
        clearTimeout(this.updateTimers[`rate_${itemIndex}_${rateIndex}`]);
        AppState.items[itemIndex].purchaseRates[rateIndex] = parseFloat(value) || 0;
        
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
        AppState.items[itemIndex].purchaseRates.splice(rateIndex, 1);
        await FirebaseService.saveItem(AppState.items[itemIndex]);
        this.renderItems();
    },

    // Add sale rate
    async addSaleRate(index) {
        if (!AppState.items[index].saleRates) {
            AppState.items[index].saleRates = [];
        }
        AppState.items[index].saleRates.push(0);
        await FirebaseService.saveItem(AppState.items[index]);
        this.renderItems();
    },

    // Update sale rate (AUTO-SAVE with debounce)
    updateSaleRate(itemIndex, rateIndex, value) {
        clearTimeout(this.updateTimers[`salerate_${itemIndex}_${rateIndex}`]);
        if (!AppState.items[itemIndex].saleRates) {
            AppState.items[itemIndex].saleRates = [];
        }
        AppState.items[itemIndex].saleRates[rateIndex] = parseFloat(value) || 0;
        
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
                'Purchase Rates': (item.purchaseRates || []).join(', '),
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
        
        UIManager.showLoading();
        
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            let imported = 0;
            let updated = 0;
            
            for (const row of jsonData) {
                const itemName = row['Item Name']?.trim();
                if (!itemName) continue;
                
                const existingItem = AppState.items.find(item => item.name.toLowerCase() === itemName.toLowerCase());
                
                const itemData = {
                    name: itemName,
                    hindiName: row['Hindi Name'] || '',
                    purchaseRates: row['Purchase Rates'] ? 
                        row['Purchase Rates'].toString().split(',').map(r => parseFloat(r.trim()) || 0) : [0],
                    saleRates: row['Sale Rates'] ? 
                        row['Sale Rates'].toString().split(',').map(r => parseFloat(r.trim()) || 0) : [0]
                };
                
                if (existingItem) {
                    itemData.id = existingItem.id;
                    await FirebaseService.saveItem(itemData);
                    Object.assign(existingItem, itemData);
                    updated++;
                } else {
                    const savedItem = await FirebaseService.saveItem(itemData);
                    AppState.items.push(savedItem);
                    imported++;
                }
            }
            
            this.renderItems();
            UIManager.hideLoading();
            UIManager.showToast(`Import complete! ${imported} new items, ${updated} updated`);
            
            event.target.value = '';
        } catch (error) {
            console.error('Import error:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to import items: ' + error.message);
        }
    }
};

// Export ItemsManager
export { ItemsManager };
