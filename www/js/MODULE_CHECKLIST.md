# Module Creation Checklist

Use this checklist when creating each remaining module.

---

## 📋 Pre-Creation Checklist

- [ ] Identify all related functions in `script.js`
- [ ] List all dependencies (other modules, services)
- [ ] Note any global variables used
- [ ] Check for HTML elements that call these functions
- [ ] Review any localStorage or Firebase collections used

---

## 🔨 Module Creation Steps

### 1. Create Module File

- [ ] Create file in appropriate directory (`js/modules/`, `js/services/`, etc.)
- [ ] Add module header comment
- [ ] Create module object (e.g., `const BillingManager = {}`)

### 2. Extract Functions

- [ ] Copy relevant functions from `script.js`
- [ ] Convert to methods in module object
- [ ] Update `this` references if needed
- [ ] Replace direct state access with `AppState.xxx`

### 3. Update Dependencies

- [ ] Replace `showLoading()` with `UIManager.showLoading()`
- [ ] Replace `showToast()` with `UIManager.showToast()`
- [ ] Replace `showModal()` with `UIManager.showModal()`
- [ ] Use `FirebaseService` for database operations
- [ ] Use `AppState` for all global state

### 4. Export Module

- [ ] Add `window.ModuleName = ModuleName` at end
- [ ] Add backward compatibility exports for each function
- [ ] Example: `window.functionName = ModuleName.functionName.bind(ModuleName)`

### 5. Update HTML

- [ ] Add script tag to `index.html` in correct position
- [ ] Ensure it loads after dependencies
- [ ] Ensure it loads before `main.js`

### 6. Test Module

- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Test each function in the module
- [ ] Check console for errors
- [ ] Verify backward compatibility
- [ ] Test edge cases

### 7. Clean Up

- [ ] Remove extracted code from `script.js`
- [ ] Update any comments in `script.js`
- [ ] Document module in README.md
- [ ] Update MODULARIZATION_SUMMARY.md

---

## 🎯 Remaining Modules Priority List

### Priority 1: Core Business Logic

#### [ ] billing.js
**Location**: `js/modules/billing.js`
**Depends on**: AppState, UIManager, FirebaseService, PrinterService
**Functions to extract**:
- loadItemsDropdown()
- loadRates()
- handleRateChange()
- updateRateFromCustom()
- addWeight()
- renderWeights()
- removeWeight()
- clearWeights()
- addToBill()
- renderBill()
- deleteBillItem()
- updateTotals()
- updatePaymentTotal()
- fillPayableAmount()
- saveBillToHistory()
- saveBillOnly()
- saveBillDraft()
- restoreBillDraft()
- clearBillDraft()
- printBill()
- printViaWeb()
- updateCustomerOptions()
- toggleTransactionMode()
- updateModeUI()

**State used**: billItems, currentWeights, labourCharges, billHistory, transactionMode
**Collections**: bills

---

#### [ ] sales.js
**Location**: `js/modules/sales.js`
**Depends on**: AppState, UIManager, FirebaseService, PrinterService, StockManager
**Functions to extract**:
- loadSellItemDropdown()
- loadSalesPageDropdown()
- loadSellItemDetails()
- addToSalesBill()
- renderSalesBill()
- removeSalesItem()
- completeSale()
- renderSalesHistory()
- saveSaleToHistory()
- updateWholesaleCustomerOptions()
- updateSalePaymentTotal()
- fillSalePayableAmount()
- reprintSale()

**State used**: salesItems, salesHistory, stock
**Collections**: sales

---

#### [ ] stock.js
**Location**: `js/modules/stock.js`
**Depends on**: AppState, UIManager, FirebaseService
**Functions to extract**:
- updateStock()
- reduceStock()
- renderStock()
- loadAdjustItemStock()
- updateAdjustmentPlaceholder()
- applyStockAdjustment()
- renderAdjustmentHistory()
- filterStockTab()

**State used**: stock, stockAdjustments, items
**Collections**: stockAdjustments

---

