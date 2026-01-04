// -------------------- NAVIGATION AND TAB MANAGEMENT --------------------

import { UIManager } from './ui-manager.js';

const NavigationManager = {
    // Reset filter buttons to default state for a given tab
    resetFilterButtons(tabId) {
        const tabElement = document.getElementById(tabId);
        if (!tabElement) return;
        
        const buttons = tabElement.querySelectorAll('.filter-btn');
        buttons.forEach((btn, index) => {
            if (index === 0) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },
    
    // Toggle side navigation menu
    toggleMenu() {
        const sideNav = document.querySelector('.side-nav');
        const overlay = document.querySelector('.overlay');
        sideNav.classList.toggle('active');
        overlay.classList.toggle('active');
        UIManager.hapticFeedback('light');
    },

    // Show tab from navigation
    showTabFromNav(tabId, event) {
        if (event) {
            event.preventDefault();
        }
        
        // Update active state for navigation links
        const links = document.querySelectorAll('.nav-menu a');
        links.forEach(link => {
            link.classList.remove('active');
            // Check if this link's onclick contains the tabId
            const onclick = link.getAttribute('onclick');
            if (onclick && onclick.includes(`'${tabId}'`)) {
                link.classList.add('active');
            }
        });
        
        // Close menu
        const sideNav = document.querySelector('.side-nav');
        const overlay = document.querySelector('.overlay');
        sideNav.classList.remove('active');
        overlay.classList.remove('active');
        
        // Show tab (use tabId directly, not tabId + 'Tab')
        this.showTab(tabId);
        UIManager.hapticFeedback('light');
        
        // Load users when Users tab is shown
        if (tabId === 'users' && window.app?.users) {
            setTimeout(() => window.app.users.load(), 100);
        }
        
        // Reset billing mode when Billing tab is shown
        if (tabId === 'billing' && window.app?.billing) {
            this.resetFilterButtons('billing');
            setTimeout(() => window.app.billing.switchMode('purchase', { currentTarget: document.getElementById('purchaseModeBtn') }), 100);
        }
        
        // Render items table when Items tab is shown
        if (tabId === 'items' && window.app?.items) {
            setTimeout(() => window.app.items.renderTable(), 100);
        }
        
        // Render history when History tab is shown
        if (tabId === 'history' && window.app?.history) {
            this.resetFilterButtons('history');
            setTimeout(() => window.app.history.filterHistory('purchase', { target: document.querySelector('#history .filter-btn') }), 100);
        }
        
        // Render outstanding when Due tab is shown
        if (tabId === 'due' && window.app?.outstanding) {
            this.resetFilterButtons('due');
            setTimeout(() => window.app.outstanding.filterDue('purchase', { target: document.querySelector('#due .filter-btn') }), 100);
        }
        
        // Render wholesale sales history when Wholesale Sales tab is shown
        if (tabId === 'wholesale-sales' && window.app?.wholesaleSales) {
            this.resetFilterButtons('wholesale-sales');
            setTimeout(() => window.app.wholesaleSales.filterTab('sales', { target: document.querySelector('#wholesale-sales .filter-btn') }), 100);
        }
        
        // Render stock when Stock tab is shown
        if (tabId === 'stock' && window.app?.stock) {
            this.resetFilterButtons('stock');
            setTimeout(() => window.app.stock.filterTab('current'), 100);
        }
        
        // Render reports when Reports tab is shown
        if (tabId === 'reports' && window.app?.reports) {
            this.resetFilterButtons('reports');
            setTimeout(() => window.app.reports.renderReports(), 100);
        }
        
        // Initialize finance when Finance tab is shown
        if (tabId === 'finance' && window.app?.finance) {
            this.resetFilterButtons('finance');
            setTimeout(() => window.app.finance.init(), 100);
        }
        
        // Initialize analytics when Analytics tab is shown
        if (tabId === 'analytics' && window.app?.analytics) {
            this.resetFilterButtons('analytics');
            setTimeout(() => window.app.analytics.init(), 100);
        }
        
        // Initialize cash management when Cash Management tab is shown
        if (tabId === 'cash-management' && window.app?.cashManagement) {
            this.resetFilterButtons('cash-management');
            setTimeout(() => window.app.cashManagement.init(), 100);
        }
        
        // Configure tab - no sub-tabs to initialize
        if (tabId === 'configure') {
            this.resetFilterButtons('configure');
        }
        
        // Load settings when Settings tab is shown
        if (tabId === 'settings' && window.app?.settings) {
            setTimeout(() => window.app.settings.load(), 100);
        }
    },

    // Show tab
    showTab(tabId, evt) {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        
        const selectedTab = document.getElementById(tabId);
        if (selectedTab) {
            selectedTab.classList.add('active');
        }
        
        if (evt) {
            const buttons = document.querySelectorAll('.tab-button');
            buttons.forEach(btn => btn.classList.remove('active'));
            evt.currentTarget.classList.add('active');
        }
    }
};

// Export NavigationManager
export { NavigationManager };
