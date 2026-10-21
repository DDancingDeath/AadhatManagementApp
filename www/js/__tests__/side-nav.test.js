/**
 * @jest-environment jsdom
 */
import { NavigationManager } from '../ui/navigation.js';

function render() {
    document.body.innerHTML = `
        <div class="side-nav" id="sideNav">
            <div class="nav-header"><h2>Aadhat</h2></div>
            <nav class="nav-menu"><a href="#" id="link">Today</a></nav>
        </div>
        <div class="overlay" id="overlay"></div>
        <button id="underlying">Save</button>`;
    NavigationManager.initMenuDismiss();
}

const isOpen = () => document.getElementById('sideNav').classList.contains('active');
const overlayActive = () => document.getElementById('overlay').classList.contains('active');

describe('side nav dismiss (#177)', () => {
    beforeEach(render);

    test('tapping the overlay closes the open menu', () => {
        NavigationManager.toggleMenu();
        expect(isOpen()).toBe(true);
        expect(overlayActive()).toBe(true);

        document.getElementById('overlay').click();
        expect(isOpen()).toBe(false);
        expect(overlayActive()).toBe(false);
    });

    test('still closes if initMenuDismiss is called twice (no double toggle)', () => {
        NavigationManager.initMenuDismiss();
        NavigationManager.openMenu();
        document.getElementById('overlay').click();
        expect(isOpen()).toBe(false);
    });

    test('overlay tap does not reach handlers on the page underneath', () => {
        const bodyClick = jest.fn();
        document.body.addEventListener('click', bodyClick);
        NavigationManager.openMenu();
        document.getElementById('overlay').click();
        expect(bodyClick).not.toHaveBeenCalled();
    });

    test('clicking inside the drawer keeps it open', () => {
        NavigationManager.openMenu();
        document.querySelector('.nav-header').click();
        expect(isOpen()).toBe(true);
    });

    test('Esc closes the open menu', () => {
        NavigationManager.openMenu();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(isOpen()).toBe(false);
    });

    test('choosing a menu item closes the menu', () => {
        NavigationManager.openMenu();
        NavigationManager.showTabFromNav('day');
        expect(isOpen()).toBe(false);
        expect(overlayActive()).toBe(false);
    });
});
