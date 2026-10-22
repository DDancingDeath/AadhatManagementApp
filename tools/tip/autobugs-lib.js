/**
 * Test in Production auto bug filing (#217): pure logic used by
 * tools/tip/autobugs.js (.github/workflows/tip-autobugs.yml).
 *
 * Input: tipHealth docs ({deviceId, day, v: {ver: {test: {n, r, d, ms}}}}) and
 * tipFailures samples. Reason counters are keyed result + code (`f1`, `a16385`).
 * Output: a plan of GitHub issue actions (create / update / reopen / close),
 * deduplicated by a hidden marker holding the failure hash.
 */
'use strict';

const crypto = require('crypto');

const LABEL = 'tip-auto';
const FAIL_RESULTS = ['f', 'a', 'e'];
const COUNTED = ['s', 'w', 'f', 'a', 'e'];
const SYSTEM_REASON_NAMES = {
    16385: 'abandoned', 16386: 'expired', 16387: 'errors_seen', 16388: 'evaluate_threw', 16389: 'rolled_back', 16390: 'bad_verdict'
};
const DEFAULTS = { recentDays: 2, baselineDays: 7, healthyDays: 7, minCount: 3, maxTop: 5, spikeMinRuns: 10, spikeMinFailures: 3 };

/** Stable short hash of test + reason + app version (the dedupe key). */
function failureHash(test, reason, version) {
    return crypto.createHash('sha1').update(`${test}|${reason}|${version}`).digest('hex').slice(0, 12);
}

const marker = (hash) => `<!-- tip-hash:${hash} -->`;

/** Hash stored in an issue body, or null. */
function hashFromBody(body) {
    const m = /<!-- tip-hash:([0-9a-z]+) -->/.exec(body || '');
    return m ? m[1] : null;
}

/** YYYYMMDD ± n days. */
function addDays(day, n) {
    const dt = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)) + n));
    return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

const sum = (n, keys) => keys.reduce((s, k) => s + (Number(n && n[k]) || 0), 0);
const versionLabel = (v) => String(v || 'unknown').replace(/_/g, '.');
const dayRange = (end, n) => Array.from({ length: n }, (_, i) => addDays(end, -i));

/** test|code → reason name, learned from failure samples. */
function reasonNamesFromSamples(samples) {
    const out = {};
    (samples || []).forEach(s => {
        if (s && s.test && s.reason && s.reasonName) out[`${s.test}|${s.reason}`] = s.reasonName;
    });
    return out;
}

function reasonLabel(test, code, names) {
    return names[`${test}|${code}`] || SYSTEM_REASON_NAMES[code] || `reason_${code}`;
}

/**
 * Failure groups (test + reason + version) with per-day counts and devices.
 * @returns {Map<string, {hash, test, reason, version, byDay: Object, devices: Set, total: number}>}
 */
function failureGroups(docs) {
    const groups = new Map();
    (docs || []).forEach(doc => {
        Object.entries((doc && doc.v) || {}).forEach(([ver, tests]) => {
            Object.entries(tests || {}).forEach(([test, c]) => {
                Object.entries((c && c.r) || {}).forEach(([rk, count]) => {
                    const m = /^([a-z]+)(\d+)$/.exec(rk);
                    if (!m || !FAIL_RESULTS.includes(m[1]) || !(Number(count) > 0)) return;
                    const reason = Number(m[2]);
                    const hash = failureHash(test, reason, ver);
                    const g = groups.get(hash) || { hash, test, reason, version: ver, byDay: {}, devices: new Set(), total: 0 };
                    g.byDay[doc.day] = (g.byDay[doc.day] || 0) + Number(count);
                    g.devices.add(doc.deviceId);
                    g.total += Number(count);
                    groups.set(hash, g);
                });
            });
        });
    });
    return groups;
}

const countIn = (g, days) => days.reduce((s, d) => s + (g.byDay[d] || 0), 0);

/**
 * Per-test failure-rate spikes: the recent window's failure rate is at least
 * double the baseline and 10 points higher, with enough runs and failures.
 * @returns {Array<{hash, test, version, recentRate, baselineRate, recentRuns, recentFailed}>}
 */
