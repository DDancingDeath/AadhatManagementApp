/**
 * @fileoverview Diagnostics Manager - UI for viewing telemetry and audit data
 * Owner-only access to view and manage application errors and audit logs
 * @module modules/diagnostics
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { TelemetryService } from '../services/telemetry.js';
import { AuditService } from '../services/audit.js';

/**
 * Diagnostics Manager - View and manage application telemetry and audit logs
 * @namespace DiagnosticsManager
 */
const DiagnosticsManager = {
    /**
     * Current telemetry data
     * @type {Array}
     */
    data: [],

    /**
     * Audit logs data
     * @type {Array}
     */
    auditLogs: [],

    /**
     * Current error filter
     * @type {string}
     */
    filter: 'all',

    /**
     * Current audit filter
     * @type {string}
     */
    auditFilter: '',

    /**
     * Current active tab
     * @type {string}
     */
    activeTab: 'errors',

    /**
     * Initialize diagnostics
     */
    async init() {
        if (AppState.userRole !== 'owner') {
            UIManager.showToast('Access denied', 'error');
            return;
        }
        this.renderTabs();
        if (this.activeTab === 'errors') {
            await this.loadData();
        } else {
            await this.loadAuditLogs();
        }
    },

    /**
     * Render the tab buttons
     */
    renderTabs() {
        const container = document.getElementById('diagnosticsTabsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="filter-buttons" style="margin-bottom: 16px;">
                <button class="filter-btn ${this.activeTab === 'errors' ? 'active' : ''}" 
                        onclick="window.app.diagnostics.showTab('errors')">
                    🐛 Errors
                </button>
                <button class="filter-btn ${this.activeTab === 'audit' ? 'active' : ''}" 
                        onclick="window.app.diagnostics.showTab('audit')">
                    📋 Audit Logs
                </button>
            </div>
        `;
    },

    /**
     * Switch tab
     * @param {string} tab - Tab name ('errors' or 'audit')
     */
    async showTab(tab) {
        this.activeTab = tab;
        this.renderTabs();
        
        if (tab === 'errors') {
            await this.loadData();
        } else {
            await this.loadAuditLogs();
        }
    },

    /**
     * Load telemetry data
     */
    async loadData() {
        try {
            UIManager.showLoading();
            this.data = await TelemetryService.getTelemetryData();
            this.renderErrors();
        } catch (error) {
            UIManager.showToast('Failed to load diagnostics data', 'error');
        } finally {
            UIManager.hideLoading();
        }
    },

    /**
     * Render the errors tab content
     */
    renderErrors() {
        const container = document.getElementById('diagnosticsContainer');
        if (!container) return;

        const filteredData = this.filter === 'all' 
            ? this.data 
            : this.data.filter(d => d.type === this.filter);

        // Group by type for stats
        const stats = {
            total: this.data.length,
            totalOccurrences: this.data.reduce((sum, d) => sum + (d.count || 1), 0),
            byType: {}
        };
        this.data.forEach(d => {
            stats.byType[d.type] = (stats.byType[d.type] || 0) + 1;
        });

        container.innerHTML = `
            <!-- Stats Cards -->
            <div class="diagnostics-stats">
                <div class="diag-stat-card">
                    <div class="diag-stat-value">${stats.total}</div>
                    <div class="diag-stat-label">Unique Errors</div>
                </div>
                <div class="diag-stat-card">
                    <div class="diag-stat-value">${stats.totalOccurrences}</div>
                    <div class="diag-stat-label">Total Occurrences</div>
                </div>
                <div class="diag-stat-card">
                    <div class="diag-stat-value">${stats.byType['uncaught'] || 0}</div>
                    <div class="diag-stat-label">Uncaught Errors</div>
                </div>
                <div class="diag-stat-card">
                    <div class="diag-stat-value">${stats.byType['console.error'] || 0}</div>
                    <div class="diag-stat-label">Console Errors</div>
                </div>
            </div>

            <!-- Controls -->
            <div class="diagnostics-controls">
                <select id="diagTypeFilter" onchange="window.app.diagnostics.filterByType(this.value)">
                    <option value="all" ${this.filter === 'all' ? 'selected' : ''}>All Types</option>
                    <option value="uncaught" ${this.filter === 'uncaught' ? 'selected' : ''}>Uncaught Errors</option>
                    <option value="unhandledrejection" ${this.filter === 'unhandledrejection' ? 'selected' : ''}>Promise Rejections</option>
                    <option value="console.error" ${this.filter === 'console.error' ? 'selected' : ''}>Console Errors</option>
                    <option value="warning" ${this.filter === 'warning' ? 'selected' : ''}>Warnings</option>
                    <option value="manual" ${this.filter === 'manual' ? 'selected' : ''}>Manual Logs</option>
                </select>
                <button onclick="window.app.diagnostics.loadData()" class="diag-btn refresh">🔄</button>
                <button onclick="window.app.diagnostics.clearAll()" class="diag-btn danger">🗑️</button>
            </div>

            <!-- Error List -->
            <div class="diagnostics-list">
                ${filteredData.length === 0 ? `
                    <div class="diag-empty">
                        <span class="diag-empty-icon">✅</span>
                        <p>No errors found</p>
                    </div>
                ` : filteredData.map(error => this.renderErrorCard(error)).join('')}
            </div>
        `;
    },

    /**
     * Render a single error card
     * @param {Object} error - Error data
     * @returns {string} HTML string
     */
    renderErrorCard(error) {
        const typeColors = {
            'uncaught': '#ef4444',
            'unhandledrejection': '#f97316',
            'console.error': '#eab308',
            'warning': '#3b82f6',
            'manual': '#8b5cf6'
        };

        const typeLabels = {
            'uncaught': '🔴 Uncaught',
            'unhandledrejection': '🟠 Promise',
            'console.error': '🟡 Console',
            'warning': '🔵 Warning',
            'manual': '🟣 Manual'
        };

        const lastSeen = error.lastSeen ? new Date(error.lastSeen).toLocaleString('en-IN') : 'Unknown';
        const firstSeen = error.firstSeen ? new Date(error.firstSeen).toLocaleString('en-IN') : lastSeen;

        return `
            <div class="diag-error-card" style="border-left: 4px solid ${typeColors[error.type] || '#666'};">
                <div class="diag-error-header">
                    <span class="diag-error-type">${typeLabels[error.type] || error.type}</span>
                    <span class="diag-error-count">${error.count || 1}x</span>
                    <button onclick="window.app.diagnostics.deleteError('${error.id}')" class="diag-delete-btn">×</button>
                </div>
                <div class="diag-error-message">${this.escapeHtml(error.message || 'No message')}</div>
                ${error.source ? `<div class="diag-error-source">📍 ${error.source}:${error.line || '?'}</div>` : ''}
                <div class="diag-error-meta">
                    <span>First: ${firstSeen}</span>
                    <span>Last: ${lastSeen}</span>
                </div>
                ${error.stack ? `
                    <details class="diag-error-stack">
                        <summary>Stack Trace</summary>
                        <pre>${this.escapeHtml(error.stack)}</pre>
                    </details>
                ` : ''}
                ${error.occurrences && error.occurrences.length > 0 ? `
                    <details class="diag-error-occurrences">
                        <summary>Recent Occurrences (${error.occurrences.length})</summary>
                        <ul>
                            ${error.occurrences.slice(-5).map(o => `
                                <li>${new Date(o.timestamp).toLocaleString('en-IN')} - ${o.userName || 'Unknown'}</li>
                            `).join('')}
                        </ul>
                    </details>
                ` : ''}
            </div>
        `;
    },

    /**
     * Load audit logs
     */
    async loadAuditLogs() {
        if (AppState.userRole !== 'owner') {
            UIManager.showToast('Only owners can view audit logs');
            return;
        }
        
        UIManager.showLoading();
        try {
            this.auditLogs = await AuditService.getRecentLogs(100);
            this.renderAuditLogs();
        } catch (error) {
            console.error('Error loading audit logs:', error);
            UIManager.showToast('Failed to load audit logs');
        } finally {
            UIManager.hideLoading();
        }
    },

    /**
     * Render the audit logs tab content
     */
    renderAuditLogs() {
        const container = document.getElementById('diagnosticsContainer');
        if (!container) return;

        let filteredLogs = this.auditLogs;
        if (this.auditFilter) {
            filteredLogs = this.auditLogs.filter(log => log.action === this.auditFilter);
        }

        container.innerHTML = `
            <!-- Controls -->
            <div class="diagnostics-controls">
                <select id="auditFilterAction" onchange="window.app.diagnostics.filterAuditLogs(this.value)">
                    <option value="" ${this.auditFilter === '' ? 'selected' : ''}>All Actions</option>
                    <option value="CREATE_BILL" ${this.auditFilter === 'CREATE_BILL' ? 'selected' : ''}>Create Bill</option>
                    <option value="DELETE_BILL" ${this.auditFilter === 'DELETE_BILL' ? 'selected' : ''}>Delete Bill</option>
                    <option value="CREATE_SALE" ${this.auditFilter === 'CREATE_SALE' ? 'selected' : ''}>Create Sale</option>
                    <option value="DELETE_SALE" ${this.auditFilter === 'DELETE_SALE' ? 'selected' : ''}>Delete Sale</option>
                    <option value="DELETE_ITEM" ${this.auditFilter === 'DELETE_ITEM' ? 'selected' : ''}>Delete Item</option>
                    <option value="UPDATE_PAYMENT" ${this.auditFilter === 'UPDATE_PAYMENT' ? 'selected' : ''}>Update Payment</option>
                    <option value="CLEAR_DATA" ${this.auditFilter === 'CLEAR_DATA' ? 'selected' : ''}>Clear Data</option>
                </select>
                <button onclick="window.app.diagnostics.loadAuditLogs()" class="diag-btn refresh">🔄</button>
            </div>

            <!-- Audit List -->
            <div class="diagnostics-list">
                ${filteredLogs.length === 0 ? `
                    <div class="diag-empty">
                        <span class="diag-empty-icon">📋</span>
                        <p>No audit logs found</p>
                    </div>
                ` : filteredLogs.map(log => this.renderAuditCard(log)).join('')}
            </div>
        `;
    },

    /**
     * Render a single audit log card
     * @param {Object} log - Audit log data
     * @returns {string} HTML string
     */
    renderAuditCard(log) {
        const date = new Date(log.timestamp);
        const formattedDate = date.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const actionIcon = this.getActionIcon(log.action);
        const actionColor = this.getActionColor(log.action);
        const details = this.formatDetails(log.details);

        return `
            <div class="diag-audit-card" style="border-left: 4px solid ${actionColor};">
                <div class="diag-audit-header">
                    <span class="diag-audit-icon">${actionIcon}</span>
                    <span class="diag-audit-action" style="color: ${actionColor};">${log.action.replace(/_/g, ' ')}</span>
                    <span class="diag-audit-time">${formattedDate}</span>
                </div>
                <div class="diag-audit-user">
                    <strong>${log.userName}</strong> (${log.userRole})
                </div>
                ${details ? `<div class="diag-audit-details">${details}</div>` : ''}
            </div>
        `;
    },

    /**
     * Get action icon
     * @param {string} action - Action type
     * @returns {string} Emoji icon
     */
    getActionIcon(action) {
        const icons = {
            'CREATE_BILL': '📥',
            'DELETE_BILL': '🗑️',
            'CREATE_SALE': '📤',
            'DELETE_SALE': '🗑️',
            'DELETE_ITEM': '🗑️',
            'UPDATE_PAYMENT': '💰',
            'RECORD_PAYMENT': '💰',
            'CLEAR_DATA': '⚠️',
            'LOGIN': '🔑',
            'LOGOUT': '🚪'
        };
        return icons[action] || '📋';
    },

    /**
     * Get action color
     * @param {string} action - Action type
     * @returns {string} Color code
     */
    getActionColor(action) {
        if (action.includes('DELETE') || action === 'CLEAR_DATA') return '#e74c3c';
        if (action.includes('CREATE')) return '#27ae60';
        if (action.includes('PAYMENT')) return '#3498db';
        return '#666';
    },

    /**
     * Format audit log details
     * @param {Object} details - Details object
     * @returns {string} Formatted string
     */
    formatDetails(details) {
        if (!details || typeof details !== 'object') return '';
        
        const parts = [];
        if (details.billNumber) parts.push(`Bill: ${details.billNumber}`);
        if (details.amount) parts.push(`Amount: ₹${details.amount}`);
        if (details.customer) parts.push(`Customer: ${details.customer}`);
        if (details.itemName) parts.push(`Item: ${details.itemName}`);
        if (details.paymentAmount) parts.push(`Payment: ₹${details.paymentAmount}`);
        if (details.collections) parts.push(`Collections: ${details.collections.join(', ')}`);
        if (details.recordsDeleted) parts.push(`Records: ${details.recordsDeleted}`);
        
        return parts.join(' • ');
    },

    /**
     * Filter audit logs
     * @param {string} action - Action to filter by
     */
    filterAuditLogs(action) {
        this.auditFilter = action;
        this.renderAuditLogs();
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Filter by type
     * @param {string} type - Error type
     */
    filterByType(type) {
        this.filter = type;
        this.renderErrors();
    },

    /**
     * Delete a specific error
     * @param {string} errorId - Error ID
     */
    async deleteError(errorId) {
        const confirmed = await UIManager.showModal('Delete this error?', 'Confirm Delete', true);
        if (!confirmed) return;

        try {
            await TelemetryService.deleteError(errorId);
            this.data = this.data.filter(d => d.id !== errorId);
            this.renderErrors();
            UIManager.showToast('Error deleted');
        } catch (error) {
            UIManager.showToast('Failed to delete error', 'error');
        }
    },

    /**
     * Clear all errors
     */
    async clearAll() {
        const confirmed = await UIManager.showModal(
            'This will delete ALL telemetry data. This cannot be undone. Continue?',
            'Clear All Diagnostics',
            true
        );
        if (!confirmed) return;

        try {
            UIManager.showLoading();
            await TelemetryService.clearTelemetryData();
            this.data = [];
            this.renderErrors();
            UIManager.showToast('All diagnostics cleared');
        } catch (error) {
            UIManager.showToast('Failed to clear diagnostics', 'error');
        } finally {
            UIManager.hideLoading();
        }
    }
};

export { DiagnosticsManager };
