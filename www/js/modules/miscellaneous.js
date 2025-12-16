// Payments & Expenses Module
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { FirebaseService } from '../firebase/firestore-service.js';

export class PaymentsManager {
    static updateExpensePersonOptions() {
        const uniquePersons = [...new Set(
            AppState.paymentsHistory
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

    static filterExpenseTab(view, evt) {
        const buttons = document.querySelectorAll('#payments .filter-btn');
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
            id: Date.now(),
            type,
            personName,
            amount,
            remarks,
            category: 'business',
            date: new Date().toLocaleString('en-IN'),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        await FirebaseService.savePayment(expense);
        
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
            id: Date.now(),
            type,
            personName,
            amount,
            remarks,
            category: 'personal',
            date: new Date().toLocaleString('en-IN'),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        await FirebaseService.savePayment(expense);
        
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

    static renderPaymentsHistory() {
        this.renderBusinessExpenseHistory();
        this.renderPersonalExpenseHistory();
    }

    static renderBusinessExpenseHistory() {
        const container = document.getElementById('businessExpenseHistoryList');
        const businessExpenses = AppState.paymentsHistory.filter(p => p.category === 'business');
        
        if (businessExpenses.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No business expenses recorded yet</p>';
            return;
        }

        container.innerHTML = businessExpenses.map(payment => `
            <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
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
        const personalExpenses = AppState.paymentsHistory.filter(p => p.category === 'personal');
        
        if (personalExpenses.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No personal expenses recorded yet</p>';
            return;
        }

        container.innerHTML = personalExpenses.map(payment => `
            <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
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
            id: Date.now(),
            type,
            personName,
            amount,
            remarks,
            category: 'business',
            date: new Date().toLocaleString('en-IN'),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        await FirebaseService.savePayment(expense);
        
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
            id: Date.now(),
            type,
            personName,
            amount,
            remarks,
            category: 'personal',
            date: new Date().toLocaleString('en-IN'),
            createdBy: AppState.currentUser ? AppState.currentUser.uid : 'unknown',
            createdByName: AppState.userName || (AppState.currentUser ? AppState.currentUser.email : 'Unknown')
        };

        await FirebaseService.savePayment(expense);
        
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
