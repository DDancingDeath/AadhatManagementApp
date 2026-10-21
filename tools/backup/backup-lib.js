/**
 * Pure helpers shared by export-firestore.js and restore-firestore.js.
 * No network access here, so they are unit-tested
 * (www/js/__tests__/firestore-backup.test.js).
 */
'use strict';

const BACKUP_FORMAT = 'aadhat-backup-v1';

/**
 * Converts Firestore values to JSON-safe tagged objects (recursively).
 * Timestamps keep seconds + nanoseconds so a restore is exact.
 * @param {*} value
 * @returns {*}
 */
function serialize(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) {
        return { __type: 'timestamp', iso: value.toISOString(), millis: value.getTime() };
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return { __type: 'bytes', base64: Buffer.from(value).toString('base64') };
    }
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value !== 'object') return value;
    if (typeof value.toMillis === 'function' && 'seconds' in value && 'nanoseconds' in value) {
        const millis = value.toMillis();
        return { __type: 'timestamp', iso: new Date(millis).toISOString(), millis, seconds: value.seconds, nanoseconds: value.nanoseconds };
    }
    if (typeof value.path === 'string' && value.firestore) return { __type: 'ref', path: value.path };
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length <= 2) {
        return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
    }
    const out = {};
    for (const k of Object.keys(value)) out[k] = serialize(value[k]);
    return out;
}

/**
 * Reverses serialize(). `types` supplies the Firestore constructors so this
 * stays testable without firebase-admin.
 * @param {*} value
 * @param {{Timestamp: any, GeoPoint: any, doc: (path: string) => any}} types
 * @returns {*}
 */
function deserialize(value, types) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => deserialize(v, types));
    switch (value.__type) {
        case 'timestamp':
            return typeof value.seconds === 'number'
                ? new types.Timestamp(value.seconds, value.nanoseconds || 0)
                : types.Timestamp.fromMillis(value.millis);
        case 'geopoint':
            return new types.GeoPoint(value.latitude, value.longitude);
        case 'ref':
            return types.doc(value.path);
        case 'bytes':
            return Buffer.from(value.base64, 'base64');
        default: {
            const out = {};
            for (const k of Object.keys(value)) out[k] = deserialize(value[k], types);
            return out;
        }
    }
}

/**
 * Production collections to back up: everything except dev_* (local testing
 * data) and anything listed in `exclude`.
 * @param {string[]} ids root collection ids
 * @param {string[]} [exclude]
 * @returns {string[]}
 */
function selectCollections(ids, exclude = []) {
    const skip = new Set(exclude.map(s => s.trim()).filter(Boolean));
    return ids.filter(id => !id.startsWith('dev_') && !skip.has(id)).sort();
}

/**
 * Free-quota guard. The Spark plan allows 50,000 document reads per day and a
 * full export reads every document once, so:
 *  - above `hardMax` documents nothing runs unless forced (the job fails so
 *    the owner gets an email);
 *  - above `weeklyAbove` documents the scheduled run only happens on Sundays;
 *  - a manual run (workflow_dispatch) always runs under `hardMax`.
 * @param {{totalDocs: number, scheduled: boolean, dayOfWeek: number, weeklyAbove: number, hardMax: number, force: boolean}} o
 * @returns {{run: boolean, fail: boolean, reason: string}}
 */
function decideRun({ totalDocs, scheduled, dayOfWeek, weeklyAbove, hardMax, force }) {
    if (force) return { run: true, fail: false, reason: 'forced' };
    if (totalDocs > hardMax) {
        return { run: false, fail: true, reason: `${totalDocs} documents is above the ${hardMax} safety limit (free quota is 50,000 reads/day). Run manually with force=true, or raise BACKUP_HARD_MAX.` };
    }
    if (scheduled && totalDocs > weeklyAbove && dayOfWeek !== 0) {
        return { run: false, fail: false, reason: `${totalDocs} documents is above ${weeklyAbove}; scheduled backups run weekly (Sundays) at this size.` };
    }
    return { run: true, fail: false, reason: 'ok' };
}

/**
 * Restore target collection name. Defaults to the dev_ copy so a restore
 * drill never touches production by accident.
 * @param {string} name
 * @param {'dev'|'prod'} target
 * @returns {string}
 */
function targetCollection(name, target) {
    if (target === 'prod') return name;
    return name.startsWith('dev_') ? name : `dev_${name}`;
}

module.exports = { BACKUP_FORMAT, serialize, deserialize, selectCollections, decideRun, targetCollection };
