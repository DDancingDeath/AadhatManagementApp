import { resolveShortcut, TAB_SHORTCUTS } from '../utils/keyboard-shortcuts.js';

const key = (k, extra = {}) => ({ key: k, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra });
const billing = { activeTab: 'billing', billingMode: 'purchase' };

describe('resolveShortcut', () => {
    test('Alt+digit switches to the matching side-nav tab, even while typing', () => {
        expect(resolveShortcut(key('1', { altKey: true, code: 'Digit1' }), { activeTab: 'history' })).toEqual({ type: 'tab', tabId: 'day' });
        expect(resolveShortcut(key('¡', { altKey: true, code: 'Digit6' }), { activeTab: 'billing', typing: true }))
            .toEqual({ type: 'tab', tabId: TAB_SHORTCUTS[5].tabId });
        expect(resolveShortcut(key('0', { altKey: true, code: 'Digit0' }), billing)).toBeNull();
    });

    test('Ctrl+S / Ctrl+P target the bill that is on screen', () => {
        expect(resolveShortcut(key('s', { ctrlKey: true }), billing)).toEqual({ type: 'click', selector: '#saveBillBtn' });
        expect(resolveShortcut(key('P', { metaKey: true }), { ...billing, billingMode: 'sale', typing: true }))
            .toEqual({ type: 'click', selector: '#printSaleBtn' });
        expect(resolveShortcut(key('s', { ctrlKey: true }), { activeTab: 'wholesale-sales', wholesaleEntryVisible: true }))
            .toEqual({ type: 'click', selector: '#salesEntrySection .save-sale-btn' });
    });

    test('Ctrl+S / Ctrl+P fall through where there is no bill, behind a dialog, on key repeat or AltGr', () => {
        expect(resolveShortcut(key('p', { ctrlKey: true }), { activeTab: 'history' })).toBeNull();
        expect(resolveShortcut(key('s', { ctrlKey: true }), { activeTab: 'wholesale-sales', wholesaleEntryVisible: false })).toBeNull();
        expect(resolveShortcut(key('s', { ctrlKey: true }), { ...billing, modalOpen: true })).toBeNull();
        expect(resolveShortcut(key('s', { ctrlKey: true, repeat: true }), billing)).toBeNull();
        expect(resolveShortcut(key('s', { ctrlKey: true, altKey: true }), billing)).toBeNull();
    });

    test('plain keys are ignored while typing in a field', () => {
        expect(resolveShortcut(key('/'), { ...billing, typing: true })).toBeNull();
        expect(resolveShortcut(key('?'), { ...billing, typing: true })).toBeNull();
        expect(resolveShortcut(key('/'), { activeTab: 'history' })).toEqual({ type: 'focus-search' });
        expect(resolveShortcut(key('?', { shiftKey: true }), billing)).toEqual({ type: 'toggle-help' });
    });

    test('Escape closes help first, then an open dialog; nothing otherwise', () => {
        expect(resolveShortcut(key('Escape'), { ...billing, helpOpen: true, modalOpen: true })).toEqual({ type: 'close-help' });
        expect(resolveShortcut(key('Escape'), { ...billing, modalOpen: true, typing: true })).toEqual({ type: 'close-modal' });
        expect(resolveShortcut(key('Escape'), billing)).toBeNull();
    });

    test('nothing fires before login (no active tab)', () => {
        expect(resolveShortcut(key('1', { altKey: true, code: 'Digit1' }), { activeTab: null })).toBeNull();
    });
});
