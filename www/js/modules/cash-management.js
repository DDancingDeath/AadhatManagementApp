/**
 * @fileoverview Cash Management Module
 * Handles daily cash sessions, sign-in/out, transactions, and reconciliation
 * Tracks cash flow from sales, purchases, and expenses
 * @module modules/cash-management
 */

import { FirebaseService } from '../firebase/firestore-service.js';
import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { Helpers } from '../utils/helpers.js';

/**
 * Cash Management Manager - Manages daily cash operations
 * @class CashManagementManager
 */
export class CashManagementManager {
    /**
     * Current day's cash session
     * @type {Object|null}
     * @static
     */
    static todaySession = null;
    
    /**
     * Aggregated transactions for today
     * @type {{cashSales: number, cashPurchases: number, businessExpenses: number, personalExpenses: number, dueReceived: number, duePaid: number, cashDeposits: number}}
     * @static
     */
    static todayTransactions = {
        cashSales: 0,
        cashPurchases: 0,
        businessExpenses: 0,
        personalExpenses: 0,
        dueReceived: 0,
        duePaid: 0,
        cashDeposits: 0
    };

    /**
     * Initialize cash management module
     * Loads today's session, calculates transactions, and sets up UI
     * @async
     * @returns {Promise<void>}
     */
    static async init() {
        await UIManager.withLoading(async () => {
            // Load today's cash session
            await this.loadTodaySession();
            // Recalculate transactions to get latest data
            await this.calculateTodayTransactions();
        });
        this.updateUI();
        this.loadCustomerOptions();
        this.renderHistory();
        
        // Listen for cash amount input changes for validation
        const signOutInput = document.getElementById('cashSignOutAmount');
        if (signOutInput) {
            signOutInput.addEventListener('input', () => this.validateSignOut());
        }
        
        // Listen for transaction type changes
        const transactionType = document.getElementById('cashTransactionType');
        if (transactionType) {
            transactionType.addEventListener('change', () => this.updateTransactionForm());
        }
        
        // Initialize form state (hide customer name for default "Cash Added")
        this.updateTransactionForm();
    }
    
    /**
     * Update form fields based on transaction type
     * Shows/hides customer name field and updates labels
     */
    static updateTransactionForm() {
        const type = document.getElementById('cashTransactionType').value;
        const amountLabel = document.getElementById('amountLabel');
        const notesLabel = document.getElementById('notesLabel');
        const customerNameRow = document.getElementById('customerNameRow');
        
        if (type === 'deposit') {
            // Cash deposit - hide customer name
            if (customerNameRow) customerNameRow.style.display = 'none';
            if (amountLabel) amountLabel.textContent = 'Amount Added (₹):';
            if (notesLabel) notesLabel.textContent = 'Reason (Optional):';
        } else if (type === 'paid') {
            // Payment to supplier - show customer name
            if (customerNameRow) customerNameRow.style.display = 'block';
            if (amountLabel) amountLabel.textContent = 'Amount Paid (₹):';
            if (notesLabel) notesLabel.textContent = 'Notes (Optional):';
        } else {
            // Payment from customer - show customer name
            if (customerNameRow) customerNameRow.style.display = 'block';
            if (amountLabel) amountLabel.textContent = 'Amount Received (₹):';
            if (notesLabel) notesLabel.textContent = 'Notes (Optional):';
        }
    }

