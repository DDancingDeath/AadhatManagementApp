/**
 * @fileoverview #24: History renders 50 bills at a time; Finance/Reports/
 * Analytics skip recomputing on a tab revisit when their inputs are unchanged.
 */

jest.mock('../firebase/firestore-service.js', () => ({ FirebaseService: { db: null } }));
jest.mock('../services/printer.js', () => ({ PrinterService: {} }));
jest.mock('../services/audit.js', () => ({ AuditService: { log: jest.fn(), ACTIONS: {} } }));
jest.mock('../ui/infinite-scroll.js', () => ({ attachOlderHistoryScroll: jest.fn() }));

import { AppState } from '../utils/state.js';
import { HistoryManager } from '../modules/history.js';
import { ReportsManager } from '../modules/reports.js';
import { FinanceManager } from '../modules/finance.js';
import { AnalyticsManager } from '../modules/analytics.js';
import { attachOlderHistoryScroll } from '../ui/infinite-scroll.js';

const bills = (n) => Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    billNumber: `P20261021-${String(i).padStart(3, '0')}`,
    customerName: `Farmer ${i}`,
    date: new Date(2026, 9, 21, 10, 0, 0).toISOString(),
    timestamp: 1_000_000 + (n - i), // b0 newest
    items: [{ name: 'Wheat', qty: 1, rate: 1 }],
    total: 10
}));

describe('History paging (#24)', () => {
    beforeEach(() => {
        document.body.innerHTML = '<input id="historySearch" value=""><div id="historyList"></div>';
        AppState.purchaseHistory = bills(120);
        AppState.salesHistory = [];
        AppState.retailSalesHistory = [];
        AppState.historyLoadedFrom = 0;
        HistoryManager.viewMode = 'card';
        HistoryManager.pageKey = '';
    });

    const cards = () => document.querySelectorAll('#historyList .history-item');
    const showMore = () => document.querySelector('#historyList .history-show-more button');
    const olderScrollEnabled = () => attachOlderHistoryScroll.mock.calls.at(-1)[1].enabled();

    test('renders 50, then 50 more per Show more; older-month loading waits for the end', () => {
        HistoryManager.renderHistory('purchase');
        expect(cards()).toHaveLength(50);
        expect(cards()[0].textContent).toContain('P20261021-000');
        expect(showMore().textContent).toBe('Show more (70 more)');
        expect(olderScrollEnabled()).toBe(false);

        showMore().click();
        expect(cards()).toHaveLength(100);
        showMore().click();
        expect(cards()).toHaveLength(120);
        expect(showMore()).toBeNull();
        expect(olderScrollEnabled()).toBe(true);
    });

    test('live refresh keeps the shown count; search still covers every loaded bill', () => {
        HistoryManager.renderHistory('purchase');
        showMore().click();
        HistoryManager.refreshHistory();
        expect(cards()).toHaveLength(100);

        HistoryManager.renderHistory('purchase', 'P20261021-119');
        expect(cards()).toHaveLength(1);
        expect(cards()[0].textContent).toContain('Farmer 119');

        HistoryManager.renderHistory('purchase');
        expect(cards()).toHaveLength(50);
    });

    test('table view is paged too', () => {
        HistoryManager.viewMode = 'table';
        HistoryManager.renderHistory('purchase');
        expect(document.querySelectorAll('#historyList tbody tr')).toHaveLength(50);
        showMore().click();
        expect(document.querySelectorAll('#historyList tbody tr')).toHaveLength(100);
    });
});

describe('Finance/Reports/Analytics revisit memo (#24)', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="reports"><div class="reports-section"></div></div>' +
            '<div id="finance"><div id="financeDashboardSection"></div></div>';
        AppState.purchaseHistory = bills(5);
        AppState.salesHistory = [];
        AppState.retailSalesHistory = [];
        AppState.expensesHistory = [];
        AppState.historyLoadedFrom = 0;
        ReportsManager.currentTab = 'overview';
        ReportsManager.currentDateFilter = 'all';
    });

    test('Reports: unchanged revisit skips, data or filter change recomputes', () => {
        const spy = jest.spyOn(ReportsManager, 'renderOverview').mockImplementation(() => {});
        ReportsManager.renderReportsIfStale();
        ReportsManager.renderReportsIfStale();
        expect(spy).toHaveBeenCalledTimes(1);

        AppState.purchaseHistory = [...AppState.purchaseHistory, ...bills(1)];
        ReportsManager.renderReportsIfStale();
        expect(spy).toHaveBeenCalledTimes(2);

        ReportsManager.currentDateFilter = 'year';
        ReportsManager.renderReportsIfStale();
        expect(spy).toHaveBeenCalledTimes(3);
        ReportsManager.renderReportsIfStale();
        expect(spy).toHaveBeenCalledTimes(3);

        // An explicit render (filter buttons, live sync) always recomputes.
        ReportsManager.renderReports();
        expect(spy).toHaveBeenCalledTimes(4);
    });

    test('Finance: tab-show init skips the dashboard when nothing changed', () => {
        const spy = jest.spyOn(FinanceManager, 'renderMonthlyChart').mockImplementation(() => {});
        FinanceManager.init();
        FinanceManager.init();
        expect(spy).toHaveBeenCalledTimes(1);
        AppState.dataVersion += 1;
        FinanceManager.init();
        expect(spy).toHaveBeenCalledTimes(2);
    });

    test('Analytics: tab-show init skips the overview when nothing changed', () => {
        const spy = jest.spyOn(AnalyticsManager, 'renderMonthSummary').mockImplementation(() => {});
        jest.spyOn(AnalyticsManager, 'renderTodayPrediction').mockImplementation(() => {});
        jest.spyOn(AnalyticsManager, 'renderOutstandingDues').mockImplementation(() => {});
        jest.spyOn(AnalyticsManager, 'renderMonthlyProjection').mockImplementation(() => {});
        AnalyticsManager.init();
        AnalyticsManager.init();
        expect(spy).toHaveBeenCalledTimes(1);
        AppState.expensesHistory = [{ id: 'e1', date: '2026-10-21', amount: 5 }];
        AnalyticsManager.init();
        expect(spy).toHaveBeenCalledTimes(2);
    });
});
