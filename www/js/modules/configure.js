// -------------------- CONFIGURE MANAGER --------------------

import { AppState } from '../utils/state.js';
import { ItemsManager } from './items.js';

const ConfigureManager = {
    showSubTab(subTab) {
        // Update button states
        const buttons = document.querySelectorAll('.filter-btn[data-tab]');
        buttons.forEach(btn => {
            if (btn.dataset.tab === subTab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Show/hide sub-tab content
        const itemsSubTab = document.getElementById('configureItemsSubTab');
        const othersSubTab = document.getElementById('configureOthersSubTab');

        if (subTab === 'items') {
            if (itemsSubTab) itemsSubTab.style.display = 'block';
            if (othersSubTab) othersSubTab.style.display = 'none';
            // Render items when switching to items tab
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => ItemsManager.renderItems(), 0);
        } else if (subTab === 'others') {
            if (itemsSubTab) itemsSubTab.style.display = 'none';
            if (othersSubTab) othersSubTab.style.display = 'block';
        }
    },

    initialize() {
        // Default to items sub-tab
        this.showSubTab('items');
    }
};

export { ConfigureManager };
