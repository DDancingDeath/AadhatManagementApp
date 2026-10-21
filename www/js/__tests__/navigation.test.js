import { NavigationManager } from '../ui/navigation.js';

describe('setActiveNavLink (#111)', () => {
    test('highlights only the link for the given tab (startup Billing)', () => {
        document.body.innerHTML = `
            <ul class="nav-menu">
                <li><a href="#" class="active" onclick="window.app.nav.showTab('day', event)">Day</a></li>
                <li><a href="#" onclick="window.app.nav.showTab('billing', event)">Billing</a></li>
            </ul>`;
        NavigationManager.setActiveNavLink('billing');
        const active = [...document.querySelectorAll('.nav-menu a.active')].map(a => a.textContent);
        expect(active).toEqual(['Billing']);
    });
});