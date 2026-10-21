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
