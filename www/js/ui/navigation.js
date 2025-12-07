// -------------------- NAVIGATION AND TAB MANAGEMENT --------------------

import { UIManager } from './ui-manager.js';

const NavigationManager = {
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
        
        // Render items table when Items tab is shown
        if (tabId === 'items' && window.app?.items) {
            setTimeout(() => window.app.items.renderTable(), 100);
        }
        
        // Render history when History tab is shown
        if (tabId === 'history' && window.app?.history) {
            setTimeout(() => window.app.history.render(), 100);
        }
        
        // Render outstanding when Due tab is shown
        if (tabId === 'due' && window.app?.outstanding) {
            setTimeout(() => window.app.outstanding.renderDue(), 100);
        }
        
        // Render sales history when Sales tab is shown
        if (tabId === 'sales' && window.app?.sales) {
            setTimeout(() => window.app.sales.renderHistory(), 100);
        }
        
        // Initialize retail sales when Retail Sales tab is shown
        if (tabId === 'retail-sales' && window.app?.retailSales) {
            console.log('Navigation: Initializing retail-sales tab');
            setTimeout(() => window.app.retailSales.loadItemsDropdown(), 100);
        }
        
        // Render stock when Stock tab is shown
        if (tabId === 'stock' && window.app?.stock) {
            setTimeout(() => window.app.stock.filterTab('current'), 100);
        }
        
        // Render reports when Reports tab is shown
        if (tabId === 'reports' && window.app?.reports) {
            setTimeout(() => window.app.reports.renderReports(), 100);
        }
        
        // Initialize configure sub-tabs when Configure tab is shown
        if (tabId === 'configure' && window.app?.configure) {
            setTimeout(() => window.app.configure.showSubTab('items'), 100);
        }
    },

    // Show tab
    showTab(tabId, evt) {
        console.log('Navigation: showTab called with tabId:', tabId);
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        
        const selectedTab = document.getElementById(tabId);
        if (selectedTab) {
            console.log('Navigation: Found tab element for', tabId);
            selectedTab.classList.add('active');
        } else {
            console.error('Navigation: Tab element not found for', tabId);
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
