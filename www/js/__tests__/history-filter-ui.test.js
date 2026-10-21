/**
 * @fileoverview #160: History type chips + date presets in the History
 * screen — remembered for the session, paging/search still work, and ranges
 * older than the loaded window load on demand with a progress notice.
 */

jest.mock('../firebase/firestore-service.js', () => ({ FirebaseService: { db: null } }));
jest.mock('../services/printer.js', () => ({ PrinterService: {} }));
jest.mock('../services/audit.js', () => ({ AuditService: { log: jest.fn(), ACTIONS: {} } }));
jest.mock('../ui/infinite-scroll.js', () => ({ attachOlderHistoryScroll: jest.fn() }));

import { AppState } from '../utils/state.js';
import { HistoryManager } from '../modules/history.js';
import { HISTORY_FILTER_KEY } from '../utils/history-filters.js';

const day = (offset, h = 10) => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + offset, h).getTime();
};
const bill = (id, timestamp, extra = {}) => ({ id, billNumber: id, timestamp, items: [{ name: 'Wheat', qty: 1, rate: 1 }], total: 1, ...extra });

const html = `
    <div id="history">
      <div class="history-type-filter">
        <button class="filter-btn" data-type="all"></button><button class="filter-btn" data-type="purchase"></button>
        <button class="filter-btn" data-type="retail"></button><button class="filter-btn" data-type="wholesale"></button>
      </div>
      <select id="historyDatePreset"><option value="all"></option><option value="today"></option>
        <option value="yesterday"></option><option value="week"></option><option value="month"></option>
        <option value="lastMonth"></option><option value="custom"></option></select>
      <div id="historyCustomRange" hidden><input id="historyFromDate"><input id="historyToDate"></div>
      <div id="historyRangeLabel" hidden></div>
      <input id="historySearch" value="">
      <div id="wrap"><div id="historyList"></div></div>
    </div>`;

const ids = () => [...document.querySelectorAll('#historyList .history-item .history-header span[onclick]')]
    .map(s => s.textContent.replace('#', ''));

describe('History filters (#160)', () => {
    beforeEach(() => {
        document.body.innerHTML = html;
        sessionStorage.clear();
        HistoryManager.filter = null;
        HistoryManager.pageKey = '';
        HistoryManager.viewMode = 'card';
        delete window.FirebaseService;
        AppState.historyLoadedFrom = 0;
        AppState.purchaseHistory = [bill('P-today', day(0)), bill('P-old', day(-40))];
        AppState.retailSalesHistory = [bill('S-yday', day(-1))];
        AppState.salesHistory = [bill('W-today', day(0, 12), { date: 'x' })];
    });

    test('type chips + presets filter, combine with search, and are remembered', () => {
        HistoryManager.refreshHistory();
        expect(ids()).toEqual(['W-today', 'P-today', 'S-yday', 'P-old']);
        expect(document.querySelector('[data-type="all"]').classList.contains('active')).toBe(true);

        HistoryManager.filterHistory('retail');
        expect(ids()).toEqual(['S-yday']);
        expect(document.querySelector('[data-type="retail"]').classList.contains('active')).toBe(true);

        HistoryManager.filterHistory('all');
        HistoryManager.setDatePreset('today');
        expect(ids()).toEqual(['W-today', 'P-today']);
        expect(document.getElementById('historyRangeLabel').textContent).toMatch(/· 2 bills$/);

        document.getElementById('historySearch').value = 'P-';
        HistoryManager.refreshHistory();
        expect(ids()).toEqual(['P-today']);

        expect(JSON.parse(sessionStorage.getItem(HISTORY_FILTER_KEY))).toMatchObject({ type: 'all', preset: 'today' });
        HistoryManager.filter = null; // new page load in the same session
        document.getElementById('historySearch').value = '';
        HistoryManager.refreshHistory();
        expect(ids()).toEqual(['W-today', 'P-today']);
        expect(document.getElementById('historyDatePreset').value).toBe('today');
    });

    test('custom range shows the date inputs; legacy "sale" means retail + wholesale', () => {
        HistoryManager.setDatePreset('custom');
        expect(document.getElementById('historyCustomRange').hidden).toBe(false);
        expect(ids()).toEqual(['W-today', 'P-today']);

        HistoryManager.setDatePreset('all');
        HistoryManager.renderHistory('sale');
        expect(ids()).toEqual(['W-today', 'S-yday']);
    });

    test('a range older than the loaded window loads on demand with a progress notice', async () => {
        let resolveLoad;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        window.FirebaseService = {
            getHistoryWindowStart: () => monthStart,
            isFullHistoryLoaded: () => false,
            ensureHistoryFrom: jest.fn(() => new Promise(r => { resolveLoad = r; }))
        };
        HistoryManager.setDatePreset('lastMonth');

        await Promise.resolve();
        expect(window.FirebaseService.ensureHistoryFrom).toHaveBeenCalledWith(from);
        const notice = document.querySelector('.history-range-notice');
        expect(notice.textContent).toContain('Loading older bills');
        expect(document.getElementById('historyList').classList.contains('history-range-loading')).toBe(true);

        window.FirebaseService.getHistoryWindowStart = () => from;
        // The stale-data hint is inserted right above the list, below the notice.
        const hint = document.createElement('div');
        hint.className = 'history-stale-hint';
        document.getElementById('historyList').before(hint);
        resolveLoad();
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        expect(document.querySelector('.history-range-notice')).toBeNull();
        expect(document.getElementById('historyList').classList.contains('history-range-loading')).toBe(false);
    });
});