### Priority 2: Financial Management

#### [ ] payments.js
**Location**: `js/modules/payments.js`
**Depends on**: AppState, UIManager, FirebaseService, PrinterService
**Functions to extract**:
- filterExpenseTab()
- saveBusinessExpense()
- savePersonalExpense()
- saveAndPrintBusinessExpense()
- saveAndPrintPersonalExpense()
- printExpenseReceipt()
- savePayment()
- saveAndPrintPayment()
- updatePaymentTypeOptions()
- printPaymentReceipt()
- clearPaymentForm()
- renderPaymentsHistory()
- renderBusinessExpenseHistory()
- renderPersonalExpenseHistory()
- reprintPayment()
- updateExpensePersonOptions()

**State used**: paymentsHistory
**Collections**: payments

---

#### [ ] finance.js
**Location**: `js/modules/finance.js`
**Depends on**: AppState, UIManager, FirebaseService
**Functions to extract**:
- filterFinanceTab()
- calculateFinanceOverview()
- renderAccountBreakdown()
- renderMonthlyProfitChart()
- renderFinanceTransactions()
- recordWithdrawal()
- renderWithdrawalHistory()
- updateWithdrawalPersonOptions()

**State used**: billHistory, salesHistory, paymentsHistory, withdrawalsHistory
**Collections**: withdrawals

---

### Priority 3: Reporting & Analytics

#### [ ] reports.js
**Location**: `js/modules/reports.js`
**Depends on**: AppState, UIManager, Chart.js
**Functions to extract**:
- setDateFilter()
- applyCustomDateFilter()
- filterBillsByDate()
- populateReportFilters()
- applyReportFilters()
- filterBillsByReportFilters()
- renderReports()
- renderItemWiseReport()
- renderPurchaseChart()
- getMostFrequentItem()
- exportToCSV()
- exportToPDF()

**State used**: billHistory, salesHistory, currentDateFilter, reportFilters
**Collections**: bills, sales

---

#### [ ] analytics.js
**Location**: `js/modules/analytics.js`
**Depends on**: AppState, UIManager, Chart.js
**Functions to extract**:
- filterAnalyticsTab()
- setAnalyticsPeriod()
- getFilteredData()
- renderAnalyticsOverview()
- renderDailyTrendChart()
- renderHealthScorecard()
- renderSalesAnalytics()
- renderSalesPurchasesChart()
- renderPaymentMethodsChart()
- renderItemsAnalytics()
- renderTopItemsList()
- renderItemProfitability()
- renderCustomersAnalytics()
- renderTopCustomers()
- renderTopSuppliers()
- renderPaymentBehavior()
- renderCustomerActivity()

**State used**: All transaction data
**Collections**: All collections for analytics

---

### Priority 4: Administration

#### [ ] users.js
**Location**: `js/modules/users.js`
**Depends on**: AppState, UIManager, FirebaseService
**Functions to extract**:
- loadUsers()
- renderPendingUsers()
- renderActiveUsers()
- approveUser()
- rejectUser()
- showChangeRoleDialog()
- changeUserRole()

**State used**: currentUser, userRole
**Collections**: users

---

#### [ ] settings.js
**Location**: `js/modules/settings.js`
**Depends on**: AppState, UIManager
**Functions to extract**:
- loadSettings()
- saveSettings()
- toggleDarkMode()
- clearAllData()
- toggleBluetoothPrinter()

**State used**: settings
**Storage**: localStorage

---

### Priority 5: Additional Features

#### [ ] outstanding.js
**Location**: `js/modules/outstanding.js`
**Depends on**: AppState, UIManager, FirebaseService
**Functions to extract**:
- filterDue()
- renderDue()
- filterSalesTab()
- renderSalesOutstanding()
- recordPayment()
- markSaleAsCleared()
- markOutstandingAsCleared()
- showOutstandingDetails()

**State used**: billHistory, salesHistory
**Collections**: bills, sales, payments

---