function findSpikes(docs, options = {}) {
    const o = { ...DEFAULTS };
    Object.entries(options).forEach(([k, v]) => { if (v !== undefined) o[k] = v; });
    const recent = new Set(dayRange(o.today, o.recentDays));
    const baseline = new Set(dayRange(addDays(o.today, -o.recentDays), o.baselineDays));
    const per = {};
    (docs || []).forEach(doc => {
        const bucket = recent.has(doc.day) ? 'recent' : baseline.has(doc.day) ? 'baseline' : null;
        if (!bucket) return;
        Object.entries(doc.v || {}).forEach(([ver, tests]) => {
            Object.entries(tests || {}).forEach(([test, c]) => {
                const p = per[test] = per[test] || { recent: { runs: 0, failed: 0, versions: {} }, baseline: { runs: 0, failed: 0 } };
                p[bucket].runs += sum(c.n, COUNTED);
                p[bucket].failed += sum(c.n, FAIL_RESULTS);
                if (bucket === 'recent') p.recent.versions[ver] = (p.recent.versions[ver] || 0) + sum(c.n, FAIL_RESULTS);
            });
        });
    });
    const spikes = [];
    Object.entries(per).forEach(([test, p]) => {
        if (p.recent.runs < o.spikeMinRuns || p.recent.failed < o.spikeMinFailures || p.baseline.runs < o.spikeMinRuns) return;
        const recentRate = p.recent.failed / p.recent.runs * 100;
        const baselineRate = p.baseline.runs ? p.baseline.failed / p.baseline.runs * 100 : 0;
        if (recentRate < Math.max(baselineRate * 2, baselineRate + 10)) return;
        const top = Object.entries(p.recent.versions).sort((a, b) => b[1] - a[1])[0];
        const version = top ? top[0] : 'unknown';
        spikes.push({
            hash: failureHash(test, 'spike', version), test, version,
            recentRate: Math.round(recentRate * 10) / 10, baselineRate: Math.round(baselineRate * 10) / 10,
            recentRuns: p.recent.runs, recentFailed: p.recent.failed
        });
    });
    return spikes.sort((a, b) => b.recentRate - a.recentRate);
}

function issueTitle(test, reasonText, version) {
    return `[Bug] TIP: ${test} failing: ${reasonText} (${versionLabel(version)})`;
}

function groupBody(g, { names, samples, days, healthUrl }) {
    const reason = reasonLabel(g.test, g.reason, names);
    const rows = days.map(d => `| ${d} | ${g.byDay[d] || 0} |`).join('\n');
    const examples = (samples || [])
        .filter(s => s.test === g.test && Number(s.reason) === g.reason && String(s.appVersion || '').replace(/[^A-Za-z0-9]/g, '_') === g.version)
        .slice(0, 5)
        .map(s => `- ${new Date(Number(s.at) || 0).toISOString()} · ${s.result} · ${s.platform || ''} · flags \`${JSON.stringify(s.flags || {})}\` · props \`${JSON.stringify(s.props || {})}\``)
        .join('\n');
    return [
        marker(g.hash),
        'Automatically filed by the Test in Production job (#217).',
        '',
        `- **Check:** ${g.test}`,
        `- **Reason:** ${reason} (code ${g.reason})`,
        `- **App version:** ${versionLabel(g.version)}`,
        `- **Devices affected:** ${g.devices.size}`,
        `- **Failures (last ${days.length} days):** ${countIn(g, days)}`,
        '',
        '| Day | Failures |', '|---|---|', rows,
        '',
        examples ? `**Recent samples (no personal data):**\n${examples}` : '_No failure samples stored for this group._',
        '',
        healthUrl ? `Health page: ${healthUrl}` : '',
        'This issue closes itself after 7 days without this failure.'
    ].join('\n');
}

