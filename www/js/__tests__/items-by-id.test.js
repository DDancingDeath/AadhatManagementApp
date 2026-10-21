/**
 * @fileoverview Items page acts on item ids, never list positions (#29),
 * and blocks duplicate item names.
 */

jest.mock('../firebase/firestore-service.js', () => ({
    FirebaseService: {
        saveItem: jest.fn(async (item) => item),
        deleteItem: jest.fn(async () => {}),
        notifyRateChange: jest.fn()
    }
}));
jest.mock('../services/audit.js', () => ({ AuditService: { log: jest.fn(async () => {}), ACTIONS: { DELETE_ITEM: 'DELETE_ITEM' } } }));
jest.mock('../ui/ui-manager.js', () => ({
    UIManager: {
        showToast: jest.fn(),
        showLoading: jest.fn(),
        hideLoading: jest.fn(),
        showModal: jest.fn(async () => true),
        withLoading: jest.fn(async (fn) => fn())
    }
}));

import { FirebaseService } from '../firebase/firestore-service.js';
import { UIManager } from '../ui/ui-manager.js';
import { AppState } from '../utils/state.js';
import { ItemsManager } from '../modules/items.js';
import { findDuplicateItem, normalizeItemName, itemUsageFrequency } from '../utils/item-catalog.js';

const A = () => ({ id: 'a', name: 'Chana', hindiName: 'चना', rates: [50], saleRates: [], wholesaleRates: [] });
const B = () => ({ id: 'b', name: 'Gehu', hindiName: 'गेहूं', rates: [30], saleRates: [], wholesaleRates: [], createdAt: 123 });
const C = () => ({ id: 'c', name: 'Moong', hindiName: '', rates: [], saleRates: [], wholesaleRates: [] });

function setupDom() {
    document.body.innerHTML = `
        <input id="itemsSearchInput" value="">
        <table><tbody id="itemsViewTableBody"></tbody></table>
        <div id="itemEditOverlay" style="display:none">
            <input id="itemModalName"><input id="itemModalHindiName"><input id="itemModalContactPerson">
            <div id="itemModalPurchaseRates"></div><div id="itemModalWholesaleRates"></div><div id="itemModalSaleRates"></div>
            <button id="itemModalDeleteBtn"></button>
        </div>`;
}

beforeEach(() => {
    setupDom();
    AppState.items = [A(), B(), C()];
    AppState.stock = {};
    AppState.userRole = 'owner';
    AppState.settings = { showHindi: false };
    FirebaseService.saveItem.mockClear();
    FirebaseService.deleteItem.mockClear();
    UIManager.showToast.mockClear();
    UIManager.showModal.mockImplementation(async () => true);
});

describe('edit dialog uses the item id', () => {
    test('list changes while the dialog is open → the edited item (by id) is saved', async () => {
        ItemsManager.openEditModal('b');
        // Another phone deletes "Chana" and the live listener replaces the array
        AppState.items = [C(), B()];
        document.getElementById('itemModalName').value = 'Gehu Sharbati';
        await ItemsManager.saveItemFromModal();

        expect(FirebaseService.saveItem).toHaveBeenCalledTimes(1);
        const saved = FirebaseService.saveItem.mock.calls[0][0];
        expect(saved.id).toBe('b');
        expect(saved.name).toBe('Gehu Sharbati');
        expect(saved.createdAt).toBe(123);
        expect(AppState.items.map(i => i.name)).toEqual(['Moong', 'Gehu Sharbati']);
    });

    test('item deleted elsewhere while editing → nothing is saved', async () => {
        ItemsManager.openEditModal('b');
        AppState.items = [A(), C()];
        await ItemsManager.saveItemFromModal();
        expect(FirebaseService.saveItem).not.toHaveBeenCalled();
        expect(AppState.items.map(i => i.id)).toEqual(['a', 'c']);
    });

    test('list changes while the delete confirm is open → the right item is deleted', async () => {
        ItemsManager.openEditModal('b');
        UIManager.showModal.mockImplementation(async () => {
            AppState.items = [C(), B(), A()];
            return true;
        });
        await ItemsManager.deleteItemFromModal();
        expect(FirebaseService.deleteItem).toHaveBeenCalledWith('b');
        expect(AppState.items.map(i => i.id)).toEqual(['c', 'a']);
    });

    test('item vanishes during the delete confirm → no delete', async () => {
        UIManager.showModal.mockImplementation(async () => {
            AppState.items = [A(), C()];
            return true;
        });
        await ItemsManager.deleteItem('b');
        expect(FirebaseService.deleteItem).not.toHaveBeenCalled();
    });
});

