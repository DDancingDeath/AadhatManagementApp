/**
 * @fileoverview Item Excel import is a merge, never a wipe-and-recreate (#67).
 */

jest.mock('../firebase/firestore-service.js', () => ({
    FirebaseService: {
        importItems: jest.fn(async (updates, adds) => adds.map((a, i) => ({ ...a.fields, id: `new${i}` }))),
        deleteItem: jest.fn(async () => {}),
        saveItem: jest.fn(async (item) => item)
    }
}));
jest.mock('../services/audit.js', () => ({ AuditService: { log: jest.fn(async () => {}), ACTIONS: { EDIT_ITEM: 'EDIT_ITEM' } } }));
jest.mock('../ui/ui-manager.js', () => ({
    UIManager: {
        showToast: jest.fn(),
        showLoading: jest.fn(),
        hideLoading: jest.fn(),
        showModalWithHtml: jest.fn(async () => true)
    }
}));
jest.mock('../utils/lazy-scripts.js', () => ({ ensureXLSX: jest.fn(async () => {}) }));

import { FirebaseService } from '../firebase/firestore-service.js';
import { UIManager } from '../ui/ui-manager.js';
import { AppState } from '../utils/state.js';
import { ItemsManager } from '../modules/items.js';
import { planItemImport, itemToSheetRow, parseRateCell } from '../utils/item-catalog.js';
import { computeStock } from '../utils/stock-replay.js';

const catalogue = () => ([
    { id: 'a', name: 'Chana', hindiName: 'चना', contactPerson: '', rates: [50], saleRates: [60], wholesaleRates: [55], extra: 'keep' },
    { id: 'b', name: 'Gehu', hindiName: 'गेहूं', contactPerson: 'Ram', rates: [30], saleRates: [], wholesaleRates: [] },
    { id: 'c', name: 'Moong', hindiName: '', contactPerson: '', rates: [], saleRates: [], wholesaleRates: [] }
]);

describe('planItemImport', () => {
    test('matches by id, else by case/space-insensitive name; never plans a delete', () => {
        const rows = [
            { ID: 'a', 'Item Name': 'Chana Desi', 'Hindi Name': 'चना', 'Purchase Rates': '51, 52' },
            { ID: '', 'Item Name': '  Gehu ', 'Hindi Name': 'गेहूं', 'Purchase Rates': 30 },
            { ID: '', 'Item Name': 'Arhar', 'Hindi Name': 'अरहर', 'Purchase Rates': '90' }
        ];
        const plan = planItemImport(rows, catalogue());
        expect(plan.updates.map(u => u.id)).toEqual(['a']);
        expect(plan.updates[0].fields).toEqual({ name: 'Chana Desi', hindiName: 'चना', rates: [51, 52] });
        expect(plan.unchanged.map(u => u.id)).toEqual(['b']);
        expect(plan.adds).toHaveLength(1);
        expect(plan.adds[0].fields).toMatchObject({ name: 'Arhar', hindiName: 'अरहर', rates: [90], saleRates: [] });
        expect(plan.errors).toEqual([]);
        // 'c' (Moong) is not in the sheet and is simply not touched
        expect(JSON.stringify(plan)).not.toContain('"c"');
    });

    test('Hindi-only match updates the existing item', () => {
        const plan = planItemImport([{ 'Item Name': 'चना', 'Purchase Rates': '49' }], catalogue());
        expect(plan.updates).toEqual([expect.objectContaining({ id: 'a', fields: { name: 'चना', rates: [49] } })]);
    });

    test('reports per-row errors and skips empty rows', () => {
        const rows = [
            { ID: '', 'Item Name': '', 'Purchase Rates': '' },
            { ID: '', 'Item Name': 'X', 'Purchase Rates': 'abc' },
            { ID: 'zzz', 'Item Name': 'Y' },
            { ID: '', 'Item Name': '', 'Purchase Rates': '5' },
            { ID: 'c', 'Item Name': 'Gehu' },
            { ID: '', 'Item Name': 'New1' },
            { ID: '', 'Item Name': 'new1 ' },
            { ID: 'a', 'Item Name': 'Chana' },
            { ID: '', 'Item Name': 'chana' }
        ];
        const plan = planItemImport(rows, catalogue());
        expect(plan.skipped).toBe(1);
        expect(plan.errors.map(e => e.rowNumber)).toEqual([3, 4, 5, 6, 8, 10]);
        expect(plan.errors[0].reason).toMatch(/Invalid purchase rate "abc"/);
        expect(plan.errors[1].reason).toMatch(/not found/);
        expect(plan.errors[2].reason).toMatch(/empty/);
        expect(plan.errors[3].reason).toMatch(/another item/);
        expect(plan.adds.map(a => a.fields.name)).toEqual(['New1']);
    });

    test('a missing column leaves that field alone; a blank cell clears it', () => {
        const noRateCols = planItemImport([{ ID: 'a', 'Item Name': 'Chana', 'Hindi Name': 'चना' }], catalogue());
        expect(noRateCols.unchanged.map(u => u.id)).toEqual(['a']);
        const blank = planItemImport([{ ID: 'a', 'Item Name': 'Chana', 'Wholesale Rates': '' }], catalogue());
        expect(blank.updates[0].fields).toEqual({ name: 'Chana', wholesaleRates: [] });
    });

    test('export rows round-trip as unchanged', () => {
        const rows = catalogue().map(itemToSheetRow);
        const plan = planItemImport(rows, catalogue());
        expect(plan.unchanged.map(u => u.id)).toEqual(['a', 'b', 'c']);
        expect(plan.updates).toEqual([]);
        expect(plan.adds).toEqual([]);
    });

    test('parseRateCell', () => {
        expect(parseRateCell('41,42')).toEqual({ rates: [41, 42], error: null });
        expect(parseRateCell(45)).toEqual({ rates: [45], error: null });
        expect(parseRateCell('')).toEqual({ rates: [], error: null });
        expect(parseRateCell('0').error).toBe('"0"');
    });
});

