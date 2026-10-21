/**
 * @fileoverview Item rate add/delete run from inline onclick handlers, so a
 * failed save must not become an unhandled rejection (#126): the local change
 * is undone and the user gets a toast.
 */
import { ItemsManager } from '../modules/items.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { UIManager } from '../ui/ui-manager.js';
import { AppState } from '../utils/state.js';

beforeEach(() => {
    AppState.items = [{ id: 'i1', name: 'Gehu', rates: [10, 20], saleRates: [30], wholesaleRates: [] }];
    jest.spyOn(ItemsManager, 'renderItems').mockImplementation(() => {});
    jest.spyOn(UIManager, 'showToast').mockImplementation(() => {});
});

test('failed delete restores the rate and tells the user', async () => {
    jest.spyOn(FirebaseService, 'saveItem').mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(ItemsManager.deleteRate('i1', 0)).resolves.toBeUndefined();
    expect(AppState.items[0].rates).toEqual([10, 20]);
    expect(UIManager.showToast).toHaveBeenCalledWith(expect.stringMatching(/Rate not saved/), expect.any(Number));
    expect(ItemsManager.renderItems).toHaveBeenCalled();
});

test('failed add removes the empty rate again', async () => {
    jest.spyOn(FirebaseService, 'saveItem').mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await ItemsManager.addSaleRate('i1');
    await ItemsManager.addWholesaleRate('i1');
    expect(AppState.items[0].saleRates).toEqual([30]);
    expect(AppState.items[0].wholesaleRates).toEqual([]);
});

test('successful delete saves the shortened list without a toast', async () => {
    const save = jest.spyOn(FirebaseService, 'saveItem').mockResolvedValue(undefined);
    await ItemsManager.deleteSaleRate('i1', 0);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ saleRates: [] }));
    expect(UIManager.showToast).not.toHaveBeenCalled();
});
