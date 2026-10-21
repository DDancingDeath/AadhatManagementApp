import { UIManager, resolveToastOptions } from '../ui/ui-manager.js';

describe('showToast (#51)', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '<div id="toast" class="toast"></div>';
    });
    afterEach(() => jest.useRealTimers());

    const toast = () => document.getElementById('toast');

    test("a type string is not used as the duration: 'error' stays >= 4 s and is styled", () => {
        UIManager.showToast('Failed to delete user', 'error');
        expect(toast().classList.contains('error')).toBe(true);
        jest.advanceTimersByTime(4000);
        expect(toast().classList.contains('show')).toBe(true);
        jest.advanceTimersByTime(1100);
        expect(toast().classList.contains('show')).toBe(false);
    });

    test('numeric durations still work and clear a previous type style', () => {
        UIManager.showToast('Oops', 'error');
        UIManager.showToast('Saved', 1000);
        expect(toast().classList.contains('error')).toBe(false);
        jest.advanceTimersByTime(999);
        expect(toast().classList.contains('show')).toBe(true);
        jest.advanceTimersByTime(2);
        expect(toast().classList.contains('show')).toBe(false);
    });

    test('resolveToastOptions handles every signature', () => {
        expect(resolveToastOptions()).toEqual({ type: null, duration: 2000 });
        expect(resolveToastOptions(3000)).toEqual({ type: null, duration: 3000 });
        expect(resolveToastOptions('error')).toEqual({ type: 'error', duration: 5000 });
        expect(resolveToastOptions('success')).toEqual({ type: 'success', duration: 2000 });
        expect(resolveToastOptions('warning', 7000)).toEqual({ type: 'warning', duration: 7000 });
        expect(resolveToastOptions('bogus')).toEqual({ type: null, duration: 2000 });
    });
});
