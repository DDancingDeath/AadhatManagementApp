/**
 * @fileoverview TIP reporting (#217): pure helpers that turn the local
 * counter delta / failure samples into Firestore documents, and decide when
 * to write (counters at most once per FLUSH_INTERVAL_MS per device).
 *
 * tipHealth/{deviceId}_{YYYYMMDD}: per-test counters by app version, updated
 * with FieldValue.increment (set + merge). tipFailures/{deviceId}_{day}_{1..20}:
 * create-only samples, at most MAX_FAILURES_PER_DAY per device per day.
 * @module tip/report
 */

import { MAX_FAILURES_PER_DAY } from './tip.js';

export const FLUSH_INTERVAL_MS = 30 * 60 * 1000;
export const FAILURE_DEBOUNCE_MS = 60 * 1000;

/**
 * Which writes are due now.
 * @param {{now: number, lastFlushAt: number, lastFailureFlushAt: number, hasPending: boolean, hasFailures: boolean}} s
 * @returns {{counters: boolean, failures: boolean}}
 */
export function planFlush({ now, lastFlushAt = 0, lastFailureFlushAt = 0, hasPending, hasFailures }) {
    return {
        counters: !!hasPending && now - (lastFlushAt || 0) >= FLUSH_INTERVAL_MS,
        failures: !!hasFailures && now - (lastFailureFlushAt || 0) >= FAILURE_DEBOUNCE_MS
    };
}

/** Small stable hash (base36, 4 chars) — keeps a uid out of the device id. */
export function hashString(s) {
    let h = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).padStart(4, '0').slice(-4);
}

/** Device id: random per-install part + hash of the signed-in user (two users, two docs). */
export function makeDeviceId(randomPart, uid) {
    const base = String(randomPart || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'dev000';
    return `${base}${hashString(uid)}`;
}

export const healthDocId = (deviceId, day) => `${deviceId}_${day}`;
export const failureDocId = (deviceId, f) => `${deviceId}_${f.day}_${f.seq}`;

/** Replace every number leaf with inc(n). */
function incrementLeaves(obj, inc) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
        out[k] = (v && typeof v === 'object') ? incrementLeaves(v, inc) : inc(v);
    }
    return out;
}

/**
 * tipHealth document for one day, written with set(..., {merge: true}).
 * @param {Object} a
 * @param {string} a.deviceId
 * @param {string} a.day - YYYYMMDD
 * @param {string} a.uid
 * @param {Object} a.delta - {versionKey: {testId: {n, r, d, ms}}}
 * @param {Function} a.inc - FieldValue.increment
 * @param {*} a.serverTime - FieldValue.serverTimestamp()
 */
export function buildHealthDoc({ deviceId, day, uid, delta, appVersion, buildId, platform, inc, serverTime }) {
    return {
        uid,
        deviceId,
        day,
        platform: String(platform || 'web').slice(0, 16),
        appVersion: String(appVersion || 'unknown').slice(0, 20),
        buildId: String(buildId || '').slice(0, 64),
        updatedAt: serverTime,
        v: incrementLeaves(delta, inc)
    };
}

/** tipFailures document (create-only) for one sample. */
export function buildFailureDoc({ uid, deviceId, platform, failure: f, serverTime }) {
    const doc = {
        uid,
        deviceId,
        day: f.day,
        test: String(f.test).slice(0, 32),
        result: f.result,
        reason: Number(f.reason) || 0,
        reasonName: String(f.reasonName || '').slice(0, 40),
        flags: f.flags || {},
        props: f.props || {},
        errors: Math.min(999, Number(f.errors) || 0),
        appVersion: String(f.appVersion || 'unknown').slice(0, 20),
        buildId: String(f.buildId || '').slice(0, 64),
        platform: String(platform || 'web').slice(0, 16),
        at: Number(f.at) || 0,
        createdAt: serverTime
    };
    if (f.durationMs != null) doc.durationMs = Math.round(f.durationMs);
    return doc;
}

/** Sequence numbers a device may use per day (matches firestore.rules). */
export const validFailureSeq = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_FAILURES_PER_DAY;
