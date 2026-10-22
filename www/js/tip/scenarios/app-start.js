/**
 * @fileoverview TIP scenario AppStart (#217): the first usable screen appears
 * within APP_START_FAIL_MS of sign-in data loading. Started in main.js
 * initializeUserData(), completed at the "app-shown" startup mark.
 * Reason codes are stable: never renumber or reuse them.
 * @module tip/scenarios/app-start
 */

export const APP_START_WARN_MS = 6000;
export const APP_START_FAIL_MS = 15000;

export const AppStartTest = {
    id: 'AppStart',
    reasons: { slow_start: 1, load_failed: 2 },
    timeoutMs: 2 * 60 * 1000,
    target: 95,
    // Closed while still loading offline: not an app failure.
    onAbandon: (flags) => (flags.offline ? 'discard' : 'fail'),
    /**
     * @param {{loadFailed?: boolean}} props
     * @param {{blocked?: boolean, signedOut?: boolean}} flags
     * @param {{durationMs: number, expired: boolean, online: boolean}} ctx
     */
    evaluate(props, flags, ctx) {
        // Pending / rejected / outdated: no app screen is expected.
        if (flags.blocked || flags.signedOut) return 'discard';
        if (props.loadFailed) return ctx.online ? { result: 'fail', reason: 'load_failed' } : 'ignore';
        if (ctx.durationMs > APP_START_FAIL_MS) return { result: 'fail', reason: 'slow_start' };
        if (ctx.durationMs > APP_START_WARN_MS) return { result: 'warn', reason: 'slow_start' };
        return 'succeed';
    }
};
