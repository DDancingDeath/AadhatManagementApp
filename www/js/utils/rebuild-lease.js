/**
 * @fileoverview What a device does when no stock checkpoint is usable (#194).
 * After a stock calculation version change every owner/manager device used to
 * read the full history first and only then race for the rebuild lease, so N
 * devices cost N (+1) full-history reads. Now one device takes the lease and
 * does the single full read; the others wait for its checkpoint.
 * @module utils/rebuild-lease
 */

/**
 * @param {Object} p
 * @param {boolean} p.canManage owner/manager (may write the checkpoint)
 * @param {number} [p.leaseUntil] checkpoint doc `rebuildingUntil` (ms epoch)
 * @param {number} p.now
 * @param {boolean} [p.inFlight] this device is already rebuilding
 * @param {boolean} [p.attempted] this device already tried a rebuild this session
 * @returns {'join'|'wait'|'rebuild'|'full-read'}
 *   join: await this device's running rebuild (no new read);
 *   wait: another device holds the lease: keep the last stock, no full read;
 *   rebuild: take the lease, then read full history once and write the checkpoint;
 *   full-read: replay full history locally (members, or after a failed rebuild).
 */
export function decideStockRebuild({ canManage, leaseUntil = 0, now, inFlight = false, attempted = false }) {
    if (inFlight) return 'join';
    if (Number(leaseUntil) > now) return 'wait';
    if (canManage && !attempted) return 'rebuild';
    return 'full-read';
}
