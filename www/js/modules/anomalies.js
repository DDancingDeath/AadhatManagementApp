// -------------------- ANOMALIES MODULE (#187, #40) --------------------
// Daily anomaly scan on owner/manager devices, the "Day report" card on
// Today (absorbs the #40 review queue) and the Anomalies page with patterns.
// Detection is pure (utils/anomalies.js) over data already loaded; the only
// reads here are small bounded queries (anomaly docs for a day range, cash
// sessions for 1–7 days, audit log since the scan start — owner only).

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { Helpers } from '../utils/helpers.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { PrinterService } from '../services/printer.js';
import { openExternal } from '../utils/open-external.js';
import { whatsAppReminderUrl } from '../utils/due-reminder.js';
import { chartScaleMax } from './reports.js';
import {
    ANOMALY_DEFAULTS, ANOMALY_TYPES, DETECTION_FIELDS, SEVERITIES, SEVERITY_LABELS, STATUS_LABELS,
    addDaysToKey, anomalyPatterns, buildDayReportText, detectAnomalies, filterAnomalies, formatDayKey,
    istDayKey, istDayStartMs, mergeAnomalies, planAnomalyWrites, presetRange, summarizeAnomalies, summaryLine, typeLabel
} from '../utils/anomalies.js';

const esc = (v) => Helpers.escapeHtml(v == null ? '' : String(v));
const jsAttr = (v) => Helpers.escapeJsAttr(String(v ?? ''));
const DAY_MS = 86400000;
const STORED_TTL_MS = 2 * 60 * 1000;
/** Today card: server read at most every 30 min per user/device (persisted across reopens). */
const REPORT_TTL_MS = 30 * 60 * 1000;
const REPORT_KEY = 'aadhatAnomalyReportRead';
const REPORT_LIMIT = 200;
const SCAN_LIMIT = 500;
const AUDIT_LIMIT = 300;
const SCAN_KEY = 'aadhatAnomalyScanDay';
const PAGE_SIZE = 200;
const SEV_COLORS = { high: '#dc2626', medium: '#d97706', low: '#6b7280' };
const TYPE_COLORS = ['#dc2626', '#2563eb', '#d97706', '#059669', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea', '#be123c', '#15803d', '#1d4ed8', '#a16207'];

const canSee = () => AppState.userRole === 'owner' || AppState.userRole === 'manager';
const todayKey = () => istDayKey(Date.now());
const bilingual = (o) => `${esc(o.en)} / ${esc(o.hi)}`;
const money = (n) => {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return `${v < 0 ? '-' : ''}₹${Math.abs(v).toLocaleString('en-IN')}`;
};

function loadedBills() {
    return {
        purchase: AppState.purchaseHistory || [],
        retail: AppState.retailSalesHistory || [],
        wholesale: AppState.salesHistory || []
    };
}

export const AnomaliesManager = {
    /** Stored docs for the Today card days: { key, docs, at, ok } */
    stored: null,
    /** Live detections for the Today card days */
    live: [],
    /** Today card days → merged list */
    reportList: [],
    refreshing: null,
    lastTotals: null,
    lastSession: null,
    page: {
        filters: { preset: '7d', type: 'all', severity: 'all', status: 'open', user: 'all', item: '' },
        view: 'list',
        docs: [],
        last: null,
        more: false,
        loading: false,
        seq: 0,
        range: null
    },

    // ---------- scanning ----------

    /**
     * Detect anomalies for IST days fromKey..toKey over loaded data, read the
     * stored records for those days from the server and write only new or
     * changed ones (deterministic ids, set-merge). Never writes when the
     * stored records can't be read from the server: a record unknown to this
     * device would otherwise be re-created as 'open' over someone's review.
     * @param {string} fromKey
     * @param {string} toKey
     * @param {{audit?: boolean, storedLimit?: number}} [opts] - `audit`: also read the
     *   audit log for deletes (owner only; daily scan only — it is the costly read)
     * @returns {Promise<{detected: Array, stored: Array|null}>}
     */
    async scan(fromKey, toKey, opts = {}) {
        // One scan at a time (daily scan + Today refresh): the later one reads
        // what the earlier one wrote instead of writing the same records again.
        const run = () => this.runScan(fromKey, toKey, opts);
        const next = (this.scanQueue || Promise.resolve()).then(run, run);
        this.scanQueue = next.catch(() => {});
        return next;
    },

    async runScan(fromKey, toKey, { audit = false, storedLimit = REPORT_LIMIT } = {}) {
        const loadedFrom = Number(AppState.historyLoadedFrom) || 0;
        const from = Math.max(istDayStartMs(fromKey), loadedFrom);
        const to = istDayStartMs(toKey) + DAY_MS;
        const [sessions, auditLogs] = await Promise.all([
            FirebaseService.loadCashSessionsBetween(fromKey, toKey).catch(e => {
                console.warn('Anomaly scan: cash sessions not read:', e?.code || e);
                return [];
            }),
            audit && AppState.userRole === 'owner'
                ? FirebaseService.loadAuditLogsSince(from, AUDIT_LIMIT).catch(e => {
                    console.warn('Anomaly scan: audit log not read:', e?.code || e);
                    return [];
                })
                : Promise.resolve([])
        ]);
        const detected = detectAnomalies({
            bills: loadedBills(),
            sessions,
            adjustments: AppState.stockAdjustments || [],
            auditLogs,
            catalogue: AppState.items || [],
            thresholds: AppState.settings?.checkThresholds || {},
            from,
            to
        });
        let stored = null;
        try {
            const res = await FirebaseService.loadAnomalies(fromKey, toKey, { limit: storedLimit, server: true });
            stored = res.more ? null : res.docs;
            if (res.more) console.warn('Anomaly scan: too many stored records to compare; not writing');
        } catch (e) {
            console.warn('Anomaly scan: stored records not read (offline?):', e?.code || e);
        }
        if (stored) {
            const writes = planAnomalyWrites(detected, stored, Date.now());
            if (writes.length) {
                try {
                    await FirebaseService.saveAnomalies(writes);
                    const byId = new Map(stored.map(d => [d.id, d]));
                    writes.forEach(w => byId.set(w.id, { ...(byId.get(w.id) || {}), id: w.id, ...w.data }));
                    stored = [...byId.values()];
                } catch (e) {
                    console.warn('Anomaly scan: saving records failed:', e?.code || e);
                }
            }
        }
        return { detected, stored };
    },

    /**
     * Once per IST day per user and device (owner/manager, guarded in
     * localStorage across app reopens): scan from the last scanned day (or
     * `scanDays` back) to today over the loaded history window. The only
     * place the audit log is read (owner devices, capped at AUDIT_LIMIT).
     */
    async dailyScan() {
        if (!canSee() || !AppState.currentUser) return;
        const uid = AppState.currentUser.uid;
        const today = todayKey();
        let last = null;
        try { last = JSON.parse(localStorage.getItem(SCAN_KEY) || 'null'); } catch (e) { last = null; }
        if (last && last.uid === uid && last.day === today) return;
        const earliest = addDaysToKey(today, -(ANOMALY_DEFAULTS.scanDays - 1));
        const fromKey = last && last.uid === uid && last.day > earliest ? last.day : earliest;
        const { stored } = await this.scan(fromKey, today, { audit: true, storedLimit: SCAN_LIMIT });
        if (!stored) return;
        localStorage.setItem(SCAN_KEY, JSON.stringify({ uid, day: today, at: Date.now() }));
        // The scan covered yesterday + today: the Today card needs no read of its own for a while
        const { yesterday } = this.reportKeys();
        const key = `${yesterday}|${today}`;
        this.stored = { key, docs: stored.filter(d => d.dayKey === yesterday || d.dayKey === today), at: Date.now() };
        this.markReportFresh(key);
        if (document.getElementById('dayReportCard')?.style.display === 'block') {
            this.reportList = mergeAnomalies(this.detectLive(), this.stored.docs);
            this.drawDayReport();
        }
    },

    /** Start the daily scan a little after startup so it never slows the first screen. */
    scheduleDailyScan(delayMs = 8000) {
        if (!canSee()) return;
        setTimeout(() => {
            this.dailyScan().catch(e => console.warn('Daily anomaly scan failed:', e));
        }, delayMs);
    },

    // ---------- Today: Day report card ----------

    reportKeys() {
        const t = todayKey();
        return { today: t, yesterday: addDaysToKey(t, -1) };
    },

    /** True when this user's Today card read the server for these days less than REPORT_TTL_MS ago (survives reopens). */
    reportFresh(key) {
        try {
            const r = JSON.parse(localStorage.getItem(REPORT_KEY) || 'null');
            return !!r && r.uid === AppState.currentUser?.uid && r.key === key && Date.now() - Number(r.at) < REPORT_TTL_MS;
        } catch (e) {
            return false;
        }
    },

    markReportFresh(key) {
        localStorage.setItem(REPORT_KEY, JSON.stringify({ uid: AppState.currentUser?.uid || null, key, at: Date.now() }));
    },

    /** Live detections for yesterday + today from loaded data (no reads). */
    detectLive() {
        const { today, yesterday } = this.reportKeys();
        const session = this.lastSession && this.lastSession.signedOut ? [this.lastSession] : [];
        return detectAnomalies({
            bills: loadedBills(),
            sessions: session,
            adjustments: AppState.stockAdjustments || [],
            catalogue: AppState.items || [],
            thresholds: AppState.settings?.checkThresholds || {},
            from: Math.max(istDayStartMs(yesterday), Number(AppState.historyLoadedFrom) || 0),
            to: istDayStartMs(today) + DAY_MS
        });
    },

    /**
     * Render the Day report card (called from Today with its day totals).
     * Draws at once from loaded data, then refreshes stored review status in
     * the background: from the offline cache while the persisted TTL holds,
     * from the server (and records new anomalies) at most every REPORT_TTL_MS.
     * @param {Object} [totals]
     * @param {Object|null} [session] - today's cash session
     */
    renderDayReport(totals = null, session = null) {
        const card = document.getElementById('dayReportCard');
        if (!card) return;
        if (!canSee()) {
            card.style.display = 'none';
            card.innerHTML = '';
            return;
        }
        if (totals) this.lastTotals = totals;
        this.lastSession = session;
        this.live = this.detectLive();
        const { yesterday, today } = this.reportKeys();
        const key = `${yesterday}|${today}`;
        const stored = this.stored && this.stored.key === key ? this.stored.docs : [];
        this.reportList = mergeAnomalies(this.live, stored);
        this.drawDayReport();
        if (!this.stored || this.stored.key !== key || Date.now() - this.stored.at > STORED_TTL_MS) {
            this.refreshDayReport().catch(e => console.warn('Day report refresh failed:', e));
        }
    },

    /**
     * Stored records for the Today card. Within the persisted TTL: offline
     * cache only (no billed reads, no writes). Otherwise, or with `force`
     * (the card's refresh button): a server scan of yesterday + today —
     * never the audit log (that is the daily scan's job).
     * @param {{force?: boolean}} [opts]
     */
    async refreshDayReport({ force = false } = {}) {
        if (this.refreshing) return this.refreshing;
        const { yesterday, today } = this.reportKeys();
        const key = `${yesterday}|${today}`;
        this.refreshing = (async () => {
            const prev = this.stored && this.stored.key === key ? this.stored.docs : [];
            if (!force && this.reportFresh(key)) {
                let cached = [];
                try {
                    cached = (await FirebaseService.loadAnomalies(yesterday, today, { limit: REPORT_LIMIT, cacheOnly: true })).docs;
                } catch (e) {
                    cached = [];
                }
                const byId = new Map(prev.map(d => [d.id, d]));
                cached.forEach(d => byId.set(d.id, { ...(byId.get(d.id) || {}), ...d }));
                this.stored = { key, docs: [...byId.values()], at: Date.now() };
            } else {
                const { stored } = await this.scan(yesterday, today, { storedLimit: REPORT_LIMIT });
                this.stored = { key, docs: stored || prev, at: Date.now() };
                if (stored) this.markReportFresh(key);
            }
            this.reportList = mergeAnomalies(this.detectLive(), this.stored.docs);
            this.drawDayReport();
        })().finally(() => { this.refreshing = null; });
        return this.refreshing;
    },

    /** Card refresh button: read the server now. */
    refreshNow() {
        return this.refreshDayReport({ force: true }).catch(e => console.warn('Day report refresh failed:', e));
    },
    drawDayReport() {
        const card = document.getElementById('dayReportCard');
        if (!card || !canSee()) return;
        const { yesterday, today } = this.reportKeys();
        const todays = this.reportList.filter(a => a.dayKey === today);
        const yOpen = this.reportList.filter(a => a.dayKey === yesterday && (a.status || 'open') === 'open');
        const queue = this.reportList.filter(a => (a.dayKey === today || a.dayKey === yesterday) && (a.status || 'open') === 'open');
        const s = summarizeAnomalies(todays);

        const chips = SEVERITIES.map(sev => `<span class="anomaly-chip anomaly-sev-${sev}">${bilingual(SEVERITY_LABELS[sev])}: <strong>${s.bySeverity[sev]}</strong></span>`).join('');
        const types = s.byType.slice(0, 6).map(t => `<li>${bilingual(t)} — <strong>${t.count}</strong></li>`).join('');
        const tops = [
            s.topItems.length ? `<div><span class="anomaly-muted">Top items / मुख्य आइटम:</span> ${s.topItems.map(x => `${esc(x.name)} (${x.count})`).join(', ')}</div>` : '',
            s.topParties.length ? `<div><span class="anomaly-muted">Top parties / मुख्य पार्टी:</span> ${s.topParties.map(x => `${esc(x.name)} (${x.count})`).join(', ')}</div>` : ''
        ].join('');

        const bySev = SEVERITIES.map(sev => {
            const rows = queue.filter(a => a.severity === sev);
            if (!rows.length) return '';
            return `<div class="anomaly-queue-group"><div class="anomaly-queue-head" style="color:${SEV_COLORS[sev]}">${bilingual(SEVERITY_LABELS[sev])} (${rows.length})</div>
                ${rows.slice(0, 8).map(a => this.rowHtml(a, { compact: true })).join('')}
                ${rows.length > 8 ? `<div class="anomaly-muted">+${rows.length - 8} more / और</div>` : ''}</div>`;
        }).join('');

        card.style.display = 'block';
        card.innerHTML = `
            <div class="anomaly-card-head">
                <h3 class="section-title" style="margin:0;">🚨 Day report / आज की रिपोर्ट</h3>
                <span><button type="button" class="anomaly-btn" title="Refresh / ताज़ा करें" onclick="window.app.anomalies.refreshNow()">🔄</button>
                <span class="anomaly-count-badge ${s.total ? 'has' : ''}">${s.total}</span></span>
            </div>
            <div class="anomaly-muted" style="margin:4px 0 8px;">${esc(formatDayKey(today))} · ${esc(this.cashStatusLine())}</div>
            <div class="anomaly-chips">${chips}</div>
            ${s.total ? `<ul class="anomaly-type-list">${types}</ul>${tops}` : '<div class="anomaly-empty">No anomalies today ✅ / आज कोई गड़बड़ी नहीं</div>'}
            ${yOpen.length ? `<div class="anomaly-yesterday">⏪ Yesterday, not reviewed / कल की, बिना जाँच: <strong>${yOpen.length}</strong></div>` : ''}
            <div class="anomaly-queue">
                <div class="anomaly-queue-title">Needs review / जाँच बाकी (${queue.length})</div>
                ${queue.length ? bySev : '<div class="anomaly-empty">Nothing to review / जाँचने को कुछ नहीं</div>'}
            </div>
            <div class="anomaly-actions">
                <button type="button" class="btn btn-success" onclick="window.app.anomalies.shareDayReport()">📤 WhatsApp</button>
                <button type="button" class="btn btn-secondary" onclick="window.app.anomalies.printDayReport()">🖨️ Print / image</button>
                <button type="button" class="btn btn-primary" onclick="window.app.anomalies.openPage()">🔎 All anomalies / सभी गड़बड़ियाँ</button>
            </div>`;
    },

    /** Reconciliation line for the card: today's cash close status. */
    cashStatusLine() {
        const s = this.lastSession;
        if (!s) return 'Cash: not opened / नकद: शुरू नहीं';
        if (!s.signedOut) return 'Cash: open / नकद: चालू';
        if (s.counted === false) return 'Cash: closed, not counted / नकद: बंद, गिना नहीं';
        const diff = Number(s.difference) || 0;
        return Math.abs(diff) < 1 ? 'Cash: closed, matches / नकद: बंद, मेल खाता है'
            : `Cash: closed, ${diff < 0 ? 'short' : 'extra'} ${money(Math.abs(diff))} / नकद: बंद, ${money(Math.abs(diff))} ${diff < 0 ? 'कम' : 'ज़्यादा'}`;
    },

    /** One line for the cash-close screen (owner/manager only). */
    cashCloseLine() {
        if (!canSee()) return '';
        const { today } = this.reportKeys();
        const list = (this.reportList.length ? this.reportList : this.detectLive()).filter(a => a.dayKey === today);
        return summaryLine(list);
    },

    dayReportText() {
        const { yesterday, today } = this.reportKeys();
        return buildDayReportText({
            dayKey: today,
            today: this.reportList.filter(a => a.dayKey === today),
            yesterdayOpen: this.reportList.filter(a => a.dayKey === yesterday && (a.status || 'open') === 'open'),
            totals: this.lastTotals,
            shopName: AppState.settings?.shopName || ''
        });
    },

    async shareDayReport() {
        const text = this.dayReportText();
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                try {
                    await navigator.share({ text });
                    return true;
                } catch (e) {
                    if (e && e.name === 'AbortError') return false;
                }
            }
            openExternal(whatsAppReminderUrl(text, ''));
            return true;
        } catch (error) {
            console.error('Could not share day report:', error);
            UIManager.showToast('Could not open WhatsApp / व्हाट्सऐप नहीं खुला');
            return false;
        }
    },

    /** Day report as an image (download / share sheet / print from the preview). */
    printDayReport() {
        try {
            const lines = this.dayReportText().replace(/\*/g, '').split('\n');
            const width = 576;
            const pad = 20;
            const lineH = 30;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = '20px sans-serif';
            const wrapped = [];
            lines.forEach(line => {
                if (!line) { wrapped.push(''); return; }
                let cur = '';
                line.split(' ').forEach(word => {
                    const next = cur ? `${cur} ${word}` : word;
                    if (ctx.measureText(next).width > width - pad * 2 && cur) {
                        wrapped.push(cur);
                        cur = `  ${word}`;
                    } else {
                        cur = next;
                    }
                });
                wrapped.push(cur);
            });
            canvas.width = width;
            canvas.height = pad * 2 + wrapped.length * lineH;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';
            wrapped.forEach((line, i) => {
                ctx.font = i === 0 ? 'bold 22px sans-serif' : '20px sans-serif';
                ctx.fillText(line, pad, pad + (i + 1) * lineH - 8);
            });
            return PrinterService.showImagePreview(canvas, `day_report_${todayKey().replace(/-/g, '')}.png`, 'Day report');
        } catch (error) {
            console.error('Day report image failed:', error);
            UIManager.showToast('Could not make the report image / रिपोर्ट इमेज नहीं बनी');
            return false;
        }
    },

    // ---------- shared row + review ----------

    rowHtml(a, { compact = false } = {}) {
        const label = typeLabel(a.type);
        const status = a.status || 'open';
        const when = Number.isFinite(Number(a.at)) && Number(a.at) > 0
            ? new Date(Number(a.at)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : formatDayKey(a.dayKey);
        const meta = [
            a.billNumber ? `#${esc(a.billNumber)}` : '',
            a.party ? esc(a.party) : '',
            a.item ? `📦 ${esc(a.item)}` : '',
            a.user ? `👤 ${esc(a.user)}` : '',
            a.amount ? esc(money(a.amount)) : '',
            esc(when)
        ].filter(Boolean).join(' · ');
        const id = jsAttr(a.id);
        const canOpen = a.refKind === 'bill' || a.refKind === 'cash' || a.refKind === 'stock';
        const statusBadge = status === 'open' ? '' : `<span class="anomaly-status anomaly-status-${esc(status)}">${bilingual(STATUS_LABELS[status] || STATUS_LABELS.open)}</span>`;
        const review = status === 'open'
            ? `<button type="button" class="anomaly-btn ok" onclick="window.app.anomalies.review('${id}', 'ok')">✓ OK</button>
               <button type="button" class="anomaly-btn fixed" onclick="window.app.anomalies.review('${id}', 'fixed')">🔧 Fixed / सुधारा</button>`
            : `<button type="button" class="anomaly-btn" onclick="window.app.anomalies.review('${id}', 'open')">↩ Reopen / फिर खोलें</button>`;
        return `
            <div class="anomaly-row sev-${esc(a.severity)}${compact ? ' compact' : ''}">
                <div class="anomaly-row-main"${canOpen ? ` onclick="window.app.anomalies.openRef('${id}')" role="button" tabindex="0"` : ''}>
                    <div class="anomaly-row-title"><span class="anomaly-dot" style="background:${SEV_COLORS[a.severity] || '#6b7280'}"></span>${bilingual(label)} ${statusBadge}</div>
                    <div class="anomaly-row-why">${esc(a.en)}${a.hi && a.hi !== a.en ? ` / ${esc(a.hi)}` : ''}</div>
                    <div class="anomaly-row-meta">${meta}</div>
                    ${a.note ? `<div class="anomaly-row-note">📝 ${esc(a.note)}${a.reviewedByName ? ` — ${esc(a.reviewedByName)}` : ''}</div>` : ''}
                </div>
                <div class="anomaly-row-actions">
                    ${canOpen ? `<button type="button" class="anomaly-btn" onclick="window.app.anomalies.openRef('${id}')">↗ Open / खोलें</button>` : ''}
                    ${review}
                </div>
            </div>`;
    },

    findAnomaly(id) {
        return this.reportList.find(a => a.id === id) || this.page.docs.find(a => a.id === id) || null;
    },

    /** Tap → open the bill (or the cash / stock screen). */
    openRef(id) {
        const a = this.findAnomaly(id);
        if (!a) return;
        if (a.refKind === 'bill') {
            const list = a.billType === 'purchase' ? AppState.purchaseHistory
                : a.billType === 'retail' ? AppState.retailSalesHistory : AppState.salesHistory;
            if (!(list || []).some(b => String(b.id) === String(a.refId))) {
                UIManager.showToast('This bill is not loaded (older or deleted) / यह बिल लोड नहीं है');
                return;
            }
            window.app?.history?.viewBill(`id:${a.refId}`, a.billType);
        } else if (a.refKind === 'cash') {
            window.app?.nav?.showTab('day');
            setTimeout(() => window.app?.day?.showSubTab('cash'), 150);
        } else if (a.refKind === 'stock') {
            window.app?.nav?.showTab('stock');
        }
    },

    /** Mark OK / Fixed (with an optional note) or reopen. Owner/manager only. */
    async review(id, status) {
        if (!canSee()) return false;
        const a = this.findAnomaly(id);
        if (!a) return false;
        let note = a.note || '';
        if (status !== 'open') {
            const html = `
                <div style="text-align:left;">
                    <div style="margin-bottom:6px;"><strong>${bilingual(typeLabel(a.type))}</strong></div>
                    <div style="margin-bottom:8px; color:#6b7280;">${esc(a.en)}</div>
                    <label for="anomalyReviewNote">Note (optional) / नोट (वैकल्पिक):</label>
                    <textarea id="anomalyReviewNote" rows="2" maxlength="300" style="width:100%; box-sizing:border-box; padding:6px;">${esc(note)}</textarea>
                </div>`;
            const title = status === 'ok' ? 'Mark OK / ठीक है' : 'Mark fixed / सुधारा गया';
            const ok = await UIManager.showModalWithHtml(html, title, true);
            if (!ok) return false;
            note = (document.getElementById('anomalyReviewNote')?.value || '').trim().slice(0, 300);
        }
        const review = {
            status,
            note,
            reviewedBy: status === 'open' ? null : (AppState.currentUser?.uid || null),
            reviewedByName: status === 'open' ? null : (AppState.userName || null),
            reviewedAt: status === 'open' ? null : Date.now()
        };
        const data = { ...review };
        // Not stored yet (found live, e.g. offline scan): write the full record
        if (!a.detectedAt) {
            DETECTION_FIELDS.forEach(k => { if (a[k] !== undefined) data[k] = a[k]; });
            data.detectedAt = Date.now();
        }
        try {
            await FirebaseService.saveAnomalies([{ id: a.id, data }]);
        } catch (e) {
            console.error('Saving review failed:', e);
            UIManager.showToast('Could not save / सेव नहीं हुआ: ' + (e?.message || e));
            return false;
        }
        const apply = (x) => (x.id === a.id ? { ...x, ...data } : x);
        this.reportList = this.reportList.map(apply);
        if (this.stored) {
            const has = this.stored.docs.some(d => d.id === a.id);
            this.stored.docs = has ? this.stored.docs.map(apply) : [...this.stored.docs, { ...a, ...data }];
        }
        this.page.docs = this.page.docs.map(apply);
        this.drawDayReport();
        if (document.getElementById('anomalyList')) this.renderPage();
        UIManager.showToast(status === 'open' ? 'Reopened / फिर खोला' : '✓ Saved / सेव हुआ');
        return true;
    },

    // ---------- Anomalies page ----------

    openPage() {
        window.app?.nav?.showTab('anomalies');
    },

    async init() {
        const root = document.getElementById('anomalies');
        if (!root) return;
        const denied = document.getElementById('anomalyDenied');
        const body = document.getElementById('anomalyBody');
        if (!canSee()) {
            if (denied) denied.style.display = 'block';
            if (body) body.style.display = 'none';
            return;
        }
        if (denied) denied.style.display = 'none';
        if (body) body.style.display = 'block';
        this.fillTypeOptions();
        this.syncFilterInputs();
        const loading = this.loadPage(true);
        // Record today's/yesterday's anomalies (at most every 2 minutes) and fold them into the list
        if (!this.stored || Date.now() - this.stored.at > STORED_TTL_MS) {
            this.refreshDayReport()
                .then(() => {
                    const range = this.page.range;
                    if (!range) return;
                    this.page.docs = mergeAnomalies(this.reportList.filter(a => a.dayKey >= range.from && a.dayKey <= range.to), this.page.docs);
                    this.renderPage();
                })
                .catch(e => console.warn('Anomaly refresh failed:', e));
        }
        await loading;
    },

    fillTypeOptions() {
        const sel = document.getElementById('anomalyFilterType');
        if (!sel || sel.dataset.filled) return;
        sel.dataset.filled = '1';
        sel.innerHTML = '<option value="all">All types / सभी प्रकार</option>' + Object.entries(ANOMALY_TYPES)
            .map(([id, t]) => `<option value="${esc(id)}">${esc(t.en)} / ${esc(t.hi)}</option>`).join('');
    },

    syncFilterInputs() {
        const f = this.page.filters;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        set('anomalyFilterPreset', f.preset);
        set('anomalyFilterType', f.type);
        set('anomalyFilterSeverity', f.severity);
        set('anomalyFilterStatus', f.status);
        set('anomalyFilterItem', f.item);
    },

    readFilterInputs() {
        const get = (id, d) => document.getElementById(id)?.value ?? d;
        const f = this.page.filters;
        return {
            preset: get('anomalyFilterPreset', f.preset),
            type: get('anomalyFilterType', f.type),
            severity: get('anomalyFilterSeverity', f.severity),
            status: get('anomalyFilterStatus', f.status),
            user: get('anomalyFilterUser', f.user),
            item: String(get('anomalyFilterItem', f.item) || '').trim()
        };
    },

    /** Any filter changed: reload from Firestore only when the date range changed. */
    applyFilters() {
        const next = this.readFilterInputs();
        const rangeChanged = next.preset !== this.page.filters.preset;
        this.page.filters = next;
        if (rangeChanged) this.loadPage(true).catch(e => console.error('Loading anomalies failed:', e));
        else this.renderPage();
    },

    /**
     * Load (or extend) the stored records for the selected range, newest day
     * first, PAGE_SIZE per read. Live detections of the last two days are
     * merged in so a record not yet synced still shows.
     */
    async loadPage(reset = false) {
        if (!reset && this.page.loading) return;
        // The newest request wins: a slower, older range must not overwrite it
        const seq = ++this.page.seq;
        const range = presetRange(this.page.filters.preset, todayKey());
        if (reset) {
            this.page.docs = [];
            this.page.last = null;
            this.page.more = false;
        }
        this.page.range = range;
        this.page.loading = true;
        this.renderPage();
        try {
            const res = await FirebaseService.loadAnomalies(range.from, range.to, { limit: PAGE_SIZE, after: reset ? null : this.page.last });
            if (seq !== this.page.seq) return;
            const live = this.reportList.filter(a => a.dayKey >= range.from && a.dayKey <= range.to);
            this.page.docs = mergeAnomalies(live, [...this.page.docs, ...res.docs]);
            this.page.last = res.last;
            this.page.more = res.more;
        } catch (e) {
            if (seq !== this.page.seq) return;
            console.error('Loading anomalies failed:', e);
            UIManager.showToast('Could not load anomalies / गड़बड़ियाँ लोड नहीं हुईं');
            if (reset) this.page.docs = this.reportList.filter(a => a.dayKey >= range.from && a.dayKey <= range.to);
        } finally {
            if (seq === this.page.seq) {
                this.page.loading = false;
                this.renderPage();
            }
        }
    },

    loadMore() {
        if (this.page.more) this.loadPage(false).catch(e => console.error('Loading anomalies failed:', e));
    },

    showView(view) {
        this.page.view = view === 'patterns' ? 'patterns' : 'list';
        document.getElementById('anomalyTabList')?.classList.toggle('active', this.page.view === 'list');
        document.getElementById('anomalyTabPatterns')?.classList.toggle('active', this.page.view === 'patterns');
        const list = document.getElementById('anomalyListView');
        const pat = document.getElementById('anomalyPatternView');
        if (list) list.style.display = this.page.view === 'list' ? 'block' : 'none';
        if (pat) pat.style.display = this.page.view === 'patterns' ? 'block' : 'none';
        this.renderPage();
    },

    filtered() {
        const f = this.page.filters;
        const range = this.page.range || presetRange(f.preset, todayKey());
        return filterAnomalies(this.page.docs, { ...range, type: f.type, severity: f.severity, status: f.status, user: f.user, item: f.item });
    },

    renderPage() {
        const listEl = document.getElementById('anomalyList');
        if (!listEl) return;
        // User options come from what is loaded for the range
        const userSel = document.getElementById('anomalyFilterUser');
        if (userSel) {
            const users = [...new Set(this.page.docs.map(a => String(a.user || a.userId || '').trim()).filter(Boolean))].sort();
            const cur = this.page.filters.user;
            userSel.innerHTML = '<option value="all">All users / सभी</option>' + users.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
            userSel.value = users.includes(cur) ? cur : 'all';
        }
        const list = this.filtered();
        const s = summarizeAnomalies(list);
        const summary = document.getElementById('anomalySummary');
        if (summary) {
            const range = this.page.range;
            summary.innerHTML = this.page.loading && !list.length
                ? '⏳ Loading… / लोड हो रहा है…'
                : `<strong>${s.total}</strong> shown / दिखाई गईं${range ? ` · ${esc(formatDayKey(range.from))} – ${esc(formatDayKey(range.to))}` : ''} · `
                + SEVERITIES.map(sev => `<span style="color:${SEV_COLORS[sev]}">${bilingual(SEVERITY_LABELS[sev])} ${s.bySeverity[sev]}</span>`).join(' · ');
        }
        if (this.page.view === 'list') {
            listEl.innerHTML = this.page.loading && !list.length
                ? '<div class="anomaly-empty">Loading… / लोड हो रहा है…</div>'
                : list.length ? list.map(a => this.rowHtml(a)).join('') : '<div class="anomaly-empty">No anomalies for these filters / इन फ़िल्टर में कोई गड़बड़ी नहीं</div>';
        } else {
            this.renderPatterns(list);
        }
        const more = document.getElementById('anomalyMore');
        if (more) more.style.display = this.page.more && !this.page.loading ? 'inline-block' : 'none';
    },

    renderPatterns(list) {
        const p = anomalyPatterns(list);
        const colorOf = (type) => TYPE_COLORS[Math.max(0, p.types.indexOf(type)) % TYPE_COLORS.length];

        this.drawTrend(p, colorOf);
        const legend = document.getElementById('anomalyTrendLegend');
        if (legend) {
            legend.innerHTML = p.types.map(t => `<span class="anomaly-legend"><i style="background:${colorOf(t)}"></i>${bilingual(typeLabel(t))}</span>`).join('');
        }

        const heat = document.getElementById('anomalyHeat');
        if (heat) {
            if (!p.heat.items.length) {
                heat.innerHTML = '<div class="anomaly-empty">No item data / आइटम डेटा नहीं</div>';
            } else {
                const max = Math.max(1, ...p.heat.items.flatMap(i => p.heat.types.map(t => p.heat.cells[i][t] || 0)));
                heat.innerHTML = `<div class="anomaly-table-wrap"><table class="anomaly-heat"><thead><tr><th>Item / आइटम</th>${p.heat.types.map(t => `<th title="${esc(typeLabel(t).en)}">${esc(typeLabel(t).en)}</th>`).join('')}</tr></thead><tbody>${p.heat.items.map(i => `<tr><td>${esc(i)}</td>${p.heat.types.map(t => {
                    const n = p.heat.cells[i][t] || 0;
                    return `<td style="background:rgba(220,38,38,${n ? (0.15 + 0.75 * n / max).toFixed(2) : 0}); color:${n / max > 0.5 ? '#fff' : 'inherit'}">${n || ''}</td>`;
                }).join('')}</tr>`).join('')}</tbody></table></div>`;
            }
        }

        const users = document.getElementById('anomalyByUser');
        if (users) {
            users.innerHTML = p.byUser.length
                ? `<div class="anomaly-table-wrap"><table class="anomaly-table"><thead><tr><th>User / सदस्य</th><th>Total / कुल</th><th>High / गंभीर</th><th>Most common / सबसे ज़्यादा</th></tr></thead><tbody>${p.byUser.map(u => {
                    const top = Object.entries(u.byType).sort((a, b) => b[1] - a[1])[0];
                    return `<tr><td>${esc(u.name)}</td><td>${u.count}</td><td>${u.high}</td><td>${top ? `${bilingual(typeLabel(top[0]))} (${top[1]})` : ''}</td></tr>`;
                }).join('')}</tbody></table></div>`
                : '<div class="anomaly-empty">No user data / डेटा नहीं</div>';
        }

        const hours = document.getElementById('anomalyByHour');
        if (hours) {
            const max = Math.max(1, ...p.byHour);
            hours.innerHTML = `<div class="anomaly-hours">${p.byHour.map((n, h) => `<div class="anomaly-hour" title="${h}:00 — ${n}"><div class="bar" style="height:${Math.round(100 * n / max)}%"></div><span>${h % 3 === 0 ? h : ''}</span></div>`).join('')}</div>`;
        }

        const rep = document.getElementById('anomalyRepeat');
        if (rep) {
            const block = (title, rows) => `<div class="anomaly-repeat-block"><h4>${title}</h4>${rows.length
                ? `<ul>${rows.map(r => `<li><strong>${esc(r.name)}</strong> — ${r.count}× on ${r.days} days / ${r.days} दिन <span class="anomaly-muted">(${r.types.map(t => esc(typeLabel(t).en)).join(', ')})</span></li>`).join('')}</ul>`
                : '<div class="anomaly-muted">None / कोई नहीं</div>'}</div>`;
            rep.innerHTML = block('Items / आइटम', p.repeat.items) + block('Users / सदस्य', p.repeat.users) + block('Parties / पार्टी', p.repeat.parties);
        }
    },

    /** Stacked bars per day by type (same canvas approach as Reports). */
    drawTrend(p, colorOf) {
        const canvas = document.getElementById('anomalyTrendChart');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const container = canvas.parentElement;
        canvas.width = Math.max(280, container?.offsetWidth || 600);
        canvas.height = 220;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const range = this.page.range;
        const days = [];
        if (range) {
            for (let k = range.from; k <= range.to && days.length < 120; k = addDaysToKey(k, 1)) days.push(k);
        }
        const byDay = new Map(p.days.map(d => [d.dayKey, d]));
        if (!days.length || !p.days.length) {
            ctx.fillStyle = '#6b7280';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data / डेटा नहीं', canvas.width / 2, canvas.height / 2);
            return;
        }
        const max = chartScaleMax(days.map(d => byDay.get(d)?.total || 0));
        const left = 30;
        const bottom = 30;
        const chartH = canvas.height - bottom - 10;
        const slot = (canvas.width - left - 10) / days.length;
        const barW = Math.max(2, slot * 0.7);
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(max), left - 4, 16);
        ctx.fillText('0', left - 4, canvas.height - bottom);
        days.forEach((d, i) => {
            const x = left + i * slot + (slot - barW) / 2;
            let y = canvas.height - bottom;
            const day = byDay.get(d);
            if (day) {
                p.types.forEach(t => {
                    const n = day.byType[t] || 0;
                    if (!n) return;
                    const h = (n / max) * chartH;
                    ctx.fillStyle = colorOf(t);
                    ctx.fillRect(x, y - h, barW, h);
                    y -= h;
                });
            }
            const every = Math.ceil(days.length / 10);
            if (i % every === 0) {
                ctx.fillStyle = '#6b7280';
                ctx.textAlign = 'center';
                ctx.fillText(d.slice(8, 10) + '/' + d.slice(5, 7), x + barW / 2, canvas.height - 12);
            }
        });
    }
};
