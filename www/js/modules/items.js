// -------------------- ITEMS & RATES MANAGEMENT --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';

const ItemsManager = {
    // Debounce timers for item updates
    updateTimers: {},
    
    // Modal state
    currentEditingItemIndex: null,
    modalRates: {
        purchase: [],
        wholesale: [],
        sale: []
    },

    // Render items list
    renderItems() {
        const container = document.getElementById('itemsList');
        if (!container) return;
        
        container.innerHTML = '';
        
        AppState.items.forEach((item, index) => {
            // Initialize rates arrays if they don't exist
            if (!item.rates) item.rates = [];
            if (!item.saleRates) item.saleRates = [];
            if (!item.wholesaleRates) item.wholesaleRates = [];
            
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
            
            // Build wholesale rates HTML
            const wholesaleRatesHTML = item.wholesaleRates.map((rate, rateIndex) => `
                <div class="rate-group">
                    <input type="number" class="rate-input wholesale" 
                           value="${rate}" 
                           oninput="window.app.items.updateWholesaleRate(${index}, ${rateIndex}, this.value)"
                           placeholder="Rate">
                    <button class="delete-rate" onclick="window.app.items.deleteWholesaleRate(${index}, ${rateIndex})">×</button>
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
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 14px; font-weight: 600; color: #ff6b6b; margin-bottom: 8px; display: block;">Wholesale Rates (₹/kg):</label>
                        <div class="rates-container">${wholesaleRatesHTML}<button class="add-rate-plus wholesale" onclick="window.app.items.addWholesaleRate(${index})">+</button></div>
                    </div>
                    <div>
                        <label style="font-size: 14px; font-weight: 600; color: #28a745; margin-bottom: 8px; display: block;">Retail Sale Rates (₹/kg):</label>
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

    // Add wholesale rate
    async addWholesaleRate(index) {
        if (!AppState.items[index].wholesaleRates) {
            AppState.items[index].wholesaleRates = [];
        }
        AppState.items[index].wholesaleRates.push('');
        await FirebaseService.saveItem(AppState.items[index]);
        this.renderItems();
    },

    // Update wholesale rate (AUTO-SAVE with debounce)
    updateWholesaleRate(itemIndex, rateIndex, value) {
        clearTimeout(this.updateTimers[`wholesalerate_${itemIndex}_${rateIndex}`]);
        if (!AppState.items[itemIndex].wholesaleRates) {
            AppState.items[itemIndex].wholesaleRates = [];
        }
        AppState.items[itemIndex].wholesaleRates[rateIndex] = Number(value);
        
        this.updateTimers[`wholesalerate_${itemIndex}_${rateIndex}`] = setTimeout(async () => {
            try {
                await FirebaseService.saveItem(AppState.items[itemIndex]);
            } catch (error) {
                console.error('Error updating wholesale rate:', error);
            }
        }, 500);
    },

    // Delete wholesale rate
    async deleteWholesaleRate(itemIndex, rateIndex) {
        if (AppState.items[itemIndex].wholesaleRates) {
            AppState.items[itemIndex].wholesaleRates.splice(rateIndex, 1);
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
                'Retail-Sale Rates': (item.saleRates || []).join(', '),
                'Wholesale Rates': (item.wholesaleRates || []).join(', ')
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
                
                // Helper function to parse rate strings - handles both "41,42" and "41, 42" formats
                const parseRates = (value) => {
                    if (!value) return [];
                    // Convert to string first (handles numbers like 4142 that should be "41,42")
                    const str = value.toString().trim();
                    // Split by comma and parse each rate
                    return str.split(',').map(r => {
                        const parsed = parseFloat(r.trim());
                        return isNaN(parsed) ? 0 : parsed;
                    }).filter(r => r > 0);
                };
                
                // Parse purchase rates
                const purchaseRates = parseRates(row['Purchase Rates']);
                
                // Parse sale rates - prioritize Retail-Sale Rates, fallback to Sale Rates
                let saleRates = [];
                if (row['Retail-Sale Rates']) {
                    saleRates = parseRates(row['Retail-Sale Rates']);
                } else if (row['Retail Sale Rates']) {
                    saleRates = parseRates(row['Retail Sale Rates']);
                } else if (row['Sale Rates']) {
                    // Backward compatibility: map old "Sale Rates" to saleRates (retail)
                    saleRates = parseRates(row['Sale Rates']);
                }
                
                // Parse wholesale rates (optional column)
                const wholesaleRates = parseRates(row['Wholesale Rates']);
                
                const itemData = {
                    name: itemName,
                    hindiName: row['Hindi Name'] || '',
                    rates: purchaseRates,
                    saleRates: saleRates,
                    wholesaleRates: wholesaleRates
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

    // Calculate item usage frequency from bills and sales
    calculateItemFrequency() {
        const frequency = {};
        
        // Count from purchase bills
        if (AppState.bills) {
            AppState.bills.forEach(bill => {
                if (bill.items) {
                    bill.items.forEach(billItem => {
                        const itemName = billItem.itemName || billItem.name;
                        frequency[itemName] = (frequency[itemName] || 0) + 1;
                    });
                }
            });
        }
        
        // Count from sales
        if (AppState.sales) {
            AppState.sales.forEach(sale => {
                if (sale.items) {
                    sale.items.forEach(saleItem => {
                        const itemName = saleItem.itemName || saleItem.name;
                        frequency[itemName] = (frequency[itemName] || 0) + 1;
                    });
                }
            });
        }
        
        return frequency;
    },

    // Render items table view
    renderItemsTable(searchQuery = '') {
        const tbody = document.getElementById('itemsViewTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        // Calculate frequency for sorting
        const frequency = this.calculateItemFrequency();
        
        // Filter items based on search query
        let filteredItems = AppState.items;
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filteredItems = AppState.items.filter(item => {
                const name = (item.name || '').toLowerCase();
                const hindiName = (item.hindiName || '').toLowerCase();
                return name.includes(query) || hindiName.includes(query);
            });
        }
        
        // Sort by frequency (most used first), then alphabetically
        const sortedItems = [...filteredItems].sort((a, b) => {
            const freqA = frequency[a.name] || 0;
            const freqB = frequency[b.name] || 0;
            
            if (freqB !== freqA) {
                return freqB - freqA; // Higher frequency first
            }
            return (a.name || '').localeCompare(b.name || ''); // Alphabetical fallback
        });
        
        sortedItems.forEach((item) => {
            // Determine which name to display based on settings
            const displayName = (AppState.settings.showHindi && item.hindiName) 
                ? item.hindiName 
                : item.name;
            
            // Format purchase rates
            const purchaseRates = item.rates && item.rates.length > 0 
                ? item.rates.map(r => `${r}`).join(', ') 
                : '-';
            
            // Format wholesale rates
            const wholesaleRates = item.wholesaleRates && item.wholesaleRates.length > 0 
                ? item.wholesaleRates.map(r => `${r}`).join(', ') 
                : '-';
            
            // Format sale rates
            const saleRates = item.saleRates && item.saleRates.length > 0 
                ? item.saleRates.map(r => `${r}`).join(', ') 
                : '-';
            
            const itemFrequency = frequency[item.name] || 0;
            
            const itemIndex = AppState.items.findIndex(i => i.id === item.id);
            
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #e5e7eb';
            row.style.cursor = 'pointer';
            row.style.transition = 'all 0.2s';
            row.onmouseenter = () => {
                row.style.background = '#f9fafb';
                row.style.transform = 'scale(1.01)';
                row.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
            };
            row.onmouseleave = () => {
                row.style.background = 'white';
                row.style.transform = 'scale(1)';
                row.style.boxShadow = 'none';
            };
            row.onclick = () => this.openEditModal(itemIndex);
            row.innerHTML = `
                <td style="padding: 16px; font-weight: 600; color: #1f2937; font-size: 15px; border-right: 1px solid #f3f4f6;">
                    ${displayName || item.name || '-'}
                    ${itemFrequency > 0 ? `<span style="margin-left: 8px; padding: 3px 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; font-size: 11px; font-weight: 600; box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);">${itemFrequency}</span>` : ''}
                </td>
                <td style="padding: 16px; color: #007bff; font-size: 14px; font-weight: 600; border-right: 1px solid #f3f4f6;">${purchaseRates}</td>
                <td style="padding: 16px; color: #28a745; font-size: 14px; font-weight: 600; border-right: 1px solid #f3f4f6;">${saleRates}</td>
                <td style="padding: 16px; color: #9333ea; font-size: 14px; font-weight: 600;">${wholesaleRates}</td>
            `;
            tbody.appendChild(row);
        });
        
        if (sortedItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 24px; text-align: center; color: #999;">No items found</td></tr>';
        }
    },
    
    // Open modal to add new item
    openAddModal() {
        this.currentEditingItemIndex = null;
        this.modalRates = { purchase: [], wholesale: [], sale: [] };
        
        document.getElementById('itemModalName').value = '';
        document.getElementById('itemModalHindiName').value = '';
        document.getElementById('itemModalContactPerson').value = '';
        document.getElementById('itemModalDeleteBtn').style.display = 'none';
        
        this.renderModalRates();
        document.getElementById('itemEditOverlay').style.display = 'flex';
    },
    
    // Open modal to edit existing item
    openEditModal(index) {
        this.currentEditingItemIndex = index;
        const item = AppState.items[index];
        
        document.getElementById('itemModalName').value = item.name || '';
        document.getElementById('itemModalHindiName').value = item.hindiName || '';
        document.getElementById('itemModalContactPerson').value = item.contactPerson || '';
        document.getElementById('itemModalDeleteBtn').style.display = 'block';
        
        this.modalRates = {
            purchase: [...(item.rates || [])],
            wholesale: [...(item.wholesaleRates || [])],
            sale: [...(item.saleRates || [])]
        };
        
        this.renderModalRates();
        document.getElementById('itemEditOverlay').style.display = 'flex';
    },
    
    // Render rates in modal
    renderModalRates() {
        // Render purchase rates
        const purchaseContainer = document.getElementById('itemModalPurchaseRates');
        purchaseContainer.innerHTML = this.modalRates.purchase.map((rate, idx) => `
            <div class="rate-group">
                <input type="number" class="rate-input purchase" 
                       value="${rate}" 
                       oninput="window.app.items.updateModalRate('purchase', ${idx}, this.value)"
                       placeholder="Rate">
                <button class="delete-rate" onclick="window.app.items.deleteModalRate('purchase', ${idx})">×</button>
            </div>
        `).join('');
        
        // Render wholesale rates
        const wholesaleContainer = document.getElementById('itemModalWholesaleRates');
        wholesaleContainer.innerHTML = this.modalRates.wholesale.map((rate, idx) => `
            <div class="rate-group">
                <input type="number" class="rate-input wholesale" 
                       value="${rate}" 
                       oninput="window.app.items.updateModalRate('wholesale', ${idx}, this.value)"
                       placeholder="Rate">
                <button class="delete-rate" onclick="window.app.items.deleteModalRate('wholesale', ${idx})">×</button>
            </div>
        `).join('');
        
        // Render sale rates
        const saleContainer = document.getElementById('itemModalSaleRates');
        saleContainer.innerHTML = this.modalRates.sale.map((rate, idx) => `
            <div class="rate-group">
                <input type="number" class="rate-input sale" 
                       value="${rate}" 
                       oninput="window.app.items.updateModalRate('sale', ${idx}, this.value)"
                       placeholder="Rate">
                <button class="delete-rate" onclick="window.app.items.deleteModalRate('sale', ${idx})">×</button>
            </div>
        `).join('');
    },
    
    // Add rate in modal
    addModalRate(type) {
        this.modalRates[type].push('');
        this.renderModalRates();
    },
    
    // Update rate in modal
    updateModalRate(type, index, value) {
        this.modalRates[type][index] = Number(value);
    },
    
    // Delete rate in modal
    deleteModalRate(type, index) {
        this.modalRates[type].splice(index, 1);
        this.renderModalRates();
    },
    
    // Save item from modal
    async saveItemFromModal() {
        const name = document.getElementById('itemModalName').value.trim();
        const hindiName = document.getElementById('itemModalHindiName').value.trim();
        
        if (!name) {
            UIManager.showToast('Please enter item name');
            return;
        }
        
        UIManager.showLoading();
        
        try {
            const contactPerson = document.getElementById('itemModalContactPerson').value.trim();
            
            const itemData = {
                name: name,
                hindiName: hindiName,
                contactPerson: contactPerson,
                rates: this.modalRates.purchase.filter(r => r > 0),
                wholesaleRates: this.modalRates.wholesale.filter(r => r > 0),
                saleRates: this.modalRates.sale.filter(r => r > 0)
            };
            
            if (this.currentEditingItemIndex !== null) {
                // Update existing item
                itemData.id = AppState.items[this.currentEditingItemIndex].id;
                AppState.items[this.currentEditingItemIndex] = itemData;
                await FirebaseService.saveItem(itemData);
                UIManager.showToast('Item updated');
            } else {
                // Add new item
                const savedItem = await FirebaseService.saveItem(itemData);
                AppState.items.push(savedItem);
                UIManager.showToast('Item added');
            }
            
            this.closeItemModal();
            this.renderItemsTable();
            UIManager.hideLoading();
        } catch (error) {
            console.error('Error saving item:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to save item');
        }
    },
    
    // Delete item from modal
    async deleteItemFromModal() {
        if (this.currentEditingItemIndex === null) return;
        
        const item = AppState.items[this.currentEditingItemIndex];
        const confirmed = await UIManager.showModal(
            `Delete "${item.name}"?`,
            'Confirm Delete',
            true
        );
        
        if (!confirmed) return;
        
        UIManager.showLoading();
        try {
            await FirebaseService.deleteItem(item.id);
            AppState.items.splice(this.currentEditingItemIndex, 1);
            this.closeItemModal();
            this.renderItemsTable();
            UIManager.hideLoading();
            UIManager.showToast('Item deleted');
        } catch (error) {
            console.error('Error deleting item:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to delete item');
        }
    },
    
    // Close item modal
    closeItemModal() {
        document.getElementById('itemEditOverlay').style.display = 'none';
        this.currentEditingItemIndex = null;
        this.modalRates = { purchase: [], wholesale: [], sale: [] };
    }
};

// Export ItemsManager
export { ItemsManager };
