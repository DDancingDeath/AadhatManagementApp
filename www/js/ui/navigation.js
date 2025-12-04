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
            const links = document.querySelectorAll('.nav-menu a');
            links.forEach(link => link.classList.remove('active'));
            event.currentTarget.classList.add('active');
        }
        
        // Close menu
        const sideNav = document.querySelector('.side-nav');
        const overlay = document.querySelector('.overlay');
        sideNav.classList.remove('active');
        overlay.classList.remove('active');
        
        // Show tab
        this.showTab(tabId + 'Tab');
        UIManager.hapticFeedback('light');
        
        // Load users when Users tab is shown
        if (tabId === 'users' && typeof window.loadUsers === 'function') {
            window.loadUsers();
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
