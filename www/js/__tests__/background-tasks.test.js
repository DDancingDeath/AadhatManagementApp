/**
 * @fileoverview Startup background scheduling (#13): legacy scan on idle,
 * stock after the first paint, and who runs the legacy scan.
 */
import { whenIdle, afterFirstPaint, shouldScheduleLegacyScan } from '../utils/background-tasks.js';

describe('background startup work', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('whenIdle waits the minimum delay, then uses requestIdleCallback with a timeout', () => {
        const ric = jest.fn();
        const fn = jest.fn();
        whenIdle(fn, { minDelayMs: 3000, timeoutMs: 10000, win: { requestIdleCallback: ric } });
        jest.advanceTimersByTime(2999);
        expect(ric).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(ric).toHaveBeenCalledWith(expect.any(Function), { timeout: 10000 });
        expect(fn).not.toHaveBeenCalled();
        ric.mock.calls[0][0]();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('whenIdle falls back to setTimeout and can be cancelled', () => {
        const fn = jest.fn();
        whenIdle(fn, { minDelayMs: 100, win: {} });
        jest.advanceTimersByTime(101);
        expect(fn).toHaveBeenCalledTimes(1);

        const later = jest.fn();
        const cancel = whenIdle(later, { minDelayMs: 100, win: {} });
        cancel();
        jest.advanceTimersByTime(1000);
        expect(later).not.toHaveBeenCalled();
    });

    test('afterFirstPaint runs once after the next frame, or after the fallback when frames never come', () => {
        let frame;
        const fn = jest.fn();
        afterFirstPaint(fn, { maxWaitMs: 100, win: { requestAnimationFrame: cb => { frame = cb; } } });
        expect(fn).not.toHaveBeenCalled();
        frame();
        jest.advanceTimersByTime(0);
        expect(fn).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);

        const noFrames = jest.fn();
        afterFirstPaint(noFrames, { maxWaitMs: 100, win: { requestAnimationFrame: () => {} } });
        jest.advanceTimersByTime(99);
        expect(noFrames).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(noFrames).toHaveBeenCalledTimes(1);
    });

    test('only owner/manager devices with a usable checkpoint scan, and not offline', () => {
        expect(shouldScheduleLegacyScan({ canManage: true, hasCheckpoint: true })).toBe(true);
        expect(shouldScheduleLegacyScan({ canManage: false, hasCheckpoint: true })).toBe(false);
        expect(shouldScheduleLegacyScan({ canManage: true, hasCheckpoint: false })).toBe(false);
        expect(shouldScheduleLegacyScan({ canManage: true, hasCheckpoint: true, online: false })).toBe(false);
    });
});
