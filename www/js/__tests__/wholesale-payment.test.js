/**
 * @fileoverview The wholesale screen's "Record" payment goes through the same
 * Firestore transaction as the Due screen (OutstandingManager.applyPaymentTransaction)
 * so a payment recorded concurrently on another device is never overwritten.
 */

jest.mock('../firebase/firestore-service.js', () => ({
    FirebaseService: {
        updateWholesaleSale: jest.fn(async () => {}),
        db: null,
        CLIENT_VERSION: 3,
        billHasOpenDue: jest.fn((coll, bill) => !bill.cleared && (bill.payment?.due || 0) > 0)
    }
}));
jest.mock('../services/printer.js', () => ({ PrinterService: {} }));
jest.mock('../services/audit.js', () => ({ AuditService: { log: jest.fn(), ACTIONS: {} } }));
jest.mock('../ui/infinite-scroll.js', () => ({ attachOlderHistoryScroll: jest.fn() }));

import { FirebaseService } from '../firebase/firestore-service.js';
import { AppState } from '../utils/state.js';
import { WholesaleSalesManager } from '../modules/wholesale-sales.js';

beforeEach(() => {
    document.body.innerHTML = '<div id="salesOutstandingList"></div><div id="salesHistoryList"></div><div id="toast"></div>';
    window.app = { outstanding: { renderDue: jest.fn() } };
    AppState.salesHistory = [];
    AppState.currentUser = { uid: 'owner1', email: 'o@x' };
    AppState.userName = 'Owner';
});

describe('wholesale recordPayment uses the payment transaction', () => {
    function fakeDb(serverDoc) {
        const ref = { id: 's1' };
        const tx = {
            get: jest.fn(async () => ({ exists: true, data: () => serverDoc })),
            update: jest.fn()
        };
        return {
            tx,
            db: {
                collection: jest.fn(() => ({ doc: jest.fn(() => ref), where: jest.fn() })),
                runTransaction: jest.fn(async (fn) => fn(tx))
            }
        };
    }

    test('does not overwrite a payment recorded concurrently on another device', async () => {
        const local = {
            id: 's1', source: 'sales-tab', total: 100, billNumber: 'W-1',
            items: [{ name: 'Rice', rate: 10, qty: 10, total: 100 }],
            payment: { online: 0, cash: 20, due: 80, total: 20 },
            payments: [{ amount: 20 }]
        };
        // Server already has a second payment of 20 recorded elsewhere
        const server = {
            ...local,
            payment: { online: 0, cash: 40, due: 60, total: 40 },
            payments: [{ amount: 20 }, { amount: 20, recordedBy: 'Staff' }]
        };
        const { db, tx } = fakeDb(server);
        FirebaseService.db = db;
        AppState.salesHistory = [local];
        WholesaleSalesManager.renderSalesOutstanding();
        document.getElementById('payment_s1').value = '30';

        await WholesaleSalesManager.recordPayment('s1');

        expect(db.runTransaction).toHaveBeenCalledTimes(1);
        expect(FirebaseService.updateWholesaleSale).not.toHaveBeenCalled();
        const written = tx.update.mock.calls[0][1];
        expect(written.payment).toEqual({ online: 0, cash: 70, due: 30, total: 70 });
        expect(written).toMatchObject({ clientVersion: 3, openDue: true });
        expect(written.payments).toHaveLength(3);
        expect(written.payments[2]).toMatchObject({ amount: 30, recordedBy: 'Owner' });
        expect(local.payment.due).toBe(30);
        expect(document.getElementById('toast').textContent).toBe('✓ Payment of ₹30 recorded');
        expect(window.app.outstanding.renderDue).toHaveBeenCalled();
    });

    test('rejects an amount above the server-side due', async () => {
        const local = {
            id: 's1', source: 'sales-tab', total: 100, items: [],
            payment: { online: 0, cash: 0, due: 100, total: 0 }
        };
        const { db, tx } = fakeDb({ ...local, payment: { online: 0, cash: 90, due: 10, total: 90 } });
        FirebaseService.db = db;
        AppState.salesHistory = [local];
        WholesaleSalesManager.renderSalesOutstanding();
        document.getElementById('payment_s1').value = '50';
        jest.spyOn(console, 'error').mockImplementation(() => {});

        await WholesaleSalesManager.recordPayment('s1');

        expect(tx.update).not.toHaveBeenCalled();
        expect(FirebaseService.updateWholesaleSale).not.toHaveBeenCalled();
        expect(document.getElementById('toast').textContent).toBe('Payment amount exceeds outstanding amount (₹10)');
    });

    test('offline: no write, tells the user', async () => {
        const local = { id: 's1', source: 'sales-tab', total: 100, items: [], payment: { online: 0, cash: 0, due: 100 } };
        const { db } = fakeDb(local);
        FirebaseService.db = db;
        AppState.salesHistory = [local];
        WholesaleSalesManager.renderSalesOutstanding();
        document.getElementById('payment_s1').value = '10';
        const spy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

        await WholesaleSalesManager.recordPayment('s1');

        spy.mockRestore();
        expect(db.runTransaction).not.toHaveBeenCalled();
        expect(document.getElementById('toast').textContent).toBe('Internet required to record payment');
    });
});
