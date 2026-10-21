/**
 * @fileoverview What a device does when no stock checkpoint is usable (#194).
 * After a stock calculation version change every owner/manager device used to
 * read the full history first and only then race for the rebuild lease, so N
 * devices cost N (+1) full-history reads. Now one device takes the lease and
 * does the single full read; the others wait for its checkpoint — but only
 * for a short, bounded time, so a dead lease (holder closed the app) or a
 * holder whose clock runs ahead can never keep stock "updating" for long.
 * @module utils/rebuild-lease
 */

/** Max total time per session a device waits for another device's rebuild. */
export const LEASE_MAX_WAIT_MS = 45 * 1000;

/** User id part of a lease token (`<uid>:<time>:<random>`). */
export const leaseOwnerUid = (token) => (typeof token === 'string' && token.includes(':') ? token.slice(0, token.indexOf(':')) : null);

/**
 * @param {Object} p
 * @param {boolean} p.canManage owner/manager (may write the checkpoint)
 * @param {number} [p.leaseUntil] checkpoint doc `rebuildingUntil` (ms epoch, holder's clock)
 * @param {string} [p.leaseBy] checkpoint doc `rebuildingBy` token
 * @param {string} [p.uid] current user's uid
 * @param {number} p.now
 * @param {number} [p.waitedMs] how long this session has already waited (local clock)
 * @param {number} [p.maxWaitMs]
 * @param {boolean} [p.inFlight] this device is already rebuilding
 * @param {boolean} [p.attempted] this device already tried a rebuild this session
 * @returns {'join'|'wait'|'rebuild'|'full-read'}
 *   join: await this device's running rebuild (no new read);
 *   wait: another user's device holds the lease: keep the last stock, no full read (bounded);
 *   rebuild: take the lease, then read full history once and write the checkpoint;
 *   full-read: replay full history locally (members, after a failed rebuild, or after waiting long enough).
 */
export function decideStockRebuild({
    canManage, leaseUntil = 0, leaseBy = null, uid = null, now,
    waitedMs = 0, maxWaitMs = LEASE_MAX_WAIT_MS, inFlight = false, attempted = false
}) {
    if (inFlight) return 'join';
    // A lease left by this same user (e.g. the app was reloaded mid-rebuild) never blocks them.
    const ownLease = !!uid && leaseOwnerUid(leaseBy) === uid;
    if (Number(leaseUntil) > now && !ownLease && waitedMs < maxWaitMs) return 'wait';
    if (canManage && !attempted && (ownLease || !(Number(leaseUntil) > now))) return 'rebuild';
    return 'full-read';
}