function spikeBody(s, { healthUrl }) {
    return [
        marker(s.hash),
        'Automatically filed by the Test in Production job (#217): failure-rate spike.',
        '',
        `- **Check:** ${s.test}`,
        `- **Failure rate, last 2 days:** ${s.recentRate}% (${s.recentFailed} of ${s.recentRuns} runs)`,
        `- **Failure rate, 7 days before:** ${s.baselineRate}%`,
        `- **Most affected version:** ${versionLabel(s.version)}`,
        '',
        healthUrl ? `Health page: ${healthUrl}` : '',
        'This issue closes itself after 7 days without failures of this check.'
    ].join('\n');
}

/**
 * Plan GitHub actions.
 * @param {Object} a
 * @param {Array} a.docs - tipHealth docs (recent + baseline + healthy window)
 * @param {Array} a.samples - tipFailures samples
 * @param {Array<{number, state, body, title}>} a.issues - issues labelled tip-auto (open and closed)
 * @param {string} a.today - YYYYMMDD
 * @returns {Array<{action: 'create'|'update'|'reopen'|'close', hash, title?, body?, number?, comment?}>}
 */
function planIssues({ docs, samples, issues, today, healthUrl = '', options = {} }) {
    const o = { ...DEFAULTS, ...options };
    const names = reasonNamesFromSamples(samples);
    const groups = failureGroups(docs);
    const recent = dayRange(today, o.recentDays);
    const healthy = dayRange(today, o.healthyDays);
    const byHash = new Map();
    (issues || []).forEach(i => {
        const h = hashFromBody(i.body);
        if (h && (!byHash.has(h) || i.state === 'open')) byHash.set(h, i);
    });

    const wanted = [];
    [...groups.values()]
        .filter(g => countIn(g, recent) >= o.minCount)
        .sort((a, b) => countIn(b, recent) - countIn(a, recent))
        .slice(0, o.maxTop)
        .forEach(g => wanted.push({
            hash: g.hash,
            title: issueTitle(g.test, reasonLabel(g.test, g.reason, names), g.version),
            body: groupBody(g, { names, samples, days: healthy, healthUrl }),
            count: countIn(g, recent)
        }));
    findSpikes(docs, { ...o, today }).forEach(s => wanted.push({
        hash: s.hash,
        title: issueTitle(s.test, `spike ${s.recentRate}%`, s.version),
        body: spikeBody(s, { healthUrl }),
        count: s.recentFailed
    }));

    const actions = [];
    const wantedHashes = new Set();
    wanted.forEach(w => {
        if (wantedHashes.has(w.hash)) return;
        wantedHashes.add(w.hash);
        const existing = byHash.get(w.hash);
        if (!existing) {
            actions.push({ action: 'create', hash: w.hash, title: w.title, body: w.body });
        } else if (existing.state === 'closed') {
            actions.push({
                action: 'reopen', number: existing.number, hash: w.hash, title: w.title, body: w.body,
                comment: `Failing again: ${w.count} in the last ${o.recentDays} days.`
            });
        } else {
            actions.push({ action: 'update', number: existing.number, hash: w.hash, title: w.title, body: w.body });
        }
    });

    // Close open issues whose failure has not been seen for `healthyDays`.
    byHash.forEach((issue, hash) => {
        if (issue.state !== 'open' || wantedHashes.has(hash)) return;
        const g = groups.get(hash);
        const spikeTest = !g && /\[Bug\] TIP: (\S+) failing: spike/.exec(issue.title || '');
        const stillFailing = g ? countIn(g, healthy) > 0
            : spikeTest ? [...groups.values()].some(x => x.test === spikeTest[1] && countIn(x, healthy) > 0)
                : false;
        if (!stillFailing) {
            actions.push({ action: 'close', number: issue.number, hash, comment: `No failures for ${o.healthyDays} days — closing automatically.` });
        }
    });
    return actions;
}

/** True for Firestore permission errors (service account lacks a read role, #168). */
function isPermissionDenied(error) {
    if (!error) return false;
    const text = `${error.code} ${error.message}`;
    return error.code === 7 || /PERMISSION_DENIED|permission-denied|Missing or insufficient permissions/i.test(text);
}

module.exports = {
    LABEL, DEFAULTS, failureHash, marker, hashFromBody, addDays, failureGroups, findSpikes, planIssues,
    reasonNamesFromSamples, issueTitle, isPermissionDenied
};
