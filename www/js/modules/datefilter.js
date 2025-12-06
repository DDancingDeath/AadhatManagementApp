// Date Filtering Module
import { AppState } from '../utils/state.js';

export class DateFilterManager {
    static setDateFilter(filter, evt) {
        AppState.currentDateFilter = filter;
        
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        if (evt) evt.target.classList.add('active');
        
        const customRange = document.getElementById('customDateRange');
        if (filter === 'custom') {
            customRange.style.display = 'block';
        } else {
            customRange.style.display = 'none';
            window.app.reports.renderReports();
        }
    }

    static applyCustomDateFilter() {
        const from = document.getElementById('dateFrom').value;
        const to = document.getElementById('dateTo').value;
        
        if (from && to) {
            const state = AppState.getState();
            state.customDateRange.from = new Date(from);
            state.customDateRange.to = new Date(to);
            state.customDateRange.to.setHours(23, 59, 59, 999);
            window.app.reports.renderReports();
        }
    }
}
