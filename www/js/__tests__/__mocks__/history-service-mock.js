/**
 * Minimal stand-in for the FirebaseService history-window API (implemented by
 * firestore-service.js): getHistoryWindowStart / ensureHistoryFrom /
 * loadOlderHistory / isFullHistoryLoaded. Install on window.FirebaseService.
 * @param {Object} [opts]
 * @param {number} [opts.loadedFrom] - initial window start (ms); 0 = full
 * @param {number} [opts.earliest] - oldest record time; loadOlderHistory reaches end there
 */
export function createHistoryServiceMock({ loadedFrom = 0, earliest = 0 } = {}) {
    const svc = {
        loadedFrom,
        getHistoryWindowStart: () => svc.loadedFrom,
        isFullHistoryLoaded: () => svc.loadedFrom === 0,
        ensureHistoryFrom: jest.fn(async (from) => {
            if (from === null || from === undefined || from <= earliest) svc.loadedFrom = 0;
            else if (svc.loadedFrom && from < svc.loadedFrom) svc.loadedFrom = from;
        }),
        loadOlderHistory: jest.fn(async (months = 1) => {
            const d = new Date(svc.loadedFrom);
            const next = new Date(d.getFullYear(), d.getMonth() - months, 1).getTime();
            svc.loadedFrom = next <= earliest ? 0 : next;
            return { loadedFrom: svc.loadedFrom, reachedEnd: svc.loadedFrom === 0 };
        })
    };
    return svc;
}