describe('debounced saves target the item by id', () => {
    test('rate edit saves the same item after the list reorders', async () => {
        jest.useFakeTimers();
        try {
            ItemsManager.updateRate('b', 0, '35');
            AppState.items = [AppState.items[2], AppState.items[1], AppState.items[0]];
            jest.advanceTimersByTime(600);
            await Promise.resolve();
            expect(FirebaseService.saveItem).toHaveBeenCalledTimes(1);
            const saved = FirebaseService.saveItem.mock.calls[0][0];
            expect(saved.id).toBe('b');
            expect(saved.rates).toEqual([35]);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('table rows', () => {
    test('row click opens the clicked item even after a re-sort', () => {
        ItemsManager.renderItemsTable();
        const rows = [...document.querySelectorAll('#itemsViewTableBody tr')];
        const gehuRow = rows.find(r => r.textContent.includes('Gehu'));
        AppState.items = [B(), C(), A()];
        gehuRow.onclick();
        expect(ItemsManager.currentEditingItemId).toBe('b');
        expect(document.getElementById('itemModalName').value).toBe('Gehu');
    });
});

describe('duplicate item names are blocked', () => {
    test('adding a name that differs only by case/spaces is refused', async () => {
        ItemsManager.openAddModal();
        document.getElementById('itemModalName').value = '  chANa ';
        await ItemsManager.saveItemFromModal();
        expect(FirebaseService.saveItem).not.toHaveBeenCalled();
        expect(UIManager.showToast.mock.calls[0][0]).toMatch(/already exists.*पहले से/);
    });

    test('a Hindi name clash is refused on edit', async () => {
        ItemsManager.openEditModal('c');
        document.getElementById('itemModalHindiName').value = 'गेहूं ';
        await ItemsManager.saveItemFromModal();
        expect(FirebaseService.saveItem).not.toHaveBeenCalled();
    });

    test('saving an item under its own name is allowed', async () => {
        ItemsManager.openEditModal('a');
        await ItemsManager.saveItemFromModal();
        expect(FirebaseService.saveItem).toHaveBeenCalledTimes(1);
    });

    test('findDuplicateItem normalises case, spaces and checks both names', () => {
        const items = [A(), B()];
        expect(findDuplicateItem(items, { name: 'GEHU' })?.item.id).toBe('b');
        expect(findDuplicateItem(items, { name: 'chana  dal' })).toBeNull();
        expect(findDuplicateItem(items, { name: 'X', hindiName: 'चना' })?.item.id).toBe('a');
        expect(findDuplicateItem(items, { name: 'chana' }, 'a')).toBeNull();
        expect(findDuplicateItem(items, { name: '', hindiName: '' })).toBeNull();
        expect(normalizeItemName('  Piyar   Dana ')).toBe('piyar dana');
    });
});

describe('most-used badge and sort (#75)', () => {
    const histories = () => ({
        purchaseHistory: [
            { items: [{ itemId: 'c', name: 'Moong' }, { name: 'gehu ' }] },
            { items: [{ itemId: 'c', name: 'Moong' }] }
        ],
        salesHistory: [{ items: [{ name: 'मूंग', itemId: 'gone' }, { itemId: 'c', name: 'Moong' }] }],
        retailSalesHistory: [{ items: [{ itemName: 'गेहूं' }, { name: 'unknown thing' }] }]
    });

    afterEach(() => {
        AppState.purchaseHistory = [];
        AppState.salesHistory = [];
        AppState.retailSalesHistory = [];
    });

    test('itemUsageFrequency counts bill lines per item id across all three histories', () => {
        const items = [A(), B(), { ...C(), hindiName: 'मूंग' }];
        const h = histories();
        expect(itemUsageFrequency({
            purchases: h.purchaseHistory, wholesaleSales: h.salesHistory, retailSales: h.retailSalesHistory
        }, items)).toEqual({ c: 4, b: 2 });
    });

    test('Items table shows badges and sorts most used first', () => {
        Object.assign(AppState, histories());
        ItemsManager.renderItemsTable();
        const rows = [...document.querySelectorAll('#itemsViewTableBody tr')];
        expect(rows.map(r => r.cells[0].childNodes[0].textContent.trim())).toEqual(['Moong', 'Gehu', 'Chana']);
        expect(rows[0].querySelector('span').textContent).toBe('3');
        expect(rows[1].querySelector('span').textContent).toBe('2');
        expect(rows[2].querySelector('span')).toBeNull();
    });
});