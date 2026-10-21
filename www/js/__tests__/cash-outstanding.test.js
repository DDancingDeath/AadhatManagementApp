/**
 * @fileoverview Cash & outstanding lane: cash-session totals (#69), ₹0 and
 * notes (#66), auto-close (#101), one due-payment path (#98), split payments
 * (#107), Today dues (#95), honest clearing (#104) and expense refresh (#89).
 */
import { CashManagementManager } from '../modules/cash-management.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { UIManager } from '../ui/ui-manager.js';
import { AppState } from '../utils/state.js';
import { sessionTotals, parseCashAmount, isNotCounted, lastCountedSession, autoCloseFields } from '../utils/cash-session.js';
import fs from 'fs';
import path from 'path';

const CASH_TEMPLATE = fs.readFileSync(path.join(__dirname, '../../templates/cash-management.html'), 'utf8');
const setVal = (id, v) => { document.getElementById(id).value = String(v); };

let toast;
beforeEach(() => {
    toast = jest.spyOn(UIManager, 'showToast').mockImplementation(() => {});
    jest.spyOn(UIManager, 'hapticFeedback').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    AppState.currentUser = { uid: 'u1', email: 'o@x' };
    AppState.userName = 'Owner';
    AppState.userRole = 'owner';
});
afterEach(() => {
    jest.restoreAllMocks();
    CashManagementManager.todaySession = null;
});

const TXNS = { cashSales: 1300, cashPurchases: 1500, businessExpenses: 150, personalExpenses: 80, dueReceived: 250, duePaid: 100, cashDeposits: 500 };

describe('#69 session totals', () => {
    test('cash in/out include dues, deposits and both expense kinds', () => {
        expect(sessionTotals({ openingBalance: 2000, transactions: TXNS })).toEqual({
            opening: 2000, cashIn: 500 + 1300 + 250, cashOut: 1500 + 100 + 150 + 80,
            expected: 2000 + 1300 - 1500 - 150 - 80 + 250 - 100 + 500
        });
    });

    test('history detail shows the same totals as the sign-out summary', async () => {
        const session = { id: 's1', date: '2026-10-20', openingBalance: 2000, signedOut: true, closingBalance: 2220, expectedBalance: 2220, difference: 0, transactions: TXNS };
        jest.spyOn(FirebaseService, 'loadCashSessions').mockResolvedValue([session]);
        let html = '';
        jest.spyOn(UIManager, 'showModalWithHtml').mockImplementation(async (h) => { html = h; return true; });
        await CashManagementManager.showSessionDetails('2026-10-20');
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        expect(text).toContain('Total Cash In: ₹4050');
        expect(text).toContain('Total Cash Out: ₹1830');
    });
});

describe('#66 ₹0 opening/closing and session notes', () => {
    let saved;
    beforeEach(() => {
        document.body.innerHTML = CASH_TEMPLATE;
        saved = [];
        jest.spyOn(FirebaseService, 'loadCashSessions').mockResolvedValue([]);
        jest.spyOn(FirebaseService, 'saveCashSession').mockImplementation(async (s) => { saved.push({ ...s }); return s; });
        ['salesHistory', 'retailSalesHistory', 'purchaseHistory', 'expensesHistory'].forEach(k => { AppState[k] = []; });
    });

    test.each([['0', 0], ['250.5', 250.5], ['', null], ['   ', null], ['-5', null], ['abc', null], [null, null]])(
        'parseCashAmount(%p) → %p', (raw, expected) => {
            expect(parseCashAmount(raw)).toBe(expected);
        });

    test('opening with ₹0 works and keeps the opening note', async () => {
        setVal('cashSignInAmount', 0);
        setVal('cashSignInNotes', 'Drawer empty, counted by Ramesh');
        await CashManagementManager.signIn();
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({ openingBalance: 0, openingNotes: 'Drawer empty, counted by Ramesh', signedOut: false });
        expect(toast).toHaveBeenCalledWith('✓ Cash signed in successfully!');
    });

    test.each([[''], ['-1']])('opening amount %p is rejected', async (value) => {
        setVal('cashSignInAmount', value);
        await CashManagementManager.signIn();
        expect(saved).toHaveLength(0);
        expect(toast).toHaveBeenCalledWith('Please enter a valid opening amount');
    });

    test('closing with ₹0 counted works, computes the difference and keeps the closing note', async () => {
        const update = jest.fn(async () => {});
        jest.spyOn(FirebaseService, 'db', 'get').mockReturnValue({ collection: () => ({ doc: () => ({ update }) }) });
        jest.spyOn(UIManager, 'showModal').mockResolvedValue(true);
        CashManagementManager.todaySession = { id: 's1', date: '2026-10-21', openingBalance: 300, signedOut: false, duePayments: [] };
        CashManagementManager.todayTransactions = { cashSales: 0, cashPurchases: 0, businessExpenses: 0, personalExpenses: 0, dueReceived: 0, duePaid: 0, cashDeposits: 0 };
        setVal('cashSignOutAmount', 0);
        setVal('cashSignOutNotes', 'Took ₹300 home');
        await CashManagementManager.signOut();
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            closingBalance: 0, expectedBalance: 300, difference: -300, counted: true, closingNotes: 'Took ₹300 home', signedOut: true
        }));
    });

    test('closing with an empty amount is rejected', async () => {
        CashManagementManager.todaySession = { id: 's1', date: '2026-10-21', openingBalance: 300, signedOut: false };
        setVal('cashSignOutAmount', '');
        await CashManagementManager.signOut();
        expect(toast).toHaveBeenCalledWith('Please enter the actual cash amount');
    });

    test('session detail shows opening and closing notes, escaped', async () => {
        const session = { id: 's1', date: '2026-10-20', openingBalance: 0, signedOut: true, closingBalance: 0, expectedBalance: 0, difference: 0, counted: true,
            openingNotes: '<b>x</b>', closingNotes: 'Took ₹2,000 home', transactions: {} };
        FirebaseService.loadCashSessions.mockResolvedValue([session]);
        let html = '';
        jest.spyOn(UIManager, 'showModalWithHtml').mockImplementation(async (h) => { html = h; return true; });
        await CashManagementManager.showSessionDetails('2026-10-20');
        expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
        expect(html).toContain('Took ₹2,000 home');
    });
});