describe('ItemsManager.importFromExcel', () => {
    let sheetRows;
    beforeEach(() => {
        AppState.items = catalogue();
        AppState.purchaseHistory = [];
        AppState.salesHistory = [];
        AppState.retailSalesHistory = [];
        AppState.userRole = 'owner';
        AppState.settings = { showHindi: false };
        document.body.innerHTML = '<input id="itemsSearchInput" value=""><table><tbody id="itemsViewTableBody"></tbody></table>';
        global.XLSX = {
            read: jest.fn(() => ({ SheetNames: ['Items'], Sheets: { Items: {} } })),
            utils: {
                sheet_to_json: jest.fn(() => sheetRows),
                book_new: jest.fn(() => ({})),
                json_to_sheet: jest.fn(() => ({})),
                book_append_sheet: jest.fn()
            },
            writeFile: jest.fn()
        };
        FirebaseService.importItems.mockClear();
        FirebaseService.deleteItem.mockClear();
        UIManager.showModalWithHtml.mockImplementation(async () => true);
    });
    afterEach(() => { delete global.XLSX; });

    const fileEvent = () => ({ target: { value: 'x.xlsx', files: [{ arrayBuffer: async () => new ArrayBuffer(1) }] } });

    test('keeps ids, never deletes, backs up first, and old bills still map to their stock', async () => {
        sheetRows = [
            { ID: '', 'Item Name': 'CHANA', 'Purchase Rates': '58' },
            { ID: '', 'Item Name': 'Arhar', 'Purchase Rates': '90' }
        ];
        const purchases = [{ timestamp: 1, items: [{ itemId: 'a', name: 'Chana', qty: 100, rate: 50, total: 5000 }] }];
        const before = computeStock({ purchases }, AppState.items);

        await ItemsManager.importFromExcel(fileEvent());

        expect(FirebaseService.deleteItem).not.toHaveBeenCalled();
        expect(XLSX.writeFile.mock.calls[0][1]).toMatch(/^items_backup_before_import_/);
        const [updates, adds] = FirebaseService.importItems.mock.calls[0];
        expect(updates).toEqual([expect.objectContaining({ id: 'a', fields: { name: 'CHANA', rates: [58] } })]);
        expect(adds).toHaveLength(1);
        expect(AppState.items.map(i => i.id)).toEqual(['a', 'b', 'c', 'new0']);
        expect(AppState.items[0]).toMatchObject({ id: 'a', name: 'CHANA', extra: 'keep', saleRates: [60] });

        const after = computeStock({ purchases }, AppState.items);
        expect(Object.keys(after)).toEqual(['a']);
        expect(before.a.quantity).toBe(100);
        expect(after.a.quantity).toBe(100);
    });

    test('cancelling the preview writes nothing', async () => {
        sheetRows = [{ ID: '', 'Item Name': 'Arhar' }];
        UIManager.showModalWithHtml.mockImplementation(async () => false);
        await ItemsManager.importFromExcel(fileEvent());
        expect(FirebaseService.importItems).not.toHaveBeenCalled();
    });

    test('preview escapes sheet text', () => {
        const html = ItemsManager.importPreviewHtml({ updates: [], adds: [], unchanged: [], skipped: 0, errors: [{ rowNumber: 2, reason: 'Invalid purchase rate "<img src=x>"' }] });
        expect(html).not.toContain('<img');
    });
});
