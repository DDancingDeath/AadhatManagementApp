/**
 * @fileoverview Clear Data safety (#17 part A): owner only, nothing
 * pre-ticked, typed DELETE, JSON backup + audit before deleting, no
 * localStorage.clear().
 */

jest.mock('../firebase/firestore-service.js', () => ({
    FirebaseService: {
        readCollectionForBackup: jest.fn(async (name) => [{ id: `${name}1`, data: { total: 5 } }, { id: `${name}2`, data: {} }]),
        deleteDocsInBatches: jest.fn(async (name, ids) => ids.length)
    }
}));
jest.mock('../services/audit.js', () => ({ AuditService: { log: jest.fn(async () => {}), ACTIONS: { CLEAR_DATA: 'CLEAR_DATA' } } }));
jest.mock('../ui/ui-manager.js', () => ({
    UIManager: {
        showToast: jest.fn(),
        showLoading: jest.fn(),
        hideLoading: jest.fn(),
        showModal: jest.fn(async () => true),
        showModalWithHtml: jest.fn()
    }
}));

import { FirebaseService } from '../firebase/firestore-service.js';
import { AuditService } from '../services/audit.js';
import { UIManager } from '../ui/ui-manager.js';
import { AppState } from '../utils/state.js';
import { AdminManager } from '../modules/admin.js';
import { serializeForBackup, buildBackup, isDeleteConfirmed } from '../utils/data-export.js';

describe('data-export helpers', () => {
    test('serializes Timestamps, Dates and refs to plain JSON', () => {
        const ts = { seconds: 1, nanoseconds: 0, toMillis: () => 1000 };
        const ref = { path: 'items/a', firestore: {} };
        expect(serializeForBackup({ a: ts, b: [new Date(2000)], c: ref, d: 'x', e: null })).toEqual({
            a: { __type: 'timestamp', iso: '1970-01-01T00:00:01.000Z', millis: 1000 },
            b: [{ __type: 'timestamp', iso: '1970-01-01T00:00:02.000Z', millis: 2000 }],
            c: { __type: 'ref', path: 'items/a' },
            d: 'x',
            e: null
        });
        const backup = buildBackup({ items: [{ id: 'a', data: { name: 'Chana' } }] }, { now: new Date(0) });
        expect(backup).toMatchObject({ format: 'aadhat-backup-v1', collections: { items: [{ id: 'a', data: { name: 'Chana' } }] } });
    });

    test('only the exact word DELETE confirms', () => {
        expect(isDeleteConfirmed(' DELETE ')).toBe(true);
        expect(isDeleteConfirmed('delete')).toBe(false);
        expect(isDeleteConfirmed('')).toBe(false);
    });
});

describe('AdminManager.clearAllData', () => {
    let typedWord;
    let tickIds;
    let firstModalHtml;
    const order = [];

    beforeEach(() => {
        jest.useFakeTimers();
        order.length = 0;
        document.body.innerHTML = '<div id="modalMessage"></div>';
        AppState.userRole = 'owner';
        AppState.currentUser = { uid: 'owner1' };
        typedWord = 'DELETE';
        tickIds = ['purchases'];
        firstModalHtml = null;
        FirebaseService.deleteDocsInBatches.mockClear();
        FirebaseService.deleteDocsInBatches.mockImplementation(async (name, ids) => { order.push(`delete:${name}`); return ids.length; });
        AuditService.log.mockClear();
        AuditService.log.mockImplementation(async () => { order.push('audit'); });
        AdminManager.saveJsonBackup = jest.fn(async () => { order.push('backup'); return true; });
        UIManager.showModalWithHtml.mockImplementation(async (html) => {
            document.getElementById('modalMessage').innerHTML = html;
            if (!firstModalHtml) {
                firstModalHtml = html;
                tickIds.forEach(id => { document.querySelector(`[data-collection="${id}"]`).checked = true; });
            } else {
                document.getElementById('clearDataConfirmInput').value = typedWord;
            }
            return true;
        });
        jest.spyOn(Storage.prototype, 'clear');
    });
    afterEach(() => {
        jest.useRealTimers();
        delete AdminManager.saveJsonBackup;
    });

    test('nothing is pre-ticked', async () => {
        tickIds = [];
        await AdminManager.clearAllData();
        const div = document.createElement('div');
        div.innerHTML = firstModalHtml;
        expect(div.querySelectorAll('.collection-checkbox').length).toBeGreaterThan(0);
        expect(div.querySelectorAll('.collection-checkbox:checked').length).toBe(0);
        expect(FirebaseService.deleteDocsInBatches).not.toHaveBeenCalled();
    });

    test('wrong confirmation word deletes nothing', async () => {
        typedWord = 'delete';
        await AdminManager.clearAllData();
        expect(FirebaseService.deleteDocsInBatches).not.toHaveBeenCalled();
        expect(AdminManager.saveJsonBackup).not.toHaveBeenCalled();
    });

    test('DELETE: backup, then audit, then batched delete; localStorage kept', async () => {
        await AdminManager.clearAllData();
        expect(order).toEqual(['backup', 'audit', 'delete:purchases']);
        const [backup] = AdminManager.saveJsonBackup.mock.calls[0];
        expect(backup.collections.purchases.map(d => d.id)).toEqual(['purchases1', 'purchases2']);
        expect(FirebaseService.deleteDocsInBatches).toHaveBeenCalledWith('purchases', ['purchases1', 'purchases2']);
        expect(Storage.prototype.clear).not.toHaveBeenCalled();
    });

    test('backup cancelled and owner declines → nothing deleted', async () => {
        AdminManager.saveJsonBackup = jest.fn(async () => false);
        UIManager.showModal.mockImplementationOnce(async () => false);
        await AdminManager.clearAllData();
        expect(FirebaseService.deleteDocsInBatches).not.toHaveBeenCalled();
    });

    test('non-owner is refused', async () => {
        AppState.userRole = 'staff';
        await AdminManager.clearAllData();
        expect(UIManager.showModalWithHtml).not.toHaveBeenCalled();
    });
});