    /**
     * Load today's cash session from Firebase
     * Finds session matching today's date (YYYY-MM-DD format)
     * @async
     * @returns {Promise<void>}
     */
    static async loadTodaySession() {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const sessions = await FirebaseService.loadCashSessions();
            
            this.todaySession = sessions.find(s => s.date === today);
            
            if (this.todaySession) {
                // Session exists - calculate transactions
                await this.calculateTodayTransactions();
            }
        } catch (error) {
            console.error('Error loading cash session:', error);
        }
    }

    /**
     * Calculate all cash transactions for today
     * Aggregates sales, purchases, expenses, and due payments
     * @async
     * @returns {Promise<void>}
     */
    static async calculateTodayTransactions() {
        const today = new Date().toISOString().split('T')[0];
        const todayStart = new Date(today).getTime();
        const todayEnd = todayStart + (24 * 60 * 60 * 1000);

        // Reset transactions
        this.todayTransactions = {
            cashSales: 0,
            cashPurchases: 0,
            businessExpenses: 0,
            personalExpenses: 0,
            dueReceived: 0,
            duePaid: 0,
            cashDeposits: 0
        };

        // Calculate cash sales
        const sales = AppState.salesHistory || [];
        sales.forEach(sale => {
            const saleTime = new Date(sale.date).getTime();
            if (saleTime >= todayStart && saleTime < todayEnd && sale.payment?.cash > 0) {
                this.todayTransactions.cashSales += sale.payment.cash;
            }
        });

        // Calculate cash purchases
        const bills = AppState.billHistory || [];
        bills.forEach(bill => {
            const billTime = new Date(bill.date).getTime();
            if (billTime >= todayStart && billTime < todayEnd && bill.payment?.cash > 0) {
                this.todayTransactions.cashPurchases += bill.payment.cash;
            }
        });

        // Calculate cash expenses
        const payments = AppState.expensesHistory || [];
        payments.forEach(payment => {
            // Parse Indian locale date format: "28/12/2025, 7:55:07 pm"
            let paymentTime;
            if (payment.date && payment.date.includes('/')) {
                // Convert "28/12/2025, 7:55:07 pm" to Date object
                const [datePart, timePart] = payment.date.split(', ');
                const [day, month, year] = datePart.split('/');
                
                // Parse time with AM/PM
                const timeMatch = timePart.match(/(\d+):(\d+):(\d+)\s*(am|pm)/i);
                if (timeMatch) {
                    let [_, hours, minutes, seconds, period] = timeMatch;
                    hours = parseInt(hours);
                    if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                    if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
                    
                    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hours, parseInt(minutes), parseInt(seconds));
                    paymentTime = dateObj.getTime();
                } else {
                    paymentTime = NaN;
                }
            } else {
                paymentTime = new Date(payment.date).getTime();
            }
            
            // Separate business and personal expenses
            if (!isNaN(paymentTime) && paymentTime >= todayStart && paymentTime < todayEnd) {
                const amount = payment.amount || 0;
                if (payment.type === 'Personal') {
                    this.todayTransactions.personalExpenses += amount;
                } else {
                    // All other types are business expenses
                    this.todayTransactions.businessExpenses += amount;
                }
            }
        });

        // Get due payments from today's session
        if (this.todaySession && this.todaySession.duePayments) {
            this.todaySession.duePayments.forEach(payment => {
                if (payment.method === 'cash') {
                    if (payment.type === 'paid') {
                        // Payment paid to supplier (cash out)
                        this.todayTransactions.duePaid += payment.amount;
                    } else {
                        // Payment received from customer (cash in)
                        this.todayTransactions.dueReceived += payment.amount;
                    }
                }
            });
        }

        // Get cash deposits from today's session
        if (this.todaySession && this.todaySession.cashDeposits) {
            this.todaySession.cashDeposits.forEach(deposit => {
                this.todayTransactions.cashDeposits += deposit.amount;
            });
        }
    }

    static updateUI() {
        const signInSection = document.getElementById('cashSignInSection');
        const signOutSection = document.getElementById('cashSignOutSection');
        const cashDepositSection = document.getElementById('cashDepositSection');
        const cashStatusCard = document.getElementById('cashStatusCard');

        if (this.todaySession) {
            // Session exists
            if (this.todaySession.signedOut) {
                // Already signed out - show sign in for dev (normally would hide)
                signInSection.style.display = 'block'; // Dev: always show sign in
                signOutSection.style.display = 'none';
                cashDepositSection.style.display = 'none';
                if (cashStatusCard) cashStatusCard.style.display = 'block';
                
                this.updateStatusCard();
            } else {
                // Signed in but not signed out
                signInSection.style.display = 'none';
                signOutSection.style.display = 'block';
                cashDepositSection.style.display = 'block';
                if (cashStatusCard) cashStatusCard.style.display = 'block';
                
                this.updateStatusCard();
                this.updateSignOutSummary();
            }
        } else {
            // No session - show sign in with empty status
            signInSection.style.display = 'block';
            signOutSection.style.display = 'none';
            cashDepositSection.style.display = 'none';
            if (cashStatusCard) cashStatusCard.style.display = 'block';
            
            this.updateStatusCard();
        }
    }

    static updateStatusCard() {
        const statusOpeningBalance = document.getElementById('statusOpeningBalance');
        const statusCashIn = document.getElementById('statusCashIn');
        const statusCashOut = document.getElementById('statusCashOut');
        const statusAvailable = document.getElementById('statusAvailable');
        const statusCashAdded = document.getElementById('statusCashAdded');
        const statusBuy = document.getElementById('statusBuy');
        const statusSale = document.getElementById('statusSale');
        const statusOthers = document.getElementById('statusOthers');
        const statusExpected = document.getElementById('statusExpected');
        const statusActual = document.getElementById('statusActual');
        const statusDiff = document.getElementById('statusDiff');
        
        // Card containers for show/hide
        const statusOpeningCard = document.getElementById('statusOpeningCard');
        const statusCashInCard = document.getElementById('statusCashInCard');
        const statusCashOutCard = document.getElementById('statusCashOutCard');
        const statusAvailableCard = document.getElementById('statusAvailableCard');
        const statusCashAddedCard = document.getElementById('statusCashAddedCard');
        const statusBuyCard = document.getElementById('statusBuyCard');
        const statusSaleCard = document.getElementById('statusSaleCard');
        const statusOthersCard = document.getElementById('statusOthersCard');
        const statusExpectedCard = document.getElementById('statusExpectedCard');
        const statusActualCard = document.getElementById('statusActualCard');
        const statusDiffCard = document.getElementById('statusDiffCard');

        if (!this.todaySession) {
            // No session - show 4 blocks with zeros
            if (statusOpeningCard) statusOpeningCard.style.display = 'block';
            if (statusCashInCard) statusCashInCard.style.display = 'block';
            if (statusCashOutCard) statusCashOutCard.style.display = 'block';
            if (statusAvailableCard) statusAvailableCard.style.display = 'block';
            if (statusCashAddedCard) statusCashAddedCard.style.display = 'none';
            if (statusBuyCard) statusBuyCard.style.display = 'none';
            if (statusSaleCard) statusSaleCard.style.display = 'none';
            if (statusOthersCard) statusOthersCard.style.display = 'none';
            if (statusExpectedCard) statusExpectedCard.style.display = 'none';
            if (statusActualCard) statusActualCard.style.display = 'none';
            if (statusDiffCard) statusDiffCard.style.display = 'none';
            
            if (statusOpeningBalance) statusOpeningBalance.textContent = '₹0';
            if (statusCashIn) statusCashIn.textContent = '₹0';
            if (statusCashOut) statusCashOut.textContent = '₹0';
            if (statusAvailable) statusAvailable.textContent = '₹0';
            return;
        }

        const opening = this.todaySession.openingBalance || 0;
        const cashAdded = this.todayTransactions.cashDeposits || 0;
        const purchases = this.todayTransactions.cashPurchases || 0;
        const sales = this.todayTransactions.cashSales || 0;
        const dueReceived = this.todayTransactions.dueReceived || 0;
        const totalExpenses = (this.todayTransactions.businessExpenses || 0) + (this.todayTransactions.personalExpenses || 0);
        const duePaid = this.todayTransactions.duePaid || 0;
        const others = totalExpenses + duePaid;
        const expected = this.calculateExpectedCash();
        
        // Calculate totals for 4-block view
        const totalCashIn = cashAdded + sales + dueReceived;
        const totalCashOut = purchases + duePaid + totalExpenses;
        const availableCash = opening + totalCashIn - totalCashOut;

        if (this.todaySession.signedOut) {
            // Signed out - show Opening Balance + 7 other blocks
            if (statusOpeningCard) statusOpeningCard.style.display = 'block';
            if (statusCashInCard) statusCashInCard.style.display = 'none';
            if (statusCashOutCard) statusCashOutCard.style.display = 'none';
            if (statusAvailableCard) statusAvailableCard.style.display = 'none';
            if (statusCashAddedCard) statusCashAddedCard.style.display = 'block';
            if (statusBuyCard) statusBuyCard.style.display = 'block';
            if (statusSaleCard) statusSaleCard.style.display = 'block';
            if (statusOthersCard) statusOthersCard.style.display = 'block';
            if (statusExpectedCard) statusExpectedCard.style.display = 'block';
            if (statusActualCard) statusActualCard.style.display = 'block';
            if (statusDiffCard) statusDiffCard.style.display = 'block';
            
            const actual = this.todaySession.closingBalance || 0;
            const diff = actual - expected;
            const absDiff = Math.abs(diff);
            
            // Color coding for difference amount
            let diffColor = '#22c55e'; // green for < 50
            if (absDiff >= 500) diffColor = '#ef4444'; // red for >= 500
            else if (absDiff >= 50) diffColor = '#f59e0b'; // orange for >= 50
            
            if (statusOpeningBalance) statusOpeningBalance.textContent = `₹${opening}`;
            if (statusCashAdded) statusCashAdded.textContent = `₹${cashAdded}`;
            if (statusBuy) statusBuy.textContent = `₹${purchases}`;
            if (statusSale) statusSale.textContent = `₹${sales}`;
            if (statusOthers) statusOthers.textContent = `₹${others}`;
            if (statusExpected) statusExpected.textContent = `₹${expected}`;
            if (statusActual) statusActual.textContent = `₹${actual}`;
            if (statusDiff) {
                statusDiff.textContent = `${diff >= 0 ? '+' : ''}₹${diff.toFixed(2)}`;
                statusDiff.style.color = diffColor;
            }
        } else {
            // Ongoing session - show 4 blocks
            if (statusOpeningCard) statusOpeningCard.style.display = 'block';
            if (statusCashInCard) statusCashInCard.style.display = 'block';
            if (statusCashOutCard) statusCashOutCard.style.display = 'block';
            if (statusAvailableCard) statusAvailableCard.style.display = 'block';
            if (statusCashAddedCard) statusCashAddedCard.style.display = 'none';
            if (statusBuyCard) statusBuyCard.style.display = 'none';
            if (statusSaleCard) statusSaleCard.style.display = 'none';
            if (statusOthersCard) statusOthersCard.style.display = 'none';
            if (statusExpectedCard) statusExpectedCard.style.display = 'none';
            if (statusActualCard) statusActualCard.style.display = 'none';
            if (statusDiffCard) statusDiffCard.style.display = 'none';
            
            if (statusOpeningBalance) statusOpeningBalance.textContent = `₹${opening}`;
            if (statusCashIn) statusCashIn.textContent = `₹${totalCashIn}`;
            if (statusCashOut) statusCashOut.textContent = `₹${totalCashOut}`;
            if (statusAvailable) statusAvailable.textContent = `₹${availableCash}`;
        }
    }

    static calculateExpectedCash() {
        if (!this.todaySession) return 0;
        
        const opening = this.todaySession?.openingBalance || 0;
        const sales = this.todayTransactions.cashSales || 0;
        const purchases = this.todayTransactions.cashPurchases || 0;
        const businessExpenses = this.todayTransactions.businessExpenses || 0;
        const personalExpenses = this.todayTransactions.personalExpenses || 0;
        const dueReceived = this.todayTransactions.dueReceived || 0;
        const duePaid = this.todayTransactions.duePaid || 0;
        const deposits = this.todayTransactions.cashDeposits || 0;
        
        return opening + sales - purchases - businessExpenses - personalExpenses + dueReceived + deposits - duePaid;
    }

    static updateSignOutSummary() {
        const openingBalanceEl = document.getElementById('openingBalanceTotal');
        const cashSalesEl = document.getElementById('cashSalesTotal');
        const cashPurchasesEl = document.getElementById('cashPurchasesTotal');
        const businessExpensesEl = document.getElementById('cashBusinessExpensesTotal');
        const personalExpensesEl = document.getElementById('cashPersonalExpensesTotal');
        const dueReceivedEl = document.getElementById('dueReceivedTotal');
        const duePaidEl = document.getElementById('duePaidTotal');
        const cashDepositsEl = document.getElementById('cashDepositsTotal');
        const totalCashInEl = document.getElementById('totalCashIn');
        const totalCashOutEl = document.getElementById('totalCashOut');
        const expectedCashEl = document.getElementById('expectedCashAmount');
        
        const opening = this.todaySession?.openingBalance || 0;
        const sales = this.todayTransactions.cashSales || 0;
        const purchases = this.todayTransactions.cashPurchases || 0;
        const businessExpenses = this.todayTransactions.businessExpenses || 0;
        const personalExpenses = this.todayTransactions.personalExpenses || 0;
        const dueReceived = this.todayTransactions.dueReceived || 0;
        const duePaid = this.todayTransactions.duePaid || 0;
        const deposits = this.todayTransactions.cashDeposits || 0;
        
        const totalCashIn = opening + sales + dueReceived + deposits;
        const totalCashOut = purchases + duePaid + businessExpenses + personalExpenses;
        
        if (openingBalanceEl) openingBalanceEl.textContent = `₹${opening}`;
        if (cashSalesEl) cashSalesEl.textContent = `₹${sales}`;
        if (cashPurchasesEl) cashPurchasesEl.textContent = `₹${purchases}`;
        if (businessExpensesEl) businessExpensesEl.textContent = `₹${businessExpenses}`;
        if (personalExpensesEl) personalExpensesEl.textContent = `₹${personalExpenses}`;
        if (dueReceivedEl) dueReceivedEl.textContent = `₹${dueReceived}`;
        if (duePaidEl) duePaidEl.textContent = `₹${duePaid}`;
        if (cashDepositsEl) cashDepositsEl.textContent = `₹${deposits}`;
        if (totalCashInEl) totalCashInEl.textContent = `₹${totalCashIn}`;
        if (totalCashOutEl) totalCashOutEl.textContent = `₹${totalCashOut}`;
        
        const expected = this.calculateExpectedCash();
        if (expectedCashEl) expectedCashEl.textContent = `₹${expected}`;
    }

    static validateSignOut() {
        const actualAmount = Helpers.getInputInt('cashSignOutAmount');
        const expected = this.calculateExpectedCash();
        const difference = actualAmount - expected;
        
        const alertDiv = document.getElementById('cashDifferenceAlert');
        if (alertDiv && actualAmount > 0) {
            if (Math.abs(difference) < 1) {
                alertDiv.style.display = 'block';
                alertDiv.style.background = '#d1f4e0';
                alertDiv.style.color = '#0f5132';
                alertDiv.textContent = '✓ Cash matches expected amount!';
            } else if (difference > 0) {
                alertDiv.style.display = 'block';
                alertDiv.style.background = '#fff3cd';
                alertDiv.style.color = '#997404';
                alertDiv.textContent = `⚠ Extra ₹${Math.abs(difference).toFixed(2)} - Please verify`;
            } else {
                alertDiv.style.display = 'block';
                alertDiv.style.background = '#f8d7da';
                alertDiv.style.color = '#842029';
                alertDiv.textContent = `⚠ Short ₹${Math.abs(difference).toFixed(2)} - Please verify`;
            }
        } else if (alertDiv) {
            alertDiv.style.display = 'none';
        }
    }

    static async signIn() {
        const amount = Helpers.getInputInt('cashSignInAmount');

        if (!amount || amount < 0) {
            UIManager.showToast('Please enter a valid opening amount');
            return;
        }

        try {
            // Check if yesterday's closing matches today's opening
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayDate = yesterday.toISOString().split('T')[0];
            
            const sessions = await FirebaseService.loadCashSessions();
            const yesterdaySession = sessions.find(s => s.date === yesterdayDate);
            
            if (yesterdaySession && yesterdaySession.signedOut) {
                const diff = Math.abs(yesterdaySession.closingBalance - amount);
                if (diff > 1) {
                    const confirmed = await UIManager.showModal(
                        `Yesterday's closing was ₹${yesterdaySession.closingBalance}, but you're signing in with ₹${amount}.\nDifference: ₹${diff.toFixed(2)}\n\nDo you want to continue?`,
                        'Cash Mismatch Warning',
                        true
                    );
                    if (!confirmed) return;
                }
            }

            const session = {
                id: Helpers.generateId(),
                date: new Date().toISOString().split('T')[0],
                openingBalance: amount,
                signInTime: new Date().toISOString(),
                userId: AppState.currentUser?.uid || 'unknown',
                userName: AppState.userName || 'Unknown',
                signedOut: false,
                duePayments: []
            };

            await FirebaseService.saveCashSession(session);
            this.todaySession = session;
            await this.calculateTodayTransactions();
            this.updateUI();
            this.renderHistory();
            
            UIManager.showToast('✓ Cash signed in successfully!');
            
            // Clear inputs
            document.getElementById('cashSignInAmount').value = '';
        } catch (error) {
            console.error('Sign in error:', error);
            UIManager.showToast('Failed to sign in: ' + error.message);
        }
    }

    static async signOut() {
        const actualAmount = Helpers.getInputInt('cashSignOutAmount');

        if (!actualAmount || actualAmount < 0) {
            UIManager.showToast('Please enter the actual cash amount');
            return;
        }

        const expected = this.calculateExpectedCash();
        const difference = actualAmount - expected;

        // Confirm if there's a difference
        if (Math.abs(difference) > 1) {
            const message = difference > 0 
                ? `You have ₹${Math.abs(difference).toFixed(2)} EXTRA cash.\n\nExpected: ₹${expected}\nActual: ₹${actualAmount}\n\nProceed with sign out?`
                : `You are SHORT by ₹${Math.abs(difference).toFixed(2)}.\n\nExpected: ₹${expected}\nActual: ₹${actualAmount}\n\nProceed with sign out?`;
            
            const confirmed = await UIManager.showModal(message, 'Confirm Sign Out', true);
            if (!confirmed) return;
        }

        const updatedSession = {
            ...this.todaySession,
            closingBalance: actualAmount,
            expectedBalance: expected,
            difference: difference,
            signOutTime: new Date().toISOString(),
            signedOut: true,
            transactions: {
                cashSales: this.todayTransactions.cashSales,
                cashPurchases: this.todayTransactions.cashPurchases,
                businessExpenses: this.todayTransactions.businessExpenses,
                personalExpenses: this.todayTransactions.personalExpenses,
                dueReceived: this.todayTransactions.dueReceived,
                duePaid: this.todayTransactions.duePaid,
                cashDeposits: this.todayTransactions.cashDeposits
            }
        };

        try {
            await FirebaseService.updateCashSession(updatedSession);
            this.todaySession = updatedSession;
            this.updateUI();
            this.renderHistory();
            
            UIManager.showToast('✓ Cash signed out successfully!');
            
            // Clear inputs
            document.getElementById('cashSignOutAmount').value = '';
        } catch (error) {
            console.error('Sign out error:', error);
            UIManager.showToast('Failed to sign out: ' + error.message);
        }
    }

    static async recordTransaction() {
        const type = Helpers.getInputText('cashTransactionType');
        const amount = Helpers.getInputInt('transactionAmount');
        const notes = Helpers.getInputText('transactionNotes');

        if (!amount || amount <= 0) {
            UIManager.showToast('Please enter a valid amount');
            return;
        }

        if (!this.todaySession || this.todaySession.signedOut) {
            UIManager.showToast('Please sign in first');
            return;
        }

        if (type === 'deposit') {
            // Cash deposit
            const deposit = {
                id: Helpers.generateId(),
                amount: amount,
                reason: notes,
                timestamp: new Date().toISOString(),
                addedBy: AppState.userName || 'Unknown'
            };

            const updatedSession = {
                ...this.todaySession,
                cashDeposits: [...(this.todaySession.cashDeposits || []), deposit]
            };

            try {
                await FirebaseService.updateCashSession(updatedSession);
                this.todaySession = updatedSession;
                await this.calculateTodayTransactions();
                this.updateUI();
                this.renderHistory();
                
                UIManager.showToast(`✓ Added ₹${amount} to cash drawer`);
                
                // Clear inputs
                document.getElementById('transactionAmount').value = '';
                document.getElementById('transactionNotes').value = '';
            } catch (error) {
                console.error('Add deposit error:', error);
                UIManager.showToast('Failed to add deposit: ' + error.message);
            }
        } else {
            // Due payment (received or paid)
            const partyName = document.getElementById('partyName')?.value || 'N/A';

            const payment = {
                id: Helpers.generateId(),
                type: type, // 'received' or 'paid'
                customer: partyName,
                amount: amount,
                method: 'cash', // All cash transactions
                notes: notes,
                timestamp: new Date().toISOString(),
                recordedBy: AppState.userName || 'Unknown'
            };

            const updatedSession = {
                ...this.todaySession,
                duePayments: [...(this.todaySession.duePayments || []), payment]
            };

            try {
                await FirebaseService.updateCashSession(updatedSession);
                this.todaySession = updatedSession;
                await this.calculateTodayTransactions();
                this.updateUI();
                this.renderHistory();
                
                const action = type === 'paid' ? 'paid to' : 'received from';
                UIManager.showToast(`✓ Recorded ₹${amount} ${action} ${partyName}`);
                
                // Clear inputs
                document.getElementById('partyName').value = '';
                document.getElementById('transactionAmount').value = '';
                document.getElementById('transactionNotes').value = '';
            } catch (error) {
                console.error('Record payment error:', error);
                UIManager.showToast('Failed to record payment: ' + error.message);
            }
        }
    }

    static loadCustomerOptions() {
        const datalist = document.getElementById('customerOptionsForDue');
        if (!datalist) return;

        const customers = new Set();
        
        // Get customers from bill history
        AppState.billHistory?.forEach(bill => {
            if (bill.customerName) customers.add(bill.customerName);
        });
        
        // Get customers from sales history
        AppState.salesHistory?.forEach(sale => {
            if (sale.customerName) customers.add(sale.customerName);
        });

        datalist.innerHTML = Array.from(customers)
            .sort()
            .map(name => `<option value="${name}">`)
            .join('');
    }

    static async renderHistory() {
        const container = document.getElementById('cashHistoryList');
        if (!container) return;

        try {
            const sessions = await FirebaseService.loadCashSessions();
            
            // Sort by date descending
            sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (sessions.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No cash management history</p>';
            return;
        }

        container.innerHTML = sessions.map(session => {
            const date = new Date(session.date).toLocaleDateString('en-IN', { 
                weekday: 'short', 
                day: 'numeric', 
                month: 'short' 
            });
            
            const status = session.signedOut 
                ? '<span style="color: #6c757d;">✓ Closed</span>' 
                : '<span style="color: #22c55e; font-weight: 600;">● Active</span>';
            
            const diff = session.difference || 0;
            const absDiff = Math.abs(diff);
            let diffColor;
            if (absDiff < 50) {
                diffColor = '#22c55e'; // Green for small differences
            } else if (absDiff < 500) {
                diffColor = '#f59e0b'; // Yellow for medium differences
            } else {
                diffColor = '#ef4444'; // Red for large differences
            }
            const diffText = absDiff < 1 ? 'Matched' : (diff > 0 ? `+₹${diff.toFixed(2)}` : `-₹${Math.abs(diff).toFixed(2)}`);

            return `
                <div onclick="window.app.cashManagement.showDetails('${session.date}')" style="border-bottom: 1px solid #e5e7eb; padding: 12px 0; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="font-size: 15px;">${date}</strong>
                        ${status}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px; color: #6c757d;">
                        <div>Opening: <strong>₹${session.openingBalance}</strong></div>
                        ${session.signedOut ? `
                            <div>Closing: <strong>₹${session.closingBalance}</strong></div>
                            <div>Expected: <strong>₹${session.expectedBalance || 0}</strong></div>
                            <div>Diff: <strong style="color: ${diffColor};">${diffText}</strong></div>
                            ` : '<div>In Progress...</div>'}
                        </div>
                        ${session.duePayments && session.duePayments.length > 0 ? `
                            <div style="margin-top: 8px; font-size: 13px; color: #6c757d;">
                                ${session.duePayments.length} due payment(s) recorded
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering history:', error);
            container.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">Failed to load history</p>';
        }
    }

    static async showSessionDetails(sessionDate) {
        try {
            const sessions = await FirebaseService.loadCashSessions();
            const session = sessions.find(s => s.date === sessionDate);
            
            if (!session) {
                UIManager.showToast('Session not found');
                return;
            }

        const date = new Date(session.date).toLocaleDateString('en-IN', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long',
            year: 'numeric'
        });

        const diff = session.difference || 0;
        const absDiff = Math.abs(diff);
        let diffColor = '#22c55e'; // green
        if (absDiff >= 500) diffColor = '#ef4444'; // red
        else if (absDiff >= 50) diffColor = '#f59e0b'; // yellow
        const diffText = absDiff < 1 ? 'Matched' : (diff >= 0 ? `+₹${diff.toFixed(2)}` : `₹${diff.toFixed(2)}`);

        const totalCashIn = (session.openingBalance || 0) + (session.transactions?.cashDeposits || 0) + (session.transactions?.cashSales || 0) + (session.transactions?.duePayments || 0);
        const totalCashOut = (session.transactions?.cashPurchases || 0) + (session.transactions?.cashExpenses || 0);
        const difference = session.signedOut ? (session.closingBalance - session.expectedBalance) : 0;
        const absDifference = Math.abs(difference);
        
        // Color coding based on difference amount
        let cardDiffColor = '#22c55e'; // green for < 50
        if (absDifference >= 500) cardDiffColor = '#ef4444'; // red for >= 500
        else if (absDifference >= 50) cardDiffColor = '#f59e0b'; // orange/yellow for >= 50
        
        const diffBgColor = session.signedOut ? `rgba(${parseInt(cardDiffColor.slice(1, 3), 16)}, ${parseInt(cardDiffColor.slice(3, 5), 16)}, ${parseInt(cardDiffColor.slice(5, 7), 16)}, 0.1)` : 'rgba(148, 163, 184, 0.1)';
        const diffTextColor = session.signedOut ? cardDiffColor : '#64748b';
        
        let modalContent = `
            <div style="padding: 0;">
                <!-- Summary Card -->
                ${session.signedOut ? `
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
                    <!-- Expenses & Others -->
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: #7c3aed; margin-bottom: 8px; font-weight: 600;">Expenses & Others</div>
                        <div style="font-size: 24px; font-weight: 700; color: #6d28d9;">₹${totalCashOut}</div>
                    </div>
                    
                    <!-- Expected Balance -->
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: #7c3aed; margin-bottom: 8px; font-weight: 600;">Expected Balance</div>
                        <div style="font-size: 24px; font-weight: 700; color: #6d28d9;">₹${session.expectedBalance || 0}</div>
                    </div>
                    
                    <!-- Actual Balance -->
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: #7c3aed; margin-bottom: 8px; font-weight: 600;">Actual Balance</div>
                        <div style="font-size: 24px; font-weight: 700; color: #6d28d9;">₹${session.closingBalance}</div>
                    </div>
                    
                    <!-- Difference -->
                    <div style="background: ${diffBgColor}; padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: ${diffTextColor}; margin-bottom: 8px; font-weight: 600;">Difference</div>
                        <div style="font-size: 24px; font-weight: 700; color: ${diffTextColor};">${diffText}</div>
                    </div>
                </div>
                ` : `
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
                    <!-- Opening Balance -->
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: #7c3aed; margin-bottom: 8px; font-weight: 600;">Opening Balance</div>
                        <div style="font-size: 24px; font-weight: 700; color: #6d28d9;">₹${session.openingBalance || 0}</div>
                    </div>
                    
                    <!-- Cash In -->
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: #7c3aed; margin-bottom: 8px; font-weight: 600;">Cash In</div>
                        <div style="font-size: 24px; font-weight: 700; color: #6d28d9;">₹${totalCashIn - (session.openingBalance || 0)}</div>
                    </div>
                    
                    <!-- Cash Out -->
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: #7c3aed; margin-bottom: 8px; font-weight: 600;">Cash Out</div>
                        <div style="font-size: 24px; font-weight: 700; color: #6d28d9;">₹${totalCashOut}</div>
                    </div>
                    
                    <!-- Expected Cash -->
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: 10px;">
                        <div style="font-size: 13px; color: #7c3aed; margin-bottom: 8px; font-weight: 600;">Expected Cash</div>
                        <div style="font-size: 24px; font-weight: 700; color: #6d28d9;">₹${session.expectedBalance || 0}</div>
                    </div>
                </div>
                `}
                
                <!-- Cash In Group -->
                <div style="background: #d1fae5; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #166534;">Cash In</h3>
                    <div style="display: grid; gap: 6px; font-size: 13px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Opening Balance:</span>
                            <strong style="color: #6366f1;">₹${session.openingBalance}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Cash Added:</span>
                            <strong style="color: #10b981;">₹${session.transactions?.cashDeposits || 0}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Cash Sales:</span>
                            <strong style="color: #22c55e;">₹${session.transactions?.cashSales || 0}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Due Received:</span>
                            <strong style="color: #3b82f6;">₹${session.transactions?.dueReceived || 0}</strong>
                        </div>
                        <div style="border-top: 2px solid #059669; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-weight: 600;">
                            <span>Total Cash In:</span>
                            <strong style="color: #059669;">₹${totalCashIn}</strong>
                        </div>
                    </div>
                </div>
                
                <!-- Cash Out Group -->
                <div style="background: #fee2e2; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #991b1b;">Cash Out</h3>
                    <div style="display: grid; gap: 6px; font-size: 13px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Cash Purchases:</span>
                            <strong style="color: #ef4444;">₹${session.transactions?.cashPurchases || 0}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Due Paid:</span>
                            <strong style="color: #dc2626;">₹${session.transactions?.duePaid || 0}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Business Expenses:</span>
                            <strong style="color: #f97316;">₹${session.transactions?.businessExpenses || 0}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Personal Expenses:</span>
                            <strong style="color: #f59e0b;">₹${session.transactions?.personalExpenses || 0}</strong>
                        </div>
                        <div style="border-top: 2px solid #dc2626; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-weight: 600;">
                            <span>Total Cash Out:</span>
                            <strong style="color: #dc2626;">₹${totalCashOut}</strong>
                        </div>
                    </div>
                </div>

                ${session.cashDeposits && session.cashDeposits.length > 0 ? `
                    <div style="background: #f0fdf4; padding: 10px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #86efac;">
                        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #166534;">💵 Cash Deposits (${session.cashDeposits.length})</h3>
                        <div style="display: grid; gap: 6px;">
                            ${session.cashDeposits.map(d => `
                                <div style="background: white; padding: 8px; border-radius: 6px; border-left: 3px solid #10b981;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                        <strong style="color: #333; font-size: 12px;">${d.reason || 'Cash added'}</strong>
                                        <strong style="color: #10b981; font-size: 13px;">₹${d.amount}</strong>
                                    </div>
                                    <div style="color: #6c757d; font-size: 10px;">
                                        Added by ${d.addedBy}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${session.duePayments && session.duePayments.length > 0 ? `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 12px;">
                        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #495057;">💰 Due Payments (${session.duePayments.length})</h3>
                        <div style="display: grid; gap: 6px;">
                            ${session.duePayments.map(p => {
                                const isReceived = p.type !== 'paid';
                                const borderColor = isReceived ? '#3b82f6' : '#ef4444';
                                const amountColor = isReceived ? '#3b82f6' : '#ef4444';
                                const typeLabel = isReceived ? 'Received from' : 'Paid to';
                                return `
                                    <div style="background: white; padding: 8px; border-radius: 6px; border-left: 3px solid ${borderColor};">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                            <strong style="color: #333; font-size: 12px;">${typeLabel} ${p.customer}</strong>
                                            <strong style="color: ${amountColor}; font-size: 13px;">${isReceived ? '+' : '-'}₹${p.amount}</strong>
                                        </div>
                                        <div style="color: #6c757d; font-size: 10px;">
                                            ${p.method} • ${p.notes || 'No notes'}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}

                ${session.openingNotes || session.closingNotes ? `
                <!-- Notes -->
                <div style="background: #fffbeb; padding: 12px; border-radius: 8px; border-left: 3px solid #f59e0b;">
                    <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #92400e;">📝 Notes</h4>
                    ${session.openingNotes ? `<div style="font-size: 12px; color: #78350f; margin-bottom: 6px;"><strong>Sign In:</strong> ${session.openingNotes}</div>` : ''}
                    ${session.closingNotes ? `<div style="font-size: 12px; color: #78350f;"><strong>Sign Out:</strong> ${session.closingNotes}</div>` : ''}
                </div>
                ` : ''}
            </div>
        `;

            UIManager.showModal(modalContent, 'Cash Session Details', false);
        } catch (error) {
            console.error('Error loading session details:', error);
            UIManager.showToast('Failed to load session details');
        }
    }
}
