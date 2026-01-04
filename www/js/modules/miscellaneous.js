/**
 * @fileoverview Expenses Module
 * Handles business and personal expense tracking
 * Supports expense categorization, history, and receipt printing
 * @module modules/miscellaneous
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { Helpers } from '../utils/helpers.js';

/**
 * Expenses Manager - Manages expense operations
 * @class ExpensesManager
 */
export class ExpensesManager {
    /**
     * Update expense person autocomplete options
     * Extracts unique person names from expense history
     */
    static updateExpensePersonOptions() {
        const uniquePersons = [...new Set(
            AppState.expensesHistory
                .filter(p => p.personName && p.personName.trim() !== '')
                .map(p => p.personName)
        )];
        
        const businessDatalist = document.getElementById('businessExpensePersonOptions');
        if (businessDatalist) {
            businessDatalist.innerHTML = uniquePersons.map(name => `<option value="${name}">`).join('');
        }
        
        const personalDatalist = document.getElementById('personalExpensePersonOptions');
        if (personalDatalist) {
            personalDatalist.innerHTML = uniquePersons.map(name => `<option value="${name}">`).join('');
        }
    }

    /**
     * Filter between business and personal expense tabs
     * @param {'business'|'personal'} view - Tab to display
     * @param {Event} [evt] - Optional click event for button styling
     */
    static filterExpenseTab(view, evt) {
        const buttons = document.querySelectorAll('#expenses .filter-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (evt) evt.target.classList.add('active');
        
        const businessSection = document.getElementById('businessExpenseSection');
        const personalSection = document.getElementById('personalExpenseSection');
        
        if (view === 'business') {
            businessSection.style.display = 'block';
            personalSection.style.display = 'none';
        } else {
            businessSection.style.display = 'none';
            personalSection.style.display = 'block';
        }
    }

    /**
     * Save a business expense with loading indicator
     * Validates input, creates expense object, and saves to Firebase
     * @async
     * @returns {Promise<void>}
     */
    static async saveBusinessExpense() {
        const type = document.getElementById('businessExpenseType').value.trim();
        const personName = document.getElementById('businessExpensePerson').value.trim();
        const amount = Number(document.getElementById('businessExpenseAmount').value);
        const remarks = document.getElementById('businessExpenseRemarks').value.trim();

        if (!type) {
            UIManager.showModal('Please enter expense type');
            return;
        }

        if (!amount || amount <= 0) {
            UIManager.showModal('Please enter a valid amount');
            return;
        }

        const expense = {
            type,
            personName,
            amount,
            remarks,
            category: 'business',
            date: Helpers.getCurrentDateTime(),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        // Use withLoading for the Firebase operation
        await UIManager.withLoading(async () => {
            await FirebaseService.saveExpense(expense);
        });
        
        UIManager.hapticFeedback('medium');
        UIManager.showToast('✓ Business expense saved');
        
        document.getElementById('businessExpenseType').value = '';
        document.getElementById('businessExpensePerson').value = '';
        document.getElementById('businessExpenseAmount').value = '';
        document.getElementById('businessExpenseRemarks').value = '';
        
        if (window.app.finance && document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
            window.app.finance.calculateOverview();
        }
    }

    /**
     * Save a personal expense with loading indicator
     * Validates input, creates expense object, and saves to Firebase
     * @async
     * @returns {Promise<void>}
     */
    static async savePersonalExpense() {
        const type = document.getElementById('personalExpenseType').value.trim();
        const amount = Number(document.getElementById('personalExpenseAmount').value);
        const personName = document.getElementById('personalExpensePerson').value.trim();
        const remarks = document.getElementById('personalExpenseRemarks').value.trim();

        if (!type) {
            UIManager.showModal('Please enter expense type');
            return;
        }

        if (!amount || amount <= 0) {
            UIManager.showModal('Please enter a valid amount');
            return;
        }

        const expense = {
            type,
            personName,
            amount,
            remarks,
            category: 'personal',
            date: Helpers.getCurrentDateTime(),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        // Use withLoading for the Firebase operation
        await UIManager.withLoading(async () => {
            await FirebaseService.saveExpense(expense);
        });
        
        UIManager.hapticFeedback('medium');
        UIManager.showToast('✓ Personal expense saved');
        
        document.getElementById('personalExpenseType').value = '';
        document.getElementById('personalExpenseAmount').value = '';
        document.getElementById('personalExpensePerson').value = '';
        document.getElementById('personalExpenseRemarks').value = '';
        
        if (window.app.finance && document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
            window.app.finance.calculateOverview();
        }
    }

    /**
     * Render all expense history (business + personal)
     */
    static renderexpensesHistory() {
        this.renderBusinessExpenseHistory();
        this.renderPersonalExpenseHistory();
    }

    /**
     * Render business expense history list
     * Displays expense cards with hover effects
     */
    static renderBusinessExpenseHistory() {
        const container = document.getElementById('businessExpenseHistoryList');
        const businessExpenses = AppState.expensesHistory.filter(p => p.category === 'business' && p.id);
        
        if (businessExpenses.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No business expenses recorded yet</p>';
            return;
        }

        container.innerHTML = businessExpenses.map((payment, index) => `
            <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s ease;"
                 onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'; this.style.transform='translateY(-2px)'"
                 onmouseout="this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)'; this.style.transform='translateY(0)'"
                 onclick="window.app.expenses.viewExpenseDetails('${payment.id}', 'business')">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        ${payment.personName ? `<div style="font-weight: 600; font-size: 16px; color: #333;">${payment.personName}</div>` : ''}
                        <div style="font-size: 13px; color: #666; margin-top: 4px;">${payment.type}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 18px; font-weight: bold; color: #2c3e50;">₹${payment.amount}</div>
                    </div>
                </div>
                ${payment.remarks ? `<div style="font-size: 13px; color: #777; font-style: italic; margin-top: 8px;">📝 ${payment.remarks}</div>` : ''}
                <div style="font-size: 12px; color: #999; margin-top: 8px;">📅 ${payment.date}${payment.createdByName ? ` • By: ${payment.createdByName}` : ''}</div>
            </div>
        `).join('');
    }

    static renderPersonalExpenseHistory() {
        const container = document.getElementById('personalExpenseHistoryList');
        const personalExpenses = AppState.expensesHistory.filter(p => p.category === 'personal' && p.id);
        
        if (personalExpenses.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No personal expenses recorded yet</p>';
            return;
        }

        container.innerHTML = personalExpenses.map((payment, index) => `
            <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s ease;"
                 onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'; this.style.transform='translateY(-2px)'"
                 onmouseout="this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)'; this.style.transform='translateY(0)'"
                 onclick="window.app.expenses.viewExpenseDetails('${payment.id}', 'personal')">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        ${payment.personName ? `<div style="font-weight: 600; font-size: 16px; color: #333;">${payment.personName}</div>` : ''}
                        <div style="font-size: 13px; color: #666; margin-top: 4px;">${payment.type}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 18px; font-weight: bold; color: #2c3e50;">₹${payment.amount}</div>
                    </div>
                </div>
                ${payment.remarks ? `<div style="font-size: 13px; color: #777; font-style: italic; margin-top: 8px;">📝 ${payment.remarks}</div>` : ''}
                <div style="font-size: 12px; color: #999; margin-top: 8px;">📅 ${payment.date}${payment.createdByName ? ` • By: ${payment.createdByName}` : ''}</div>
            </div>
        `).join('');
    }

    static async printExpenseReceipt(expense) {
        // Always use PrinterService for consistent preview/print experience
        if (window.app && window.app.printer) {
            await window.app.printer.printExpense(expense);
        } else {
            UIManager.showToast('Printer service not available');
        }
    }

    static async saveAndPrintBusiness() {
        const type = document.getElementById('businessExpenseType').value.trim();
        const personName = document.getElementById('businessExpensePerson').value.trim();
        const amount = Number(document.getElementById('businessExpenseAmount').value);
        const remarks = document.getElementById('businessExpenseRemarks').value.trim();

        if (!type) {
            UIManager.showModal('Please enter expense type');
            return;
        }

        if (!amount || amount <= 0) {
            UIManager.showModal('Please enter a valid amount');
            return;
        }

        const expense = {
            type,
            personName,
            amount,
            remarks,
            category: 'business',
            date: Helpers.getCurrentDateTime(),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        await FirebaseService.saveExpense(expense);
        
        UIManager.hapticFeedback('medium');
        UIManager.showToast('✓ Business expense saved');
        
        document.getElementById('businessExpenseType').value = '';
        document.getElementById('businessExpensePerson').value = '';
        document.getElementById('businessExpenseAmount').value = '';
        document.getElementById('businessExpenseRemarks').value = '';
        
        if (window.app.finance && document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
            window.app.finance.calculateOverview();
        }

        // Print the expense
        this.printExpenseReceipt(expense);
    }

    static viewExpenseDetails(expenseId, category) {
        const expense = AppState.expensesHistory.find(p => p.id == expenseId && p.category === category);
        
        if (!expense) {
            UIManager.showToast('Expense not found');
            return;
        }

        // Store current expense for edit/delete operations
        window.currentExpenseId = String(expense.id);
        window.currentExpenseCategory = category;

        const content = `
            <div style="padding: 8px 0;">
                <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <div style="display: grid; gap: 12px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <div style="display: flex; align-items: center;">
                                <span style="font-size: 20px; margin-right: 12px;">🏷️</span>
                                <span style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Category</span>
                            </div>
                            <span style="font-size: 15px; color: #333; font-weight: 600; text-transform: capitalize;">${category}</span>
                        </div>
                        
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <div style="display: flex; align-items: center;">
                                <span style="font-size: 20px; margin-right: 12px;">📅</span>
                                <span style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Date</span>
                            </div>
                            <span style="font-size: 14px; color: #333; font-weight: 500;">${expense.date}</span>
                        </div>
                        
                        ${expense.createdByName ? `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <div style="display: flex; align-items: center;">
                                <span style="font-size: 20px; margin-right: 12px;">👨‍💼</span>
                                <span style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Created By</span>
                            </div>
                            <span style="font-size: 14px; color: #333; font-weight: 500;">${expense.createdByName}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #f0f0f0;">
                        <span style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Type</span>
                        <span style="font-size: 18px; font-weight: 600; color: #2c3e50;">${expense.type}</span>
                    </div>
                    
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #f0f0f0;">
                        <span style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Amount</span>
                        <span style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 1px;">₹${expense.amount}</span>
                    </div>
                    
                    ${expense.personName ? `
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Person Name</span>
                        <span style="font-size: 18px; font-weight: 500; color: #2c3e50;">👤 ${expense.personName}</span>
                    </div>
                    ` : ''}
                </div>
                
                ${expense.remarks ? `
                <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 8px;">
                    <div style="font-size: 11px; color: #856404; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">📝 Remarks</div>
                    <div style="font-size: 14px; color: #856404; line-height: 1.5;">${expense.remarks}</div>
                </div>
                ` : ''}
            </div>
        `;

        document.getElementById('expenseDetailsContent').innerHTML = content;
        document.getElementById('expenseDetailsOverlay').classList.add('active');
    }

    static closeExpenseDetails() {
        document.getElementById('expenseDetailsOverlay').classList.remove('active');
        window.currentExpenseId = null;
        window.currentExpenseCategory = null;
    }

    static editExpenseFromModal() {
        const expenseId = window.currentExpenseId;
        const category = window.currentExpenseCategory;
        
        if (!expenseId || !category) {
            UIManager.showToast('Expense not found');
            return;
        }

        this.closeExpenseDetails();
        this.editExpense(expenseId, category);
    }

    static async confirmDeleteExpense() {
        const expenseId = window.currentExpenseId;
        const category = window.currentExpenseCategory;
        
        if (!expenseId || !category) {
            UIManager.showToast('Expense not found');
            return;
        }

        // Show confirmation toast with action
        const confirmed = await new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
            
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 320px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);';
            dialog.innerHTML = `
                <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 12px;">Delete Expense</div>
                <div style="font-size: 14px; color: #666; margin-bottom: 24px;">Are you sure you want to delete this expense? This action cannot be undone.</div>
                <div style="display: flex; gap: 12px;">
                    <button id="cancelDelete" style="flex: 1; padding: 12px; border: 1px solid #ddd; background: white; border-radius: 8px; font-size: 14px; font-weight: 500; color: #666; cursor: pointer;">Cancel</button>
                    <button id="confirmDelete" style="flex: 1; padding: 12px; border: none; background: #dc3545; border-radius: 8px; font-size: 14px; font-weight: 500; color: white; cursor: pointer;">Delete</button>
                </div>
            `;
            
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            document.getElementById('cancelDelete').onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };
            
            document.getElementById('confirmDelete').onclick = () => {
                document.body.removeChild(overlay);
                resolve(true);
            };
            
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(false);
                }
            };
        });

        if (!confirmed) return;

        this.closeExpenseDetails();
        await this.deleteExpense(expenseId, category, false);
    }

    static async editExpense(expenseId, category) {
        const expense = AppState.expensesHistory.find(p => p.id == expenseId);
        if (!expense) {
            UIManager.showToast('Expense not found');
            return;
        }

        // Populate the form fields
        if (category === 'business') {
            document.getElementById('businessExpenseType').value = expense.type || '';
            document.getElementById('businessExpenseAmount').value = expense.amount || '';
            document.getElementById('businessExpensePerson').value = expense.personName || '';
            document.getElementById('businessExpenseRemarks').value = expense.remarks || '';
        } else {
            document.getElementById('personalExpenseType').value = expense.type || '';
            document.getElementById('personalExpenseAmount').value = expense.amount || '';
            document.getElementById('personalExpensePerson').value = expense.personName || '';
            document.getElementById('personalExpenseRemarks').value = expense.remarks || '';
        }

        // Delete the old expense
        await this.deleteExpense(expenseId, category, false);
        
        UIManager.showToast('Edit expense and save to update');
    }

    static async deleteExpense(expenseId, category, showConfirm = true) {
        if (!expenseId || expenseId === 'undefined') {
            console.error('Invalid expense ID:', expenseId);
            UIManager.showToast('Invalid expense ID');
            return;
        }
        
        if (showConfirm && !confirm('Are you sure you want to delete this expense?')) {
            return;
        }

        try {
            await FirebaseService.deleteExpense(String(expenseId));
            UIManager.hapticFeedback('medium');
            UIManager.showToast('✓ Expense deleted');
            
            if (window.app.finance && document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
                window.app.finance.calculateOverview();
            }
        } catch (error) {
            console.error('Error deleting expense:', error);
            UIManager.showToast('Failed to delete expense');
        }
    }

    static async saveAndPrintPersonal() {
        const type = document.getElementById('personalExpenseType').value.trim();
        const amount = Number(document.getElementById('personalExpenseAmount').value);
        const personName = document.getElementById('personalExpensePerson').value.trim();
        const remarks = document.getElementById('personalExpenseRemarks').value.trim();

        if (!type) {
            UIManager.showModal('Please enter expense type');
            return;
        }

        if (!amount || amount <= 0) {
            UIManager.showModal('Please enter a valid amount');
            return;
        }

        const expense = {
            type,
            personName,
            amount,
            remarks,
            category: 'personal',
            date: Helpers.getCurrentDateTime(),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        await FirebaseService.saveExpense(expense);
        
        UIManager.hapticFeedback('medium');
        UIManager.showToast('✓ Personal expense saved');
        
        document.getElementById('personalExpenseType').value = '';
        document.getElementById('personalExpenseAmount').value = '';
        document.getElementById('personalExpensePerson').value = '';
        document.getElementById('personalExpenseRemarks').value = '';
        
        if (window.app.finance && document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
            window.app.finance.calculateOverview();
        }

        // Print the expense
        this.printExpenseReceipt(expense);
    }
}