#### [ ] history.js
**Location**: `js/modules/history.js`
**Depends on**: AppState, UIManager
**Functions to extract**:
- renderHistory()
- reprintBill()
- reprintSale()
- closeBillDetails()
- editBillDetails()

**State used**: billHistory, salesHistory
**Collections**: bills, sales

---

#### [ ] whatsapp.js
**Location**: `js/modules/whatsapp.js`
**Depends on**: AppState, UIManager
**Functions to extract**:
- pickContactNumber()
- shareOnWhatsApp()

**State used**: customerPhoneNumber
**APIs**: Contacts API, Capacitor

---

#### [ ] chatbot.js
**Location**: `js/modules/chatbot.js`
**Depends on**: AppState, UIManager
**Functions to extract**:
- sendChatMessageFromTab()
- askChatbot()
- processChatMessage()

**State used**: None (self-contained)

---

## 📝 Module Template

```javascript
// -------------------- [MODULE NAME] --------------------

const [ModuleName]Manager = {
    // Module-specific state (if needed)
    localState: {},
    
    // Main functions
    functionOne() {
        // Use AppState for global state
        const items = AppState.items;
        
        // Use UIManager for UI
        UIManager.showLoading();
        
        // Use FirebaseService for DB
        await FirebaseService.saveItem(item);
        
        // Update UI
        UIManager.hideLoading();
        UIManager.showToast('Success!');
    },
    
    functionTwo() {
        // ...
    }
};

// Make module globally accessible
window.[ModuleName]Manager = [ModuleName]Manager;

// Backward compatibility exports
window.functionOne = [ModuleName]Manager.functionOne.bind([ModuleName]Manager);
window.functionTwo = [ModuleName]Manager.functionTwo.bind([ModuleName]Manager);
```

---

## ✅ Module Completion Checklist

After creating each module:

- [ ] All functions work as before
- [ ] No console errors
- [ ] Backward compatibility maintained
- [ ] Code removed from `script.js`
- [ ] Script tag added to `index.html`
- [ ] Documentation updated
- [ ] Tested on mobile (if applicable)
- [ ] Tested with different user roles
- [ ] Tested with real data

---

## 🎯 Estimated Time Per Module

- **Simple modules** (users, settings): 30-45 minutes
- **Medium modules** (stock, payments): 1-2 hours
- **Complex modules** (billing, sales, reports): 2-4 hours
- **Analytics module**: 3-5 hours (many charts)

**Total estimated time**: 15-25 hours for all remaining modules

---

## 💡 Tips

1. **Start Small**: Begin with users.js or settings.js (simplest)
2. **Test Often**: Test after each function extraction
3. **Keep Original**: Don't delete from script.js until tested
4. **Use Console**: Log everything during development
5. **Check HTML**: Update onclick handlers if needed
6. **Commit Often**: Git commit after each working module
7. **Document**: Add comments for complex logic

---

## 🚨 Common Pitfalls

❌ Forgetting to bind methods when exporting
❌ Not updating AppState references
❌ Loading scripts in wrong order
❌ Not testing backward compatibility
❌ Removing code from script.js too early
❌ Not checking for null/undefined
❌ Forgetting async/await
❌ Hard-coding values instead of using AppState

---

## 📊 Progress Tracking

Update this as you complete modules:

```
[✅] utils/constants.js
[✅] utils/state.js
[✅] utils/helpers.js
[✅] ui/ui-manager.js
[✅] ui/navigation.js
[✅] auth/authentication.js
[✅] firebase/firestore-service.js
[✅] modules/items.js
[✅] services/printer.js
[✅] main.js
[ ] modules/billing.js
[ ] modules/sales.js
[ ] modules/stock.js
[ ] modules/payments.js
[ ] modules/finance.js
[ ] modules/reports.js
[ ] modules/analytics.js
[ ] modules/users.js
[ ] modules/settings.js
[ ] modules/outstanding.js
[ ] modules/history.js
[ ] modules/whatsapp.js
[ ] modules/chatbot.js

Progress: 10/23 modules (43%)
```

---

Good luck with the modularization! 🚀
