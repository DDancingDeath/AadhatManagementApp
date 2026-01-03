// -------------------- BILLING MODULE --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { PrinterService } from '../services/printer.js';
import { formatCurrency, debounce, generateId, pickContact } from '../utils/helpers.js';
import { DEFAULT_SETTINGS, TIME_MS, AUTO_SAVE_DELAY } from '../utils/constants.js';

// Bill state
let billItems = [];
let saleItems = [];
let weights = [];
let saleWeights = [];
let autoSaveTimer = null;

const BillingManager = {
    // -------------------- MODE TOGGLE --------------------
    
    currentMode: 'purchase', // 'purchase' or 'sale'
    autoSaveEnabled: true,
    itemFrequency: { purchase: {}, sale: {} }, // Cached frequency from database
    
    switchMode(mode, event) {
        const purchaseSection = document.getElementById('purchaseSection');
        const saleSection = document.getElementById('saleSection');
        const purchaseBtn = document.getElementById('purchaseModeBtn');
        const saleBtn = document.getElementById('saleModeBtn');
        
        if (!purchaseSection || !saleSection) return;
        
        // Auto-save current mode before switching
        if (this.autoSaveEnabled && this.currentMode !== mode) {
            this.autoSaveToCloud();
        }
        
        // Update button states
        if (event) {
            // Only update Purchase/Sale toggle buttons, not draft management buttons
            purchaseBtn.classList.remove('active');
            saleBtn.classList.remove('active');
            purchaseBtn.style.background = '';
            purchaseBtn.style.borderColor = '';
            saleBtn.style.background = '';
            saleBtn.style.borderColor = '';
            event.currentTarget.classList.add('active');
        }
        
        if (mode === 'sale') {
            // Switch to sale mode
            this.currentMode = 'sale';
            purchaseSection.style.display = 'none';
            saleSection.style.display = 'block';
            
            // Style sale button green when active
            if (saleBtn.classList.contains('active')) {
                saleBtn.style.background = '#22c55e';
                saleBtn.style.borderColor = '#22c55e';
            }
            
            // Preserve current selections before reloading dropdown
            const currentItem = document.getElementById('saleItem')?.value;
            const currentRate = document.getElementById('saleRate')?.value;
            const currentWeight = document.getElementById('saleWeight')?.value;
            
            // Load sale dropdown
            this.loadSaleItemsDropdown();
            
            // Restore selections after dropdown reload
            if (currentItem) {
                const saleItemSelect = document.getElementById('saleItem');
                if (saleItemSelect) {
                    saleItemSelect.value = currentItem;
                    this.loadSaleRates();
                }
            }
            if (currentRate) {
                setTimeout(() => {
                    const saleRateInput = document.getElementById('saleRate');
                    if (saleRateInput) {
                        saleRateInput.value = currentRate;
                    }
                }, 50);
            }
            if (currentWeight) {
                const saleWeightInput = document.getElementById('saleWeight');
                if (saleWeightInput) {
                    saleWeightInput.value = currentWeight;
                }
            }
            
            // Re-render existing sale data
            this.renderSalesBill();
            this.renderSaleWeights();
            this.updateSaleTotals();
        } else {
            // Switch to purchase mode
            this.currentMode = 'purchase';
            saleSection.style.display = 'none';
            purchaseSection.style.display = 'block';
            
            // Re-render existing purchase data
            this.renderBill();
            this.renderWeights();
            this.updateTotals();
            
            // Purchase button uses default blue when active
        }
        
        UIManager.hapticFeedback();
    },
    
    // -------------------- ITEMS & RATES LOADING --------------------
    
    async loadItemFrequency() {
        try {
            const userId = AppState.currentUser?.uid;
            if (!userId) return;
            
            const doc = await db.collection('itemFrequency').doc(userId).get();
            if (doc.exists) {
                this.itemFrequency = doc.data();
                console.log('✅ Loaded item frequency from database');
            } else {
                // Initialize empty frequency
                this.itemFrequency = { purchase: {}, sale: {} };
            }
        } catch (error) {
            console.error('Failed to load item frequency:', error);
            this.itemFrequency = { purchase: {}, sale: {} };
        }
    },
    
    async updateItemFrequency(items, mode = 'purchase') {
        try {
            const userId = AppState.currentUser?.uid;
            if (!userId) return;
            
            const now = Date.now();
            
            // Update frequency with weighted scoring
            items.forEach(item => {
                const itemId = item.itemId || item.name;
                if (!this.itemFrequency[mode]) this.itemFrequency[mode] = {};
                
                // Calculate score based on:
                // 1. Base score: 100 points per occurrence
                // 2. Quantity bonus: Add quantity/10 points (e.g., 50kg = +5 points)
                // 3. Recency: Items used in last 30 days get full weight, older items decay
                const baseScore = 100;
                const quantityBonus = (item.qty || 0) / 10;
                const recencyMultiplier = 1.0; // Recent items get full weight
                
                const score = (baseScore + quantityBonus) * recencyMultiplier;
                
                // Store both score and last used timestamp
                if (!this.itemFrequency[mode][itemId]) {
                    this.itemFrequency[mode][itemId] = { score: 0, lastUsed: 0, count: 0 };
                }
                
                this.itemFrequency[mode][itemId].score += score;
                this.itemFrequency[mode][itemId].lastUsed = now;
                this.itemFrequency[mode][itemId].count += 1;
            });
            
            // Apply time decay to all items (items not used recently get lower scores)
            Object.keys(this.itemFrequency[mode]).forEach(itemId => {
                const itemData = this.itemFrequency[mode][itemId];
                const daysSinceLastUse = (now - itemData.lastUsed) / TIME_MS.DAY;
                
                // Decay factor: 1.0 for today, 0.5 after 30 days, 0.1 after 90 days
                const decayFactor = Math.max(0.1, 1 - (daysSinceLastUse / 90));
                itemData.effectiveScore = itemData.score * decayFactor;
            });
            
            // Save to database
            await db.collection('itemFrequency').doc(userId).set(this.itemFrequency);
            console.log('✅ Updated item frequency in database');
        } catch (error) {
            console.error('Failed to update item frequency:', error);
        }
    },
    
    getItemFrequency(mode = 'purchase') {
        return this.itemFrequency[mode] || {};
    },
    
    loadItemsDropdown() {
        const select = document.getElementById('billItem');
        if (!select) return;
        
        select.innerHTML = '';
        
        // Get frequency for purchase items
        const freq = this.getItemFrequency('purchase');
        
        // Sort items by effective score (considers recency, quantity, and usage)
        const sortedItems = [...AppState.items].sort((a, b) => {
            const dataA = freq[a.id] || freq[a.name];
            const dataB = freq[b.id] || freq[b.name];
            const scoreA = dataA ? (dataA.effectiveScore || dataA.score || dataA) : 0;
            const scoreB = dataB ? (dataB.effectiveScore || dataB.score || dataB) : 0;
            return scoreB - scoreA; // Descending order
        });
        
        sortedItems.forEach((item) => {
            const opt = document.createElement('option');
            // Store the original index for reference
            const originalIndex = AppState.items.findIndex(i => i.id === item.id || i.name === item.name);
            opt.value = originalIndex;
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            opt.textContent = displayName;
            select.appendChild(opt);
        });
        
        if (AppState.items.length > 0) {
            this.loadRates();
        }
        // Don't clear weights here - it interferes with recovery
        // this.clearWeights();
    },
    
    loadSaleItemsDropdown() {
        const select = document.getElementById('saleItem');
        if (!select) return;
        
        select.innerHTML = '';
        
        // Get frequency for sale items
        const freq = this.getItemFrequency('sale');
        
        // Sort items by effective score (considers recency, quantity, and usage)
        const sortedItems = [...AppState.items].sort((a, b) => {
            const dataA = freq[a.id] || freq[a.name];
            const dataB = freq[b.id] || freq[b.name];
            const scoreA = dataA ? (dataA.effectiveScore || dataA.score || dataA) : 0;
            const scoreB = dataB ? (dataB.effectiveScore || dataB.score || dataB) : 0;
            return scoreB - scoreA; // Descending order
        });
        
        sortedItems.forEach((item) => {
            const opt = document.createElement('option');
            // Store the original index for reference
            const originalIndex = AppState.items.findIndex(i => i.id === item.id || i.name === item.name);
            opt.value = originalIndex;
            const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
            opt.textContent = displayName;
            select.appendChild(opt);
        });
        
        if (AppState.items.length > 0) {
            this.loadSaleRates();
        }
        // Don't clear weights here - it interferes with recovery
        // this.clearSaleWeights();
    },
    
    loadRates() {
        const itemIndex = document.getElementById('billItem')?.value;
        const rateInput = document.getElementById('billRate');
        const rateDatalist = document.getElementById('rateOptions');
        
        if (!rateInput || !rateDatalist) return;
        
        rateDatalist.innerHTML = '';
        rateInput.value = '';
        rateInput.placeholder = 'Select or enter rate';
        
        if (itemIndex !== undefined && itemIndex !== '') {
            const item = AppState.items[parseInt(itemIndex)];
            if (item && item.rates && item.rates.length > 0) {
                console.log(`Loading ${item.rates.length} rates for ${item.name}:`, item.rates);
                item.rates.forEach(rate => {
                    const option = document.createElement('option');
                    option.value = rate;
                    rateDatalist.appendChild(option);
                });
                
                // Leave rate empty for user to select or type
                console.log(`✅ Loaded ${item.rates.length} rate options`);
            } else {
                console.log('No rates found for item:', item);
            }
        }
    },
    
    loadSaleRates() {
        const itemIndex = document.getElementById('saleItem')?.value;
        const rateInput = document.getElementById('saleRate');
        const rateDatalist = document.getElementById('saleRateOptions');
        if (!rateInput || !rateDatalist) return;
        rateDatalist.innerHTML = '';
        rateInput.value = '';
        rateInput.placeholder = 'Select or enter rate';
        if (itemIndex !== undefined && itemIndex !== '') {
            const item = AppState.items[parseInt(itemIndex)];
            if (item && item.saleRates && item.saleRates.length > 0) {
                item.saleRates.forEach(rate => {
                    const option = document.createElement('option');
                    option.value = rate;
                    rateDatalist.appendChild(option);
                });
                // Optionally set first sale rate as default (commented out to allow custom entry)
                // rateInput.value = item.saleRates[0];
            } else {
                // No sale rates available, leave datalist empty and input blank
            }
        }
    },
    
    // -------------------- WEIGHT MANAGEMENT --------------------
    
    async addWeight(autoAddToBill = false) {
        const weightInput = document.getElementById('newWeight');
        const weight = parseFloat(weightInput?.value);
        
        if (!weight || weight <= 0) {
            UIManager.showToast('Please enter a valid weight');
            return;
        }
        
        weights.push(weight);
        weightInput.value = '';
        weightInput.focus();
        
        this.renderWeights();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
        
        // If auto-add flag is set and this is the first/only weight, add to bill directly
        if (autoAddToBill && weights.length === 1) {
            await this.addToBill(true);
        }
    },
    
    renderWeights() {
        const container = document.getElementById('weightsDisplay');
        if (!container) return;
        
        const totalWeightsSpan = document.getElementById('totalWeights');
        const totalPacketsSpan = document.getElementById('totalPackets');
        
        if (weights.length === 0) {
            container.innerHTML = '';
            if (totalWeightsSpan) totalWeightsSpan.textContent = '0';
            if (totalPacketsSpan) totalPacketsSpan.textContent = '0';
            return;
        }
        
        const total = weights.reduce((sum, w) => sum + w, 0);
        
        if (totalWeightsSpan) totalWeightsSpan.textContent = total.toFixed(1);
        if (totalPacketsSpan) totalPacketsSpan.textContent = weights.length;
        
        container.innerHTML = `
            <div class="weights-compact-list">
                ${weights.map((w, i) => `
                    <div class="weight-chip">
                        <span>${w.toFixed(1)}</span>
                        <button class="weight-chip-remove" onclick="window.app.billing.removeWeight(${i})">×</button>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    removeWeight(index) {
        weights.splice(index, 1);
        this.renderWeights();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
    },
    
    clearWeights() {
        weights = [];
        this.renderWeights();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
    },
    
    // -------------------- PURCHASE BILL MANAGEMENT --------------------
    
    async addToBill(autoAdd = false) {
        const itemSelect = document.getElementById('billItem');
        const rateInput = document.getElementById('billRate');
        const weightInput = document.getElementById('newWeight');
        
        if (!itemSelect || !rateInput) return;
        
        const itemIndex = parseInt(itemSelect.value);
        const rate = parseFloat(rateInput.value);
        
        if (itemIndex === undefined || itemIndex === '' || isNaN(itemIndex)) {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        // If there's a weight typed in the input but not added, add it first
        const pendingWeight = parseFloat(weightInput?.value);
        if (pendingWeight && pendingWeight > 0) {
            weights.push(pendingWeight);
            weightInput.value = '';
            this.renderWeights();
        }
        
        if (weights.length === 0) {
            UIManager.showToast('Please add at least one weight');
            return;
        }
        
        const item = AppState.items[itemIndex];
        if (!item) {
            UIManager.showToast('Item not found');
            return;
        }
        
        const qty = weights.reduce((sum, w) => sum + w, 0);
        const total = Math.round(qty * rate);
        
        const displayName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        billItems.push({
            itemId: item.id,
            name: displayName,
            rate,
            qty,
            total,
            weights: [...weights],
            timestamp: Date.now()
        });
        
        // Clear inputs
        weights = [];
        this.renderWeights();
        this.renderBill();
        this.triggerAutoSave();
        
        // Reset form
        const newWeightInput = document.getElementById('newWeight');
        if (newWeightInput) {
            newWeightInput.value = '';
            newWeightInput.focus();
        }
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${displayName} to bill`);
    },
    
    renderBill() {
        const tbody = document.querySelector('#billTable tbody');
        const weightBreakdownSection = document.getElementById('weightBreakdownSection');
        if (!tbody) return;
        
        const totalPacketsInBillSpan = document.getElementById('totalPacketsInBill');
        const billTotalSpan = document.getElementById('billTotal');
        
        if (billItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No items in bill</td></tr>';
            if (billTotalSpan) billTotalSpan.textContent = '0';
            if (totalPacketsInBillSpan) totalPacketsInBillSpan.textContent = '0';
            if (weightBreakdownSection) weightBreakdownSection.innerHTML = '';
            this.updateTotals();
            return;
        }
        
        // Render weight breakdown for items with 2 or more packets
        if (weightBreakdownSection) {
            const itemsWithMultipleWeights = billItems.filter(item => item.weights.length >= 2);
            
            if (itemsWithMultipleWeights.length > 0) {
                weightBreakdownSection.innerHTML = itemsWithMultipleWeights.map(item => {
                    const weightsPerLine = 6;
                    const weightLines = [];
                    for (let i = 0; i < item.weights.length; i += weightsPerLine) {
                        const lineWeights = item.weights.slice(i, i + weightsPerLine);
                        weightLines.push(lineWeights.map(w => parseFloat(w).toFixed(1)).join('&nbsp;&nbsp;'));
                    }
                    
                    return `
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #007bff;">
                            <div style="font-weight: 600; margin-bottom: 6px; color: #333;">
                                ${item.name} (${item.weights.length} packets, ${item.qty.toFixed(1)} kg)
                            </div>
                            <div style="font-family: monospace; font-size: 14px; line-height: 1.4; color: #555;">
                                ${weightLines.join('<br>')}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                weightBreakdownSection.innerHTML = '';
            }
        }
        
        // Render bill items table (without weight breakdown in rows)
        tbody.innerHTML = billItems.map((item, index) => {
            return `
                <tr style="cursor: pointer;" onclick="window.app.billing.editBillItem(${index})">
                    <td>${item.name}</td>
                    <td>₹${item.rate.toFixed(2)}</td>
                    <td>${item.qty.toFixed(1)} kg</td>
                    <td>₹${Math.round(item.total)}</td>
                    <td><button onclick="event.stopPropagation(); window.app.billing.deleteBillItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                </tr>
            `;
        }).join('');
        
        // Update totals
        const billTotal = billItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = billItems.reduce((sum, item) => sum + item.weights.length, 0);
        
        // Calculate heavy packets (weight > 30kg threshold)
        const heavyWeightThreshold = AppState.settings?.heavyWeightThreshold || 30;
        const totalHeavyPackets = billItems.reduce((sum, item) => {
            const heavyCount = item.weights.filter(w => w > heavyWeightThreshold).length;
            return sum + heavyCount;
        }, 0);
        
        if (billTotalSpan) billTotalSpan.textContent = Math.round(billTotal);
        if (totalPacketsInBillSpan) totalPacketsInBillSpan.textContent = totalPackets;
        
        // Don't clear manually set flag or labor value when in edit mode
        const laborChargesInput = document.getElementById('manualLaborCharges');
        if (laborChargesInput && this.editingBillIndex === undefined) {
            delete laborChargesInput.dataset.manuallySet;
        }
        
        this.updateTotals(totalHeavyPackets);
    },
    
    deleteBillItem(index) {
        billItems.splice(index, 1);
        this.renderBill();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
    },
    
    editBillItem(index) {
        // First, save any pending data in the form
        const currentItem = document.getElementById('billItem')?.value;
        const currentRate = parseFloat(document.getElementById('billRate')?.value);
        
        // If there's data being filled, add it to bill first
        if (currentItem && currentRate && weights.length > 0) {
            this.addToBill(true);
        }
        
        // Get the item to edit
        const item = billItems[index];
        if (!item) return;
        
        // Remove from bill
        billItems.splice(index, 1);
        this.renderBill();
        
        // Populate the form with item data
        const itemIndex = AppState.items.findIndex(i => i.id === item.itemId || i.name === item.name);
        if (itemIndex !== -1) {
            document.getElementById('billItem').value = itemIndex;
            this.loadRates();
            
            setTimeout(() => {
                document.getElementById('billRate').value = item.rate;
            }, 50);
        }
        
        // Set the weights
        weights = item.weights || [];
        this.renderWeights();
        
        this.triggerAutoSave();
        UIManager.hapticFeedback();
        UIManager.showToast('Item loaded for editing');
    },
    
    updateTotals(heavyPacketsCount = 0) {
        const billTotal = parseFloat(document.getElementById('billTotal')?.textContent || 0);
        const totalPackets = parseInt(document.getElementById('totalPacketsInBill')?.textContent || 0);
        const autoLaborCheckbox = document.getElementById('autoLaborCharge');
        const laborCalculationSpan = document.getElementById('laborCalculation');
        const laborChargesInput = document.getElementById('manualLaborCharges');
        
        // Calculate labor charges if checkbox is checked
        let laborCharges = 0;
        if (autoLaborCheckbox?.checked) {
            const laborRate = AppState.settings?.laborRate || 6;
            const autoCalculatedLabor = laborRate * heavyPacketsCount;
            
            // Only auto-calculate if the user hasn't manually edited the field AND not in edit mode
            if (laborChargesInput && !laborChargesInput.dataset.manuallySet && this.editingBillIndex === undefined) {
                laborChargesInput.value = autoCalculatedLabor.toFixed(0);
            }
            
            if (laborChargesInput) {
                laborChargesInput.disabled = false;
                laborChargesInput.style.opacity = '1';
                laborChargesInput.style.cursor = 'text';
            }
            if (laborCalculationSpan) {
                laborCalculationSpan.textContent = `${laborRate} × ${heavyPacketsCount}`;
            }
            
            // Use the current value in the field
            laborCharges = parseFloat(laborChargesInput?.value || 0);
        } else {
            // Checkbox unchecked - no labor charges
            if (laborChargesInput) {
                laborChargesInput.value = '0';
                laborChargesInput.disabled = true;
                laborChargesInput.style.opacity = '0.5';
                laborChargesInput.style.cursor = 'not-allowed';
            }
            if (laborCalculationSpan) {
                laborCalculationSpan.textContent = '';
            }
            laborCharges = 0;
        }
        
        // Calculate grand total (subtract labor charges for purchase)
        const grandTotal = billTotal - laborCharges;
        
        const grandTotalElement = document.getElementById('amountPayable');
        if (grandTotalElement) {
            grandTotalElement.textContent = Math.round(grandTotal);
        }
        
        this.updatePaymentTotal();
    },
    
    updatePaymentTotal() {
        const grandTotal = parseFloat(document.getElementById('amountPayable')?.textContent || 0);
        const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
        
        // Total paid should only include online and cash, not due
        const totalPaid = onlinePayment + cashPayment;
        
        const totalPaymentElement = document.getElementById('totalPayment');
        if (totalPaymentElement) {
            totalPaymentElement.textContent = Math.round(totalPaid);
        }
    },
    
    fillPayableAmount(type) {
        const grandTotal = parseFloat(document.getElementById('amountPayable')?.textContent || 0);
        const onlineInput = document.getElementById('onlinePayment');
        const cashInput = document.getElementById('cashPayment');
        const dueInput = document.getElementById('dueAmount');
        const onlineCheckbox = document.getElementById('onlineCheckbox');
        const cashCheckbox = document.getElementById('cashCheckbox');
        const dueCheckbox = document.getElementById('dueCheckbox');
        
        if (type === 'online' && onlineCheckbox?.checked) {
            if (onlineInput) onlineInput.value = Math.round(grandTotal);
            if (cashInput) cashInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (cashCheckbox) cashCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'cash' && cashCheckbox?.checked) {
            if (cashInput) cashInput.value = Math.round(grandTotal);
            if (onlineInput) onlineInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'due' && dueCheckbox?.checked) {
            if (dueInput) dueInput.value = Math.round(grandTotal);
            if (onlineInput) onlineInput.value = '0';
            if (cashInput) cashInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (cashCheckbox) cashCheckbox.checked = false;
        }
        
        this.updatePaymentTotal();
    },
    
    // -------------------- SAVE & PRINT --------------------
    
    async generateBillNumber() {
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        
        // Query Firestore for today's bills to find the next number (for parallel user safety)
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        
        try {
            const snapshot = await db.collection('bills')
                .where('timestamp', '>=', todayStart.getTime())
                .where('timestamp', '<', todayEnd.getTime())
                .get();
            
            const nextNum = snapshot.size + 1;
            return `${dateStr}-${String(nextNum).padStart(3, '0')}`;
        } catch (error) {
            console.error('Error generating bill number:', error);
            // Fallback to timestamp-based number if query fails
            return `${dateStr}-${Date.now().toString().slice(-3)}`;
        }
    },

    async saveBillToHistory() {
        // Check if in edit mode
        if (this.editingBillIndex !== undefined) {
            return this.saveEditedBill();
        }
        
        if (billItems.length === 0) {
            UIManager.showToast('No items in bill');
            return;
        }
        
        const billTotal = parseFloat(document.getElementById('billTotal').textContent);
        const laborCharges = parseFloat(document.getElementById('manualLaborCharges')?.value || 0);
        const totalPackets = parseInt(document.getElementById('totalPacketsInBill').textContent);
        const grandTotal = parseFloat(document.getElementById('amountPayable').textContent);
        const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
        const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
        const dueAmount = parseFloat(document.getElementById('dueAmount')?.value || 0);
        const customerName = document.getElementById('customerName')?.value || '';
        const comments = document.getElementById('billComments')?.value || '';
        
        // Validate payment - at least one payment method must be provided
        if (onlinePayment === 0 && cashPayment === 0 && dueAmount === 0) {
            UIManager.showToast('Please enter at least one payment method (Cash, Online, or Due)');
            return;
        }
        
        // Get labor calculation string only if auto-labor was used (checkbox checked and not manually edited)
        const autoLaborCheckbox = document.getElementById('autoLaborCharge');
        const laborChargesInput = document.getElementById('manualLaborCharges');
        const laborCalculationSpan = document.getElementById('laborCalculation');
        const laborCalc = (autoLaborCheckbox?.checked && !laborChargesInput?.dataset.manuallySet) 
            ? laborCalculationSpan?.textContent || null 
            : null;
        
        // Generate bill number
        const billNumber = await this.generateBillNumber();
        
        const bill = {
            id: generateId(),
            billNumber,
            items: billItems,
            billTotal,
            laborCharges,
            laborCalc,
            totalPackets,
            grandTotal,
            amountPayable: grandTotal,
            onlinePayment,
            cashPayment,
            dueAmount,
            customerName,
            comments,
            type: 'purchase',
            isPurchase: true,
            date: new Date().toISOString(),
            userId: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            timestamp: Date.now(),
            payment: {
                online: onlinePayment,
                cash: cashPayment,
                due: dueAmount,
                total: onlinePayment + cashPayment + dueAmount
            }
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.saveBill(bill);
            
            // Update item frequency in database
            await this.updateItemFrequency(billItems, 'purchase');
            
            // Clear bill
            billItems = [];
            weights = [];
            this.renderBill();
            this.renderWeights();
            
            // Reset form completely
            if (document.getElementById('customerName')) {
                document.getElementById('customerName').value = '';
            }
            if (document.getElementById('onlinePayment')) {
                document.getElementById('onlinePayment').value = '';
            }
            if (document.getElementById('cashPayment')) {
                document.getElementById('cashPayment').value = '';
            }
            if (document.getElementById('dueAmount')) {
                document.getElementById('dueAmount').value = '';
            }
            if (document.getElementById('manualLaborCharges')) {
                document.getElementById('manualLaborCharges').value = '0';
            }
            if (document.getElementById('billComments')) {
                document.getElementById('billComments').value = '';
            }
            if (document.getElementById('onlineCheckbox')) {
                document.getElementById('onlineCheckbox').checked = false;
            }
            if (document.getElementById('cashCheckbox')) {
                document.getElementById('cashCheckbox').checked = false;
            }
            if (document.getElementById('dueCheckbox')) {
                document.getElementById('dueCheckbox').checked = false;
            }
            
            // Reset totals
            this.updateTotals();
            
            // Delete auto-save since bill is completed
            await this.deleteAutoSave();
            
            UIManager.hideLoading();
            UIManager.showToast('Bill saved successfully!');
            UIManager.hapticFeedback('success');
            
            return bill; // Return saved bill for printing
            
        } catch (error) {
            UIManager.hideLoading();
            UIManager.showToast('Failed to save bill: ' + error.message);
            console.error('Save bill error:', error);
            throw error; // Re-throw to prevent printing on error
        }
    },
    
    // -------------------- SALES BILL MANAGEMENT --------------------
    
    async addSaleWeight(autoAddToBill = false) {
        const weightInput = document.getElementById('saleWeight');
        const weight = parseFloat(weightInput?.value);
        
        if (!weight || weight <= 0) {
            UIManager.showToast('Please enter a valid weight');
            return;
        }
        
        saleWeights.push(weight);
        weightInput.value = '';
        weightInput.focus();
        
        this.renderSaleWeights();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
        
        // If auto-add flag is set and this is the first/only weight, add to bill directly
        if (autoAddToBill && saleWeights.length === 1) {
            await this.addToSalesBill(true);
        }
    },
    
    renderSaleWeights() {
        const container = document.getElementById('saleWeightsDisplay');
        if (!container) return;
        
        const totalWeightsSpan = document.getElementById('saleRunningTotal');
        const totalPacketsSpan = document.getElementById('salePacketCount');
        
        if (saleWeights.length === 0) {
            container.innerHTML = '';
            if (totalWeightsSpan) totalWeightsSpan.textContent = '0';
            if (totalPacketsSpan) totalPacketsSpan.textContent = '0';
            return;
        }
        
        const total = saleWeights.reduce((sum, w) => sum + w, 0);
        
        if (totalWeightsSpan) totalWeightsSpan.textContent = total.toFixed(1);
        if (totalPacketsSpan) totalPacketsSpan.textContent = saleWeights.length;
        
        container.innerHTML = `
            <div class="weights-compact-list">
                ${saleWeights.map((w, i) => `
                    <div class="weight-chip">
                        <span>${w.toFixed(1)}</span>
                        <button class="weight-chip-remove" onclick="window.app.billing.removeSaleWeight(${i})">×</button>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    removeSaleWeight(index) {
        saleWeights.splice(index, 1);
        this.renderSaleWeights();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
    },
    
    clearSaleWeights() {
        saleWeights = [];
        this.renderSaleWeights();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
    },
    
    async addToSalesBill(autoAdd = false) {
        const itemSelect = document.getElementById('saleItem');
        const rateInput = document.getElementById('saleRate');
        const weightInput = document.getElementById('saleWeight');
        
        if (!itemSelect || !rateInput) return;
        
        const itemIndex = parseInt(itemSelect.value);
        const rate = parseFloat(rateInput.value);
        
        if (itemIndex === undefined || itemIndex === '' || isNaN(itemIndex)) {
            UIManager.showToast('Please select an item');
            return;
        }
        
        if (!rate || rate <= 0) {
            UIManager.showToast('Please enter a valid rate');
            return;
        }
        
        // Use accumulated weights if available, otherwise fall back to single weight input
        let qty;
        let packets;
        let allWeights = []; // Declare at function scope
        
        // Check if there's a typed weight that hasn't been added to saleWeights
        const typedWeight = parseFloat(weightInput?.value);
        const hasTypedWeight = typedWeight && typedWeight > 0;
        
        if (saleWeights.length > 0 || hasTypedWeight) {
            // Combine saleWeights array with any typed weight
            allWeights = [...saleWeights];
            if (hasTypedWeight) {
                allWeights.push(typedWeight);
            }
            
            qty = allWeights.reduce((sum, w) => sum + w, 0);
            packets = allWeights.length;
        } else {
            UIManager.showToast('Please add weights or enter a quantity');
            return;
        }
        
        const item = AppState.items[itemIndex];
        if (!item) {
            UIManager.showToast('Item not found');
            return;
        }
        
        const itemName = (AppState.settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        
        // Stock validation temporarily disabled
        // const stockItem = AppState.stock?.[item.id] || AppState.stock?.[item.name];
        // console.log('Stock check:', { 
        //     itemId: item.id,
        //     itemName: item.name,
        //     stockItem, 
        //     availableStock: stockItem?.quantity,
        //     requestedQty: qty
        // });
        // 
        // if (!stockItem || stockItem.quantity < qty) {
        //     const available = stockItem?.quantity || 0;
        //     UIManager.showToast(`Insufficient stock! Available: ${available}kg`);
        //     return;
        // }
        
        const total = Math.round(qty * rate);
        
        saleItems.push({
            itemId: item.id,
            name: itemName,
            rate,
            qty,
            packets,
            weights: allWeights, // Store individual weights for display
            total,
            timestamp: Date.now()
        });
        
        this.renderSalesBill();
        this.triggerAutoSave();
        
        // Clear weights and reset inputs
        saleWeights = [];
        this.renderSaleWeights();
        
        itemSelect.selectedIndex = 0;
        rateInput.value = '';
        if (weightInput) weightInput.value = '';
        
        // Focus back to item selection
        itemSelect.focus();
        
        UIManager.hapticFeedback();
        UIManager.showToast(`Added ${itemName} to sale`);
    },
    
    renderSalesBill() {
        const tbody = document.querySelector('#saleTable tbody');
        const totalSalePacketsSpan = document.getElementById('totalSalePacketsInBill');
        const saleTotalSpan = document.getElementById('saleTotal');
        const saleWeightBreakdownSection = document.getElementById('saleWeightBreakdownSection');
        
        if (!tbody) return;
        
        if (saleItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No items in bill</td></tr>';
            if (saleTotalSpan) saleTotalSpan.textContent = '0';
            if (totalSalePacketsSpan) totalSalePacketsSpan.textContent = '0';
            if (saleWeightBreakdownSection) saleWeightBreakdownSection.innerHTML = '';
            this.updateSaleTotals();
            this.updateSaleRunningTotal();
            return;
        }
        
        // Render weight breakdown for items with 2 or more packets
        if (saleWeightBreakdownSection) {
            const itemsWithMultipleWeights = saleItems.filter(item => item.weights && item.weights.length >= 2);
            
            if (itemsWithMultipleWeights.length > 0) {
                saleWeightBreakdownSection.innerHTML = itemsWithMultipleWeights.map(item => {
                    const weightsPerLine = 6;
                    const weightLines = [];
                    for (let i = 0; i < item.weights.length; i += weightsPerLine) {
                        const lineWeights = item.weights.slice(i, i + weightsPerLine);
                        weightLines.push(lineWeights.map(w => parseFloat(w).toFixed(1)).join('&nbsp;&nbsp;'));
                    }
                    
                    return `
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #22c55e;">
                            <div style="font-weight: 600; margin-bottom: 6px; color: #333;">
                                ${item.name} (${item.weights.length} packets, ${item.qty.toFixed(1)} kg)
                            </div>
                            <div style="font-family: monospace; font-size: 14px; line-height: 1.4; color: #555;">
                                ${weightLines.join('<br>')}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                saleWeightBreakdownSection.innerHTML = '';
            }
        }
        
        // Render bill items table
        tbody.innerHTML = saleItems.map((item, index) => `
            <tr style="cursor: pointer;" onclick="window.app.billing.editSaleItem(${index})">
                <td>${item.name}</td>
                <td>₹${item.rate.toFixed(2)}</td>
                <td>${item.qty.toFixed(1)} kg</td>
                <td>₹${Math.round(item.total)}</td>
                <td><button onclick="event.stopPropagation(); window.app.billing.removeSaleItem(${index})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
            </tr>
        `).join('');
        
        // Update totals
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        const totalPackets = saleItems.reduce((sum, item) => sum + (item.packets || 1), 0);
        
        if (saleTotalSpan) saleTotalSpan.textContent = Math.round(salesTotal);
        if (totalSalePacketsSpan) totalSalePacketsSpan.textContent = totalPackets;
        
        this.updateSaleTotals();
        this.updateSaleRunningTotal();
        this.updateSalePaymentTotal();
    },
    
    removeSalesItem(index) {
        saleItems.splice(index, 1);
        this.renderSalesBill();
        this.updateSaleTotals();
        this.triggerAutoSave();
    },
    
    removeSaleItem(index) {
        saleItems.splice(index, 1);
        this.renderSalesBill();
        this.triggerAutoSave();
        UIManager.hapticFeedback();
    },
    
    editSaleItem(index) {
        // First, save any pending data in the form
        const currentItem = document.getElementById('saleItem')?.value;
        const currentRate = parseFloat(document.getElementById('saleRate')?.value);
        
        // If there's data being filled, add it to bill first
        if (currentItem && currentRate && saleWeights.length > 0) {
            this.addToSalesBill(true);
        }
        
        // Get the item to edit
        const item = saleItems[index];
        if (!item) return;
        
        // Remove from bill
        saleItems.splice(index, 1);
        this.renderSalesBill();
        
        // Populate the form with item data
        const itemIndex = AppState.items.findIndex(i => i.id === item.itemId || i.name === item.name);
        if (itemIndex !== -1) {
            document.getElementById('saleItem').value = itemIndex;
            this.loadSaleRates();
            
            setTimeout(() => {
                document.getElementById('saleRate').value = item.rate;
            }, 50);
        }
        
        // Set the weights (reconstruct from qty and packets)
        if (item.qty && item.packets) {
            // If we have the original weights array, use it
            if (item.weights && item.weights.length > 0) {
                saleWeights = [...item.weights];
            } else {
                // Otherwise distribute qty equally across packets
                const avgWeight = item.qty / item.packets;
                saleWeights = Array(item.packets).fill(avgWeight);
            }
        } else {
            saleWeights = [item.qty];
        }
        this.renderSaleWeights();
        
        this.triggerAutoSave();
        UIManager.hapticFeedback();
        UIManager.showToast('Item loaded for editing');
    },
    
    updateSaleTotals() {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        
        const saleTotalEl = document.getElementById('saleTotal');
        const amountReceivableEl = document.getElementById('amountReceivable');
        
        if (saleTotalEl) saleTotalEl.textContent = Math.round(total);
        if (amountReceivableEl) amountReceivableEl.textContent = Math.round(total);
        
        this.updateSalePaymentTotal();
    },

    updateSaleRunningTotal() {
        const totalQty = saleItems.reduce((sum, item) => sum + item.qty, 0);
        const packetCount = saleItems.length;
        
        const runningTotalEl = document.getElementById('saleRunningTotal');
        const packetCountEl = document.getElementById('salePacketCount');
        
        if (runningTotalEl) runningTotalEl.textContent = totalQty.toFixed(1);
        if (packetCountEl) packetCountEl.textContent = packetCount;
    },
    
    updateSalePaymentTotal() {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
        const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
        
        const totalReceived = saleOnline + saleCash;
        
        const totalReceivedEl = document.getElementById('totalReceived');
        
        if (totalReceivedEl) totalReceivedEl.textContent = Math.round(totalReceived);
        // Don't auto-populate due amount - user enters manually (parity with purchase)
    },
    
    fillReceivableAmount(type) {
        const total = saleItems.reduce((sum, item) => sum + item.total, 0);
        const onlineInput = document.getElementById('saleOnlinePayment');
        const cashInput = document.getElementById('saleCashPayment');
        const dueInput = document.getElementById('saleDueAmount');
        const onlineCheckbox = document.getElementById('saleOnlineCheckbox');
        const cashCheckbox = document.getElementById('saleCashCheckbox');
        const dueCheckbox = document.getElementById('saleDueCheckbox');
        
        if (type === 'online' && onlineCheckbox?.checked) {
            if (onlineInput) onlineInput.value = Math.round(total);
            if (cashInput) cashInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (cashCheckbox) cashCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'cash' && cashCheckbox?.checked) {
            if (cashInput) cashInput.value = Math.round(total);
            if (onlineInput) onlineInput.value = '0';
            if (dueInput) dueInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (dueCheckbox) dueCheckbox.checked = false;
        } else if (type === 'due' && dueCheckbox?.checked) {
            if (dueInput) dueInput.value = Math.round(total);
            if (onlineInput) onlineInput.value = '0';
            if (cashInput) cashInput.value = '0';
            if (onlineCheckbox) onlineCheckbox.checked = false;
            if (cashCheckbox) cashCheckbox.checked = false;
        }
        
        this.updateSalePaymentTotal();
    },
    
    fillSalePayableAmount(type) {
        const salesTotal = parseFloat(document.getElementById('salesBillTotal')?.textContent || 0);
        const onlineInput = document.getElementById('saleOnlinePayment');
        const cashInput = document.getElementById('saleCashPayment');
        
        if (type === 'online' && onlineInput) {
            onlineInput.value = Math.round(salesTotal);
            if (cashInput) cashInput.value = '0';
        } else if (type === 'cash' && cashInput) {
            cashInput.value = Math.round(salesTotal);
            if (onlineInput) onlineInput.value = '0';
        }
        
        this.updateSalePaymentTotal();
    },
    
    async completeSale() {
        // Check if in edit mode
        if (this.editingBillIndex !== undefined) {
            return this.saveEditedBill();
        }
        
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
        const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
        const saleDue = parseFloat(document.getElementById('saleDueAmount')?.value || 0);
        const saleCustomer = document.getElementById('saleCustomerName')?.value || '';
        const saleComments = document.getElementById('saleComments')?.value || '';
        
        // Validate payment - at least one payment method must be provided
        if (saleOnline === 0 && saleCash === 0 && saleDue === 0) {
            UIManager.showToast('Please enter at least one payment method (Cash, Online, or Due)');
            return;
        }
        
        // Calculate total packets
        const totalPackets = saleItems.reduce((sum, item) => sum + (item.packets || 0), 0);
        
        const sale = {
            id: generateId(),
            items: saleItems,
            total: salesTotal,
            totalPackets: totalPackets,
            onlinePayment: saleOnline,
            cashPayment: saleCash,
            dueAmount: saleDue,
            customerName: saleCustomer,
            comments: saleComments,
            type: 'sale',
            isPurchase: false,
            date: new Date().toISOString(),
            userId: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            userName: AppState.userName || 'User',
            timestamp: Date.now(),
            payment: {
                online: saleOnline,
                cash: saleCash,
                due: saleDue,
                total: saleOnline + saleCash + saleDue
            }
        };
        
        try {
            UIManager.showLoading();
            await FirebaseService.saveSale(sale);
            
            // Update item frequency in database
            await this.updateItemFrequency(saleItems, 'sale');
            
            // Stock will be automatically recalculated from sales
            
            // Clear sale
            saleItems = [];
            this.renderSalesBill();
            
            // Reset form
            if (document.getElementById('saleCustomerName')) {
                document.getElementById('saleCustomerName').value = '';
            }
            if (document.getElementById('saleOnlinePayment')) {
                document.getElementById('saleOnlinePayment').value = '0';
            }
            if (document.getElementById('saleCashPayment')) {
                document.getElementById('saleCashPayment').value = '0';
            }
            if (document.getElementById('saleDueAmount')) {
                document.getElementById('saleDueAmount').value = '0';
            }
            if (document.getElementById('saleComments')) {
                document.getElementById('saleComments').value = '';
            }
            if (document.getElementById('saleOnlineCheckbox')) {
                document.getElementById('saleOnlineCheckbox').checked = false;
            }
            if (document.getElementById('saleCashCheckbox')) {
                document.getElementById('saleCashCheckbox').checked = false;
            }
            if (document.getElementById('saleDueCheckbox')) {
                document.getElementById('saleDueCheckbox').checked = false;
            }
            // Reset total received display
            if (document.getElementById('totalReceived')) {
                document.getElementById('totalReceived').textContent = '0';
            }
            
            // Delete auto-save since sale is completed
            await this.deleteAutoSave();
            
            UIManager.hideLoading();
            UIManager.showToast('Sale completed successfully!');
            UIManager.hapticFeedback('success');
            
            return sale; // Return saved sale for printing
            
        } catch (error) {
            UIManager.hideLoading();
            UIManager.showToast('Failed to complete sale: ' + error.message);
            console.error('Complete sale error:', error);
            throw error; // Re-throw to prevent printing on error
        }
    },
    
    // Contact picker helpers
    async pickContact() {
        await pickContact('customerName');
    },
    
    async pickSaleContact() {
        await pickContact('saleCustomerName');
    },
    
    async shareWhatsApp() {
        if (billItems.length === 0) {
            UIManager.showToast('No items in bill');
            return;
        }
        
        const total = billItems.reduce((sum, item) => sum + item.total, 0);
        const laborCharges = parseFloat(document.getElementById('manualLaborCharges')?.value || 0);
        const grandTotal = total + laborCharges;
        const customer = document.getElementById('customerName')?.value || 'Customer';
        
        let message = `*Purchase Bill*\n\n`;
        message += `Customer: ${customer}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;
        message += `*Items:*\n`;
        
        billItems.forEach(item => {
            message += `${item.name}\n`;
            message += `  Rate: ₹${item.rate.toFixed(2)} × ${item.qty.toFixed(2)}kg = ₹${item.total.toFixed(2)}\n`;
        });
        
        message += `\n*Purchase Total: ₹${Math.round(total)}*\n`;
        if (laborCharges > 0) {
            message += `Labor Charges: ₹${Math.round(laborCharges)}\n`;
            message += `*Total Payable: ₹${Math.round(grandTotal)}*`;
        }
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },
    
    async shareSaleWhatsApp() {
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
        const customer = document.getElementById('saleCustomerName')?.value || 'Customer';
        
        let message = `*Sale Bill*\n\n`;
        message += `Customer: ${customer}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;
        message += `*Items:*\n`;
        
        saleItems.forEach(item => {
            message += `${item.name}\n`;
            message += `  Rate: ₹${item.rate.toFixed(2)} × ${item.qty.toFixed(2)}kg = ₹${item.total.toFixed(2)}\n`;
        });
        
        message += `\n*Total: ₹${Math.round(salesTotal)}*`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },
    
    async printSale() {
        if (saleItems.length === 0) {
            UIManager.showToast('No items in sale');
            return;
        }
        
        try {
            // Save the sale first and wait for it to complete
            const savedSale = await this.completeSale();
            
            if (!savedSale) {
                // Save failed or was cancelled
                return;
            }
            
            // Only print after successful save
            await PrinterService.printBill(savedSale);
            
            UIManager.showToast('Sale saved and printed!');
        } catch (error) {
            console.error('Print sale error:', error);
            UIManager.showToast('Error: ' + error.message);
        }
    },
    
    // Expose state for access
    getBillItems() {
        return billItems;
    },
    
    getSaleItems() {
        return saleItems;
    },
    
    getWeights() {
        return weights;
    },
    
    getSaleWeights() {
        return saleWeights;
    },

    // -------------------- DRAFT MANAGEMENT --------------------
    
    async saveDraft() {
        const mode = this.currentMode;
        
        // Get current user from Firebase Auth
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            UIManager.showToast('Please login to save drafts');
            return;
        }

        const draft = {
            id: generateId(),
            userId: currentUser.uid,
            userName: AppState.userName || currentUser.email || 'User',
            mode: mode,
            timestamp: Date.now(),
            date: new Date().toLocaleString('en-IN')
        };

        if (mode === 'purchase') {
            // Check for unsaved weight in input field
            const weightInput = document.getElementById('newWeight');
            const pendingWeight = parseFloat(weightInput?.value);
            if (pendingWeight && pendingWeight > 0) {
                weights.push(pendingWeight);
                weightInput.value = '';
                this.renderWeights();
            }

            if (billItems.length === 0 && weights.length === 0) {
                UIManager.showToast('No items or weights to save as draft');
                return;
            }
            draft.items = [...billItems];
            draft.weights = [...weights];
            draft.customerName = document.getElementById('customerName')?.value || '';
            draft.laborCharges = parseFloat(document.getElementById('manualLaborCharges')?.value || 0);
            draft.comments = document.getElementById('billComments')?.value || '';
            draft.billTotal = parseFloat(document.getElementById('billTotal')?.textContent || 0);
        } else {
            // Check for unsaved weight in input field
            const saleWeightInput = document.getElementById('saleWeight');
            const pendingSaleWeight = parseFloat(saleWeightInput?.value);
            if (pendingSaleWeight && pendingSaleWeight > 0) {
                saleWeights.push(pendingSaleWeight);
                saleWeightInput.value = '';
                this.renderSaleWeights();
            }

            if (saleItems.length === 0 && saleWeights.length === 0) {
                UIManager.showToast('No items or weights to save as draft');
                return;
            }
            draft.items = [...saleItems];
            draft.weights = [...saleWeights];
            draft.customerName = document.getElementById('saleCustomerName')?.value || '';
            draft.comments = document.getElementById('saleComments')?.value || '';
            draft.saleTotal = parseFloat(document.getElementById('saleTotal')?.textContent || 0);
        }

        try {
            // Save to Firestore
            await db.collection('drafts').doc(draft.id).set(draft);
            
            UIManager.showToast('✓ Draft saved to cloud!');
            UIManager.hapticFeedback('light');
            await this.updateDraftCount();

            // Clear current bill
            this.clearBill();
        } catch (error) {
            console.error('Failed to save draft:', error);
            UIManager.showToast('Failed to save draft');
        }
    },

    clearBill() {
        if (this.currentMode === 'purchase') {
            billItems = [];
            weights = [];
            this.renderBill();
            this.renderWeights();
            document.getElementById('customerName').value = '';
            document.getElementById('manualLaborCharges').value = '0';
            document.getElementById('billComments').value = '';
            document.getElementById('onlinePayment').value = '';
            document.getElementById('cashPayment').value = '';
            document.getElementById('dueAmount').value = '';
            document.getElementById('onlineCheckbox').checked = false;
            document.getElementById('cashCheckbox').checked = false;
            document.getElementById('dueCheckbox').checked = false;
        } else {
            saleItems = [];
            saleWeights = [];
            this.renderSalesBill();
            this.renderSaleWeights();
            document.getElementById('saleCustomerName').value = '';
            document.getElementById('saleComments').value = '';
            document.getElementById('saleOnlinePayment').value = '';
            document.getElementById('saleCashPayment').value = '';
            document.getElementById('saleDueAmount').value = '';
            document.getElementById('saleOnlineCheckbox').checked = false;
            document.getElementById('saleCashCheckbox').checked = false;
            document.getElementById('saleDueCheckbox').checked = false;
        }
        this.updateTotals();
        this.deleteAutoSave(); // Delete auto-save when clearing bill
    },

    async showDrafts() {
        const overlay = document.getElementById('draftsOverlay');
        const content = document.getElementById('draftsContent');

        try {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                content.innerHTML = '<p style="text-align: center; color: #888; padding: 40px;">Please login to view drafts</p>';
                overlay.classList.add('active');
                return;
            }

            // Load drafts from Firestore
            const snapshot = await db.collection('drafts')
                .where('userId', '==', currentUser.uid)
                .get();
            
            // Sort in memory instead of using orderBy to avoid index requirement
            const drafts = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            if (drafts.length === 0) {
                content.innerHTML = '<p style="text-align: center; color: #888; padding: 40px;">No saved drafts</p>';
            } else {
                content.innerHTML = drafts.map((draft) => `
                    <div class="history-item" style="margin-bottom: 12px;">
                        <div class="history-header">
                            <span style="font-weight: 600;">${draft.mode === 'purchase' ? '🔵 Purchase' : '🟢 Sale'} Draft</span>
                            <span style="color: #666; font-size: 14px;">${draft.items?.length || 0} items${draft.weights?.length > 0 ? ` + ${draft.weights.length} weights` : ''}</span>
                        </div>
                        <div class="history-date">${draft.date}</div>
                        ${draft.customerName ? `<div style="color: #666; font-size: 13px; margin-top: 4px;">Customer: ${draft.customerName}</div>` : ''}
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button onclick="window.app.billing.loadDraft('${draft.id}')" style="flex: 1; padding: 8px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
                                Load
                            </button>
                            <button onclick="window.app.billing.deleteDraft('${draft.id}')" style="flex: 1; padding: 8px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
                                Delete
                            </button>
                        </div>
                    </div>
                `).join('');
            }

            overlay.classList.add('active');
        } catch (error) {
            console.error('Failed to load drafts:', error);
            content.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 40px;">Failed to load drafts</p>';
            overlay.classList.add('active');
        }
    },

    closeDrafts() {
        document.getElementById('draftsOverlay').classList.remove('active');
    },

    async loadDraft(draftId) {
        try {
            // Load draft from Firestore
            const draftDoc = await db.collection('drafts').doc(draftId).get();
            
            if (!draftDoc.exists) {
                UIManager.showToast('Draft not found');
                return;
            }

            const draft = draftDoc.data();

            // Switch to correct mode
            this.switchMode(draft.mode);

            if (draft.mode === 'purchase') {
                billItems = draft.items || [];
                weights = draft.weights || [];
                this.renderBill();
                this.renderWeights();
                if (draft.customerName) document.getElementById('customerName').value = draft.customerName;
                if (draft.laborCharges) document.getElementById('manualLaborCharges').value = draft.laborCharges;
                if (draft.comments) document.getElementById('billComments').value = draft.comments;
            } else {
                saleItems = draft.items || [];
                saleWeights = draft.weights || [];
                this.renderSalesBill();
                this.renderSaleWeights();
                if (draft.customerName) document.getElementById('saleCustomerName').value = draft.customerName;
                if (draft.comments) document.getElementById('saleComments').value = draft.comments;
            }

            this.updateTotals();
            this.closeDrafts();

            // Delete the draft after loading
            await db.collection('drafts').doc(draftId).delete();
            await this.updateDraftCount();

            UIManager.showToast('✓ Draft loaded!');
            UIManager.hapticFeedback('light');
        } catch (error) {
            console.error('Failed to load draft:', error);
            UIManager.showToast('Failed to load draft');
        }
    },

    async deleteDraft(draftId) {
        try {
            await db.collection('drafts').doc(draftId).delete();
            await this.updateDraftCount();
            await this.showDrafts(); // Refresh the list
            UIManager.showToast('Draft deleted');
        } catch (error) {
            console.error('Failed to delete draft:', error);
            UIManager.showToast('Failed to delete draft');
        }
    },

    async updateDraftCount() {
        try {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) return;
            
            const snapshot = await db.collection('drafts')
                .where('userId', '==', currentUser.uid)
                .get();
            
            const countElement = document.getElementById('draftCount');
            if (countElement) {
                countElement.textContent = snapshot.size;
            }
        } catch (error) {
            console.error('Failed to update draft count:', error);
        }
    },

    // -------------------- AUTO-SAVE TO CLOUD --------------------

    triggerAutoSave() {
        if (!this.autoSaveEnabled) return;
        
        // Clear existing timer
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
        }
        
        // Set new timer
        autoSaveTimer = setTimeout(() => {
            this.autoSaveToCloud();
        }, AUTO_SAVE_DELAY);
    },

    async autoSaveToCloud() {
        try {
            if (!AppState.currentUser) return;
            
            const mode = this.currentMode;
            const hasPurchaseData = billItems.length > 0 || weights.length > 0 || document.getElementById('newWeight')?.value;
            const hasSaleData = saleItems.length > 0 || saleWeights.length > 0 || document.getElementById('saleWeight')?.value;
            
            if (!hasPurchaseData && !hasSaleData) {
                // No data to save, delete any existing auto-save
                await this.deleteAutoSave();
                return;
            }

            const autoSaveData = {
                userId: AppState.currentUser.uid,
                userName: AppState.userName,
                mode: mode, // Current active mode
                lastSaved: firebase.firestore.FieldValue.serverTimestamp(),
                deviceInfo: navigator.userAgent
            };

            // Save purchase data (regardless of current mode)
            autoSaveData.purchase = {
                items: billItems,
                weights: weights,
                typedWeight: document.getElementById('newWeight')?.value || '',
                selectedItem: document.getElementById('billItem')?.value || '',
                rate: document.getElementById('billRate')?.value || '',
                customerName: document.getElementById('customerName')?.value || '',
                laborCharges: parseFloat(document.getElementById('manualLaborCharges')?.value || 0),
                comments: document.getElementById('billComments')?.value || '',
                billTotal: parseFloat(document.getElementById('billTotal')?.textContent || 0)
            };

            // Save sale data (regardless of current mode)
            autoSaveData.sale = {
                items: saleItems,
                weights: saleWeights,
                typedWeight: document.getElementById('saleWeight')?.value || '',
                selectedItem: document.getElementById('saleItem')?.value || '',
                rate: document.getElementById('saleRate')?.value || '',
                customerName: document.getElementById('saleCustomerName')?.value || '',
                comments: document.getElementById('saleComments')?.value || '',
                saleTotal: parseFloat(document.getElementById('saleTotal')?.textContent || 0)
            };

            // Save to Firestore with user's UID as document ID
            await db.collection('autoSaves').doc(AppState.currentUser.uid).set(autoSaveData);
            
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    },

    async deleteAutoSave() {
        try {
            if (!AppState.currentUser) return;
            await db.collection('autoSaves').doc(AppState.currentUser.uid).delete();
        } catch (error) {
            // Ignore error if document doesn't exist
            if (error.code !== 'not-found') {
                console.error('Failed to delete auto-save:', error);
            }
        }
    },

    async checkAutoSave() {
        try {
            if (!AppState.currentUser) return;
            
            const autoSaveDoc = await db.collection('autoSaves').doc(AppState.currentUser.uid).get();
            
            if (!autoSaveDoc.exists) return;
            
            const autoSaveData = autoSaveDoc.data();
            
            // Show recovery prompt
            const shouldRecover = confirm(
                `Found an unsaved ${autoSaveData.mode === 'purchase' ? 'purchase' : 'sale'} bill from ${autoSaveData.lastSaved ? new Date(autoSaveData.lastSaved.toDate()).toLocaleString('en-IN') : 'earlier'}.\n\nDo you want to recover it?`
            );
            
            if (shouldRecover) {
                await this.recoverAutoSave(autoSaveData);
            } else {
                // User declined, delete the auto-save
                await this.deleteAutoSave();
            }
        } catch (error) {
            console.error('Failed to check auto-save:', error);
        }
    },

    async recoverAutoSave(autoSaveData) {
        try {
            // Switch to the last active mode FIRST
            if (autoSaveData.mode !== this.currentMode) {
                const modeBtn = autoSaveData.mode === 'purchase' 
                    ? document.getElementById('purchaseModeBtn')
                    : document.getElementById('saleModeBtn');
                if (modeBtn) {
                    this.switchMode(autoSaveData.mode, { currentTarget: modeBtn });
                }
            }
            
            // Small delay to ensure DOM is ready after mode switch
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Restore BOTH purchase and sale data (support both old and new format)
            
            // Restore purchase data
            const purchaseData = autoSaveData.purchase || (autoSaveData.mode === 'purchase' ? autoSaveData : {});
            if (purchaseData.items || purchaseData.weights || purchaseData.selectedItem || purchaseData.rate) {
                billItems = purchaseData.items || [];
                weights = purchaseData.weights || [];
                
                // Restore item selection first
                if (purchaseData.selectedItem) {
                    const itemSelect = document.getElementById('billItem');
                    if (itemSelect) {
                        itemSelect.value = purchaseData.selectedItem;
                        this.loadRates(); // Reload rates for selected item
                    }
                }
                
                // Then restore rate (after a small delay to ensure dropdown is loaded)
                setTimeout(() => {
                    if (purchaseData.rate) {
                        const rateInput = document.getElementById('billRate');
                        if (rateInput) {
                            rateInput.value = purchaseData.rate;
                        }
                    }
                }, 100);
                
                // Restore typed weight
                if (purchaseData.typedWeight) {
                    const weightInput = document.getElementById('newWeight');
                    if (weightInput) {
                        weightInput.value = purchaseData.typedWeight;
                    }
                }
                
                if (purchaseData.customerName) {
                    document.getElementById('customerName').value = purchaseData.customerName;
                }
                if (purchaseData.laborCharges) {
                    document.getElementById('manualLaborCharges').value = purchaseData.laborCharges;
                }
                if (purchaseData.comments) {
                    document.getElementById('billComments').value = purchaseData.comments;
                }
                
                // Render purchase data
                this.renderBill();
                this.renderWeights();
            }

            // Restore sale data
            const saleData = autoSaveData.sale || (autoSaveData.mode === 'sale' ? autoSaveData : {});
            if (saleData.items || saleData.weights || saleData.selectedItem || saleData.rate) {
                saleItems = saleData.items || [];
                saleWeights = saleData.weights || [];
                
                // Restore item selection first
                if (saleData.selectedItem) {
                    const saleItemSelect = document.getElementById('saleItem');
                    if (saleItemSelect) {
                        saleItemSelect.value = saleData.selectedItem;
                        this.loadSaleRates();
                    }
                }
                
                // Restore rate (after a small delay to ensure dropdown is loaded)
                setTimeout(() => {
                    if (saleData.rate) {
                        const saleRateInput = document.getElementById('saleRate');
                        if (saleRateInput) {
                            saleRateInput.value = saleData.rate;
                        }
                    }
                }, 100);
                
                // Restore typed weight
                if (saleData.typedWeight) {
                    const saleWeightInput = document.getElementById('saleWeight');
                    if (saleWeightInput) {
                        saleWeightInput.value = saleData.typedWeight;
                    }
                }
                
                if (saleData.customerName) {
                    document.getElementById('saleCustomerName').value = saleData.customerName;
                }
                if (saleData.comments) {
                    document.getElementById('saleComments').value = saleData.comments;
                }
                
                // Render sale data
                this.renderSalesBill();
                this.renderSaleWeights();
            }

            UIManager.showToast('✓ Bill recovered successfully!');
            UIManager.hapticFeedback('success');
            
        } catch (error) {
            console.error('Failed to recover auto-save:', error);
            UIManager.showToast('Failed to recover bill');
        }
    },

    // -------------------- EDIT BILL --------------------
    
    async editBill(billIndex, billType = 'purchase') {
        try {
            // Get bill from correct history based on type
            const history = billType === 'sale' ? AppState.salesHistory : AppState.billHistory;
            const bill = history[billIndex];
            if (!bill) {
                UIManager.showToast('Bill not found');
                return;
            }

            // Store the bill being edited
            this.editingBillIndex = billIndex;
            this.editingBillId = bill.id;
            this.editingBillType = billType;

            // Switch to appropriate mode
            const mode = billType === 'sale' ? 'sale' : 'purchase';
            if (this.currentMode !== mode) {
                const btn = mode === 'sale' ? document.getElementById('saleModeBtn') : document.getElementById('purchaseModeBtn');
                this.switchMode(mode, { currentTarget: btn });
            }

            // Close the bill details modal
            const overlay = document.getElementById('billDetailsOverlay');
            if (overlay) overlay.classList.remove('active');

            // Load bill data into form
            if (mode === 'purchase') {
                billItems = bill.items.map(item => ({ ...item }));
                weights = [];
                
                // Load customer details
                if (bill.customerName) {
                    document.getElementById('customerName').value = bill.customerName;
                }
                if (bill.comments) {
                    document.getElementById('billComments').value = bill.comments;
                }
                
                // Load labor charges
                if (bill.laborCharges) {
                    document.getElementById('manualLaborCharges').value = bill.laborCharges;
                }
                
                // Load payment details
                if (bill.payment) {
                    if (bill.payment.online > 0) {
                        document.getElementById('onlinePayment').value = bill.payment.online;
                        document.getElementById('onlineCheckbox').checked = true;
                    }
                    if (bill.payment.cash > 0) {
                        document.getElementById('cashPayment').value = bill.payment.cash;
                        document.getElementById('cashCheckbox').checked = true;
                    }
                    if (bill.payment.due > 0) {
                        document.getElementById('dueAmount').value = bill.payment.due;
                        document.getElementById('dueCheckbox').checked = true;
                    }
                }
                
                this.renderBill();
                this.updateTotals();
                
                // Navigate to billing tab
                window.app.nav.showTab('billing');
                
                UIManager.showToast('✏️ Editing bill - modify and save');
            } else {
                // Sale mode
                saleItems = bill.items.map(item => ({ ...item }));
                saleWeights = [];
                
                if (bill.customerName) {
                    document.getElementById('saleCustomerName').value = bill.customerName;
                }
                if (bill.comments) {
                    document.getElementById('saleComments').value = bill.comments;
                }
                
                if (bill.payment) {
                    if (bill.payment.online > 0) {
                        document.getElementById('saleOnlinePayment').value = bill.payment.online;
                        document.getElementById('saleOnlineCheckbox').checked = true;
                    }
                    if (bill.payment.cash > 0) {
                        document.getElementById('saleCashPayment').value = bill.payment.cash;
                        document.getElementById('saleCashCheckbox').checked = true;
                    }
                    if (bill.payment.due > 0) {
                        document.getElementById('saleDueAmount').value = bill.payment.due;
                        document.getElementById('saleDueCheckbox').checked = true;
                    }
                }
                
                this.renderSalesBill();
                this.updateSaleTotals();
                
                window.app.nav.showTab('billing');
                
                UIManager.showToast('✏️ Editing sale - modify and save');
            }
            
        } catch (error) {
            console.error('Failed to load bill for editing:', error);
            UIManager.showToast('Failed to load bill');
        }
    },

    async saveEditedBill() {
        try {
            if (this.editingBillIndex === undefined) {
                // Not in edit mode, proceed with normal save
                return this.currentMode === 'purchase' ? this.saveBillToHistory() : this.completeSale();
            }

            const billIndex = this.editingBillIndex;
            const billType = this.editingBillType || 'purchase';
            
            // Get bill from correct history based on type
            const history = billType === 'sale' ? AppState.salesHistory : AppState.billHistory;
            const bill = history[billIndex];
            
            if (!bill) {
                UIManager.showToast('Original bill not found');
                return;
            }

            if (this.currentMode === 'purchase') {
                // Update purchase bill
                const billTotal = parseFloat(document.getElementById('billTotal').textContent);
                const laborCharges = parseFloat(document.getElementById('manualLaborCharges')?.value || 0);
                const totalPackets = parseInt(document.getElementById('totalPacketsInBill').textContent);
                const grandTotal = parseFloat(document.getElementById('amountPayable').textContent);
                const onlinePayment = parseFloat(document.getElementById('onlinePayment')?.value || 0);
                const cashPayment = parseFloat(document.getElementById('cashPayment')?.value || 0);
                const dueAmount = parseFloat(document.getElementById('dueAmount')?.value || 0);
                const customerName = document.getElementById('customerName')?.value || '';
                const comments = document.getElementById('billComments')?.value || '';
                
                const laborCalculationSpan = document.getElementById('laborCalculation');
                const laborCalc = laborCalculationSpan?.textContent || null;

                const updatedBill = {
                    ...bill,
                    items: billItems,
                    billTotal,
                    laborCharges,
                    laborCalc,
                    totalPackets,
                    grandTotal,
                    amountPayable: grandTotal,
                    onlinePayment,
                    cashPayment,
                    dueAmount,
                    customerName,
                    comments,
                    payment: {
                        online: onlinePayment,
                        cash: cashPayment,
                        due: dueAmount,
                        total: onlinePayment + cashPayment + dueAmount
                    },
                    editedAt: new Date().toISOString(),
                    editedBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown'
                };

                await FirebaseService.updateBill(updatedBill);
                AppState.billHistory[billIndex] = updatedBill;
                
                // Recalculate stock after edit
                AppState.stock = await FirebaseService.calculateStock();
                
                // Update finance overview
                if (typeof window.app.finance?.calculateOverview === 'function') {
                    window.app.finance.calculateOverview();
                }
                
                // Update outstanding payments
                if (typeof window.app.outstanding?.renderDue === 'function') {
                    window.app.outstanding.renderDue();
                }
                
                UIManager.showToast('✓ Bill updated successfully!');
                
                // Clear editing state and form before returning
                this.editingBillIndex = undefined;
                this.editingBillId = undefined;
                this.editingBillType = undefined;
                this.clearBill();
                
                // Return updated bill for printing
                return updatedBill;
            } else {
                // Update sale
                const salesTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
                const totalPackets = saleItems.reduce((sum, item) => sum + (item.packets || 0), 0);
                const saleOnline = parseFloat(document.getElementById('saleOnlinePayment')?.value || 0);
                const saleCash = parseFloat(document.getElementById('saleCashPayment')?.value || 0);
                const saleDue = parseFloat(document.getElementById('saleDueAmount')?.value || 0);
                const saleCustomer = document.getElementById('saleCustomerName')?.value || '';
                const saleComments = document.getElementById('saleComments')?.value || '';

                const updatedSale = {
                    ...bill,
                    items: saleItems,
                    total: salesTotal,
                    saleTotal: salesTotal,
                    totalPackets: totalPackets,
                    onlinePayment: saleOnline,
                    cashPayment: saleCash,
                    dueAmount: saleDue,
                    customerName: saleCustomer,
                    comments: saleComments,
                    payment: {
                        online: saleOnline,
                        cash: saleCash,
                        due: saleDue,
                        total: saleOnline + saleCash + saleDue
                    },
                    editedAt: new Date().toISOString(),
                    editedBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown'
                };

                await FirebaseService.updateSale(updatedSale);
                const saleIndex = AppState.salesHistory.findIndex(s => s.id === bill.id);
                if (saleIndex !== -1) {
                    AppState.salesHistory[saleIndex] = updatedSale;
                }
                
                // Recalculate stock after edit
                AppState.stock = await FirebaseService.calculateStock();
                
                // Update finance overview
                if (typeof window.app.finance?.calculateOverview === 'function') {
                    window.app.finance.calculateOverview();
                }
                
                // Update outstanding payments
                if (typeof window.app.outstanding?.renderDue === 'function') {
                    window.app.outstanding.renderDue();
                }
                
                UIManager.showToast('✓ Sale updated successfully!');
                
                // Clear editing state and form before returning
                this.editingBillIndex = undefined;
                this.editingBillId = undefined;
                this.editingBillType = undefined;
                this.clearBill();
                
                // Return updated sale for printing
                return updatedSale;
            }

            // Navigate to history (this will only be reached if not printing)
            window.app.nav.showTab('history');
            window.app.history.render();
            
        } catch (error) {
            console.error('Failed to update bill:', error);
            UIManager.showToast('Failed to update bill: ' + error.message);
            throw error; // Re-throw to prevent printing on error
        }
    }
};

export { BillingManager };
