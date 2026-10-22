// -------------------- RATE TRENDS MODULE (#65) --------------------
// Owner/manager page: monthly kg-weighted rates per item from rateStats docs,
// volume, margin per kg, the same months in earlier years and a seasonal
// "usually goes up / down" estimate. rateStats is filled once by an
// owner-triggered backfill over all bills (resumable, read budget per day,
// stops on a quota error) and then rolled forward from the bills already
// loaded on owner/manager devices. Math lives in utils/rate-trends.js.

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { Helpers } from '../utils/helpers.js';
import { FirebaseService } from '../firebase/firestore-service.js';
import { isQuotaExhaustedError } from '../utils/quota-guard.js';
import { chartScaleMax } from './reports.js';
import { FIELD_LABELS, formatHistoryValue } from '../utils/rate-history.js';
import {
    DEFAULT_DAILY_READ_BUDGET, DIRECTION_TEXT, CONFIDENCE_TEXT, READ_BUDGET_OPTIONS,
    addMonths, aggregateBills, backfillDays, estimateBackfillReads, explainOutlook, finalizeStats,
    istMonthKey, itemsByUsage, monthLabel, monthSeries, newCursor, parseCursor, planRollForward,
    rollForwardFromMonth, runBackfillReads, seasonalOutlook, trendRows, yearOverlay
} from '../utils/rate-trends.js';

const CURSOR_KEY = 'aadhatRateStatsBackfill';
const BUDGET_KEY = 'aadhatRateStatsBudget';
const ROLL_KEY = 'aadhatRateStatsRoll';
const ROLL_EVERY_MS = 6 * 60 * 60 * 1000;
const META_TTL_MS = 5 * 60 * 1000;
const COLORS = { purchase: '#2563eb', retail: '#059669', wholesale: '#d97706', bought: '#93c5fd', sold: '#6ee7b7' };
const YEAR_COLORS = ['#dc2626', '#2563eb', '#059669', '#7c3aed', '#d97706'];

const esc = (v) => Helpers.escapeHtml(v == null ? '' : String(v));
const canSee = () => AppState.userRole === 'owner' || AppState.userRole === 'manager';
const isOwner = () => AppState.userRole === 'owner';
const rupees = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toFixed(2)}`);
const kgText = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-IN')} kg`;
const isDenied = (e) => e?.code === 'permission-denied' || /permission/i.test(String(e?.message || ''));

function loadedBills() {
    return {
        purchase: AppState.purchaseHistory || [],
        retail: AppState.retailSalesHistory || [],
        wholesale: AppState.salesHistory || []
    };
}

function itemLabel(item) {
    if (!item) return '';
    return item.hindiName && item.hindiName !== item.name ? `${item.name} / ${item.hindiName}` : (item.name || '');
}

function readBudget() {
    const v = Number(localStorage.getItem(BUDGET_KEY));
    return READ_BUDGET_OPTIONS.includes(v) ? v : DEFAULT_DAILY_READ_BUDGET;
}

function loadCursor() {
    try { return parseCursor(localStorage.getItem(CURSOR_KEY)); } catch (_) { return null; }
}

function storeCursor(cursor) {
    try {
        localStorage.setItem(CURSOR_KEY, JSON.stringify(cursor));
    } catch (e) {
        console.warn('Rate trends: could not save the backfill position:', e?.name || e);
    }
}

export const RateTrendsManager = {
    meta: undefined,
    metaAt: 0,
    metaError: null,
    estimate: null,
    statsByItem: new Map(),
    historyByItem: new Map(),
    itemId: null,
    docs: [],
    range: '24',
    view: 'chart',
    weeks: 6,
    compareKind: 'purchase',
    running: false,
    progress: '',
    lastStop: null,
    rolling: null,

    async init() {
        const denied = document.getElementById('rtDenied');
        const body = document.getElementById('rtBody');
        if (!canSee()) {
            if (denied) denied.style.display = 'block';
            if (body) body.style.display = 'none';
            return;
        }
        if (denied) denied.style.display = 'none';
        if (body) body.style.display = '';
        this.fillItemPicker();
        await this.loadMeta();
        this.renderStatus();
        if (this.meta?.backfillDone) this.rollForward().catch(e => console.warn('Rate trends roll-forward failed:', e));
        await this.loadItem();
    },

    fillItemPicker() {
        const select = document.getElementById('rtItem');
        if (!select) return;
        const ranked = itemsByUsage(AppState.items || [], loadedBills());
        if (!this.itemId || !ranked.some(r => r.item.id === this.itemId)) this.itemId = ranked[0]?.item.id || null;
        select.innerHTML = ranked.length
            ? ranked.map(r => `<option value="${esc(r.item.id)}"${r.item.id === this.itemId ? ' selected' : ''}>${esc(itemLabel(r.item))}</option>`).join('')
            : '<option value="">No items / कोई आइटम नहीं</option>';
    },

    async loadMeta(force = false) {
        if (!force && this.meta !== undefined && Date.now() - this.metaAt < META_TTL_MS) return this.meta;
        try {
            this.meta = await FirebaseService.loadRateStatsMeta();
            this.metaError = null;
        } catch (e) {
            this.meta = null;
            this.metaError = isDenied(e) ? 'denied' : (isQuotaExhaustedError(e) ? 'quota' : 'offline');
            console.warn('Rate trends: status not read:', e?.code || e);
        }
        this.metaAt = Date.now();
        return this.meta;
    },

    // ---------- backfill status card ----------

    renderStatus() {
        const el = document.getElementById('rtStatus');
        if (!el) return;
        if (this.metaError === 'denied') {
            el.innerHTML = `<div class="rt-note">🔒 Rate history isn't switched on yet: the latest database rules need to be published once (owner setup).<br>
                रेट का इतिहास अभी चालू नहीं है: नए डेटाबेस नियम एक बार प्रकाशित करने होंगे (मालिक का सेटअप)।</div>`;
            return;
        }
        const cursor = loadCursor();
        const budget = readBudget();
        const budgetSelect = `<label class="rt-budget">Reads per day for this / इसके लिए रोज़ कितने रीड
            <select onchange="window.app.rateTrends.setBudget(this.value)">${READ_BUDGET_OPTIONS.map(v =>
        `<option value="${v}"${v === budget ? ' selected' : ''}>${v.toLocaleString('en-IN')}</option>`).join('')}</select></label>`;
        let html = '';
        if (this.running) {
            html = `<div class="rt-note">⏳ Building history from bills… / बिलों से इतिहास बन रहा है…<br><span class="rt-muted">${esc(this.progress)}</span></div>`;
        } else if (cursor) {
            const stop = this.lastStop ? `<div class="rt-warn">${this.lastStop}</div>` : '';
            html = `${stop}<div class="rt-note">⏸️ History build paused: ${cursor.bills.toLocaleString('en-IN')} bills read so far (${cursor.reads.toLocaleString('en-IN')} reads).<br>
                इतिहास बनाना रुका है: अब तक ${cursor.bills.toLocaleString('en-IN')} बिल पढ़े गए (${cursor.reads.toLocaleString('en-IN')} रीड)।</div>
                ${isOwner() ? `<div class="rt-actions"><button class="btn btn-primary" onclick="window.app.rateTrends.continueBackfill()">▶️ Continue / आगे बढ़ाएँ</button></div>${budgetSelect}` : ''}`;
        } else if (this.meta?.backfillDone) {
            const at = this.meta.backfillAt ? new Date(this.meta.backfillAt).toLocaleDateString('en-IN') : '';
            html = `<div class="rt-ok">✅ History built from ${Number(this.meta.bills || 0).toLocaleString('en-IN')} bills${at ? ` on ${esc(at)}` : ''}. Recent months update automatically.<br>
                ${Number(this.meta.bills || 0).toLocaleString('en-IN')} बिलों से इतिहास बना${at ? ` (${esc(at)})` : ''}। हाल के महीने अपने-आप अपडेट होते हैं।</div>
                ${isOwner() ? `<div class="rt-actions"><button class="btn btn-secondary" onclick="window.app.rateTrends.startBackfill()">🔁 Rebuild from all bills / सभी बिलों से दोबारा बनाएँ</button></div>` : ''}`;
        } else if (isOwner()) {
            const est = this.estimate;
            const estText = est ? `about ${est.reads.toLocaleString('en-IN')} reads once / एक बार लगभग ${est.reads.toLocaleString('en-IN')} रीड` : 'one read per bill, once / हर बिल का एक रीड, एक बार';
            html = `<div class="rt-note">Rate trends need a one-time history built from all your past bills.<br>
                रेट का रुझान देखने के लिए एक बार सभी पुराने बिलों से इतिहास बनाना होगा।</div>
                <div class="rt-actions"><button class="btn btn-primary" onclick="window.app.rateTrends.startBackfill()">📚 Build history from all bills — uses ${esc(estText)}</button></div>
                ${budgetSelect}
                <div class="rt-muted">The free limit is 50,000 reads a day for everyone; the build stops at the daily amount above and continues next time.
                मुफ़्त सीमा सभी के लिए रोज़ 50,000 रीड है; यह ऊपर चुनी रोज़ की सीमा पर रुकेगा और अगली बार आगे बढ़ेगा।</div>`;
            if (!est && this.metaError !== 'quota') this.loadEstimate().then(() => { if (this.estimate) this.renderStatus(); }).catch(() => {});
        } else {
            html = `<div class="rt-note">Rate history hasn't been built yet. Ask the owner to open this page and build it once.<br>
                रेट का इतिहास अभी नहीं बना है। मालिक से यह पेज खोलकर एक बार बनवाएँ।</div>`;
        }
        el.innerHTML = html;
    },

    setBudget(value) {
        const v = Number(value);
        if (READ_BUDGET_OPTIONS.includes(v)) localStorage.setItem(BUDGET_KEY, String(v));
        this.renderStatus();
    },

    async loadEstimate() {
        if (this.estimate) return this.estimate;
        const bills = loadedBills();
        const loaded = bills.purchase.length + bills.retail.length + bills.wholesale.length;
        const oldest = await FirebaseService.oldestBillTimestamp();
        const reads = estimateBackfillReads({ loadedBills: loaded, loadedFrom: Number(AppState.historyLoadedFrom) || 0, oldest, now: Date.now() });
        this.estimate = { reads, oldest };
        return this.estimate;
    },

    async startBackfill() {
        if (!isOwner() || this.running) return;
        let est = null;
        try { est = await this.loadEstimate(); } catch (e) { console.warn('Rate trends: estimate failed:', e?.code || e); }
        const budget = readBudget();
        const days = est ? backfillDays(est.reads, budget) : null;
        const msg = est
            ? `This reads every bill once: about ${est.reads.toLocaleString('en-IN')} reads` +
              (days > 1 ? `, spread over about ${days} days (${budget.toLocaleString('en-IN')} a day)` : '') +
              `. The app keeps working while it runs.\n\nयह हर बिल को एक बार पढ़ेगा: लगभग ${est.reads.toLocaleString('en-IN')} रीड` +
              (days > 1 ? `, लगभग ${days} दिनों में (रोज़ ${budget.toLocaleString('en-IN')})` : '') + '। इस दौरान ऐप चलता रहेगा।'
            : 'This reads every bill once (one read per bill). The app keeps working while it runs.\n\nयह हर बिल को एक बार पढ़ेगा (हर बिल का एक रीड)। इस दौरान ऐप चलता रहेगा।';
        const ok = await UIManager.showModal(msg, 'Build rate history? / रेट का इतिहास बनाएँ?', true);
        if (!ok) return;
        const now = Date.now();
        const cursor = newCursor(now);
        storeCursor(cursor);
        try {
            await FirebaseService.saveRateStatsMeta({ startedAt: now, byUserId: AppState.currentUser?.uid || '', by: AppState.userName || '' });
        } catch (e) {
            if (isDenied(e)) {
                localStorage.removeItem(CURSOR_KEY);
                this.metaError = 'denied';
                this.renderStatus();
                return;
            }
            console.warn('Rate trends: start not recorded:', e?.code || e);
        }
        await this.runBackfill();
    },

    continueBackfill() {
        if (!isOwner() || this.running) return Promise.resolve();
        return this.runBackfill();
    },

    async runBackfill() {
        const cursor = loadCursor();
        if (!cursor) return;
        this.running = true;
        this.lastStop = null;
        this.progress = '';
        this.renderStatus();
        try {
            if (cursor.phase === 'read') {
                const result = await runBackfillReads({
                    cursor,
                    items: AppState.items || [],
                    budget: readBudget(),
                    fetchPage: (coll, after, limit) => FirebaseService.loadBillPageById(coll, after, limit),
                    saveCursor: storeCursor,
                    isQuotaError: isQuotaExhaustedError,
                    onProgress: (c) => {
                        this.progress = `${c.bills.toLocaleString('en-IN')} bills, ${c.reads.toLocaleString('en-IN')} reads / बिल, रीड`;
                        const el = document.querySelector('#rtStatus .rt-muted');
                        if (el) el.textContent = this.progress;
                    }
                });
                if (result.status !== 'read-done') {
                    this.lastStop = {
                        quota: '⚠️ Stopped: today\'s free data limit was reached. Tap Continue tomorrow — it carries on from here.<br>रुका: आज की मुफ़्त डेटा सीमा पूरी हो गई। कल "आगे बढ़ाएँ" दबाएँ — यहीं से आगे चलेगा।',
                        budget: '⏸️ Paused: today\'s share of reads is used. Tap Continue tomorrow.<br>रुका: आज के रीड पूरे हो गए। कल "आगे बढ़ाएँ" दबाएँ।',
                        error: '⚠️ Stopped: could not read bills (offline?). Tap Continue to try again.<br>रुका: बिल नहीं पढ़ पाए (इंटरनेट?)। फिर से "आगे बढ़ाएँ" दबाएँ।'
                    }[result.status];
                    if (result.error) console.warn('Rate trends backfill stopped:', result.error?.code || result.error);
                    return;
                }
            }
            await this.finishBackfill(cursor);
        } finally {
            this.running = false;
            this.renderStatus();
        }
    },

    async finishBackfill(cursor) {
        const stats = finalizeStats(cursor.acc);
        const writes = Object.keys(stats).map(id => ({ id, data: stats[id] }));
        try {
            await FirebaseService.saveRateStats(writes);
            const meta = {
                backfillDone: true,
                backfillAt: Date.now(),
                bills: cursor.bills,
                reads: cursor.reads,
                months: new Set(writes.map(w => w.data.month)).size,
                by: AppState.userName || '',
                byUserId: AppState.currentUser?.uid || ''
            };
            await FirebaseService.saveRateStatsMeta(meta);
            this.meta = { ...(this.meta || {}), ...meta };
            this.metaAt = Date.now();
            this.metaError = null;
            localStorage.removeItem(CURSOR_KEY);
            this.statsByItem.clear();
            UIManager.showToast('Rate history built / रेट का इतिहास बन गया');
            // Months still being edited come from the loaded bills, not the backfill snapshot.
            await this.rollForward({ force: true });
            await this.loadItem();
        } catch (e) {
            this.lastStop = '⚠️ Saving the history failed — tap Continue to try again. / इतिहास सेव नहीं हुआ — फिर से "आगे बढ़ाएँ" दबाएँ।';
            console.warn('Rate trends: saving stats failed:', e?.code || e);
        }
    },

    // ---------- roll-forward from loaded bills ----------

    /**
     * Brings the stats of months fully covered by the loaded history in line
     * with the loaded bills. Compares with this device's cached copy (no
     * billed reads) and writes only changed month docs.
     */
    rollForward({ force = false } = {}) {
        if (!canSee() || !AppState.currentUser) return Promise.resolve('not-allowed');
        if (this.rolling) return this.rolling;
        const run = async () => {
            const uid = AppState.currentUser.uid;
            let last = null;
            try { last = JSON.parse(localStorage.getItem(ROLL_KEY) || 'null'); } catch (_) { last = null; }
            if (!force && last && last.uid === uid && Date.now() - Number(last.at) < ROLL_EVERY_MS) return 'recent';
            const markDone = () => localStorage.setItem(ROLL_KEY, JSON.stringify({ uid, at: Date.now() }));
            const meta = await this.loadMeta();
            if (!meta?.backfillDone) {
                if (this.metaError !== 'offline') markDone();
                return this.metaError || 'no-backfill';
            }
            const now = Date.now();
            const fromMonth = rollForwardFromMonth(Number(AppState.historyLoadedFrom) || 0, now);
            const computed = finalizeStats(aggregateBills(loadedBills(), AppState.items || [], { fromMonth }));
            const stored = await FirebaseService.loadCachedRateStatsFrom(fromMonth).catch(() => []);
            const writes = planRollForward(computed, stored, fromMonth);
            if (writes.length) {
                await FirebaseService.saveRateStats(writes);
                writes.forEach(w => this.statsByItem.delete(w.data.itemId));
            }
            markDone();
            return writes.length ? 'written' : 'current';
        };
        const p = run().finally(() => { this.rolling = null; });
        this.rolling = p;
        return p;
    },

    /** Background roll-forward a little after startup (owner/manager devices). */
    scheduleRollForward(delayMs = 20000) {
        if (!canSee()) return;
        setTimeout(() => {
            this.rollForward().catch(e => console.warn('Rate trends roll-forward failed:', e?.code || e));
        }, delayMs);
    },

    // ---------- item view ----------

    async selectItem(itemId) {
        this.itemId = itemId || null;
        await this.loadItem();
    },

    setRange(value) {
        this.range = value;
        this.render();
    },

    setView(value) {
        this.view = value === 'table' ? 'table' : 'chart';
        this.render();
    },

    setWeeks(value) {
        const w = Number(value);
        this.weeks = [4, 6, 8].includes(w) ? w : 6;
        this.renderOutlook();
    },

    setCompareKind(value) {
        this.compareKind = value === 'sale' ? 'sale' : 'purchase';
        this.drawYearChart();
    },

    async loadItem() {
        const itemId = this.itemId;
        if (!itemId || this.metaError === 'denied') {
            this.docs = [];
            this.render();
            return;
        }
        let docs = this.statsByItem.get(itemId);
        if (!docs) {
            try {
                docs = await FirebaseService.loadRateStatsForItem(itemId);
                this.statsByItem.set(itemId, docs);
            } catch (e) {
                docs = [];
                if (isDenied(e)) {
                    this.metaError = 'denied';
                    this.renderStatus();
                }
                console.warn('Rate trends: stats not read:', e?.code || e);
            }
        }
        if (itemId !== this.itemId) return;
        this.docs = docs;
        this.render();
        this.loadDefaultRateChanges(itemId).catch(() => {});
    },

    visibleRows() {
        const rows = trendRows(this.docs);
        if (this.range === 'all') return rows;
        const n = Number(this.range) || 24;
        const from = addMonths(istMonthKey(Date.now()), -(n - 1));
        return rows.filter(r => r.month >= from);
    },

    render() {
        const chart = document.getElementById('rtChartView');
        const table = document.getElementById('rtTableView');
        if (chart) chart.style.display = this.view === 'chart' ? '' : 'none';
        if (table) table.style.display = this.view === 'table' ? '' : 'none';
        this.renderOutlook();
        if (this.view === 'chart') {
            this.drawRateChart();
            this.drawVolumeChart();
            this.drawYearChart();
        } else {
            this.renderTable();
        }
    },

    renderOutlook() {
        const el = document.getElementById('rtOutlook');
        if (!el) return;
        if (!this.docs.length) {
            el.innerHTML = '<div class="rt-empty">No rate history for this item yet. / इस आइटम का रेट इतिहास अभी नहीं है।</div>';
            return;
        }
        const now = Date.now();
        const blocks = [
            { kind: 'purchase', en: 'Purchase rate', hi: 'खरीद रेट' },
            { kind: 'sale', en: 'Sale rate', hi: 'बिक्री रेट' }
        ].map(b => {
            const o = seasonalOutlook(monthSeries(this.docs, b.kind), { now, weeks: this.weeks });
            const why = explainOutlook(o);
            if (o.status !== 'ok') {
                return `<div class="rt-outlook rt-outlook-none"><div class="rt-outlook-head">${esc(b.en)} / ${esc(b.hi)}: Not enough history / पूरा इतिहास नहीं</div>
                    <div class="rt-muted">${esc(why.en)}<br>${esc(why.hi)}</div></div>`;
            }
            const arrow = o.direction === 'up' ? '▲' : o.direction === 'down' ? '▼' : '▬';
            const dir = DIRECTION_TEXT[o.direction];
            const conf = CONFIDENCE_TEXT[o.confidence];
            return `<div class="rt-outlook rt-outlook-${o.direction}">
                <div class="rt-outlook-head"><span class="rt-arrow">${arrow}</span> ${esc(b.en)} / ${esc(b.hi)}: ${esc(dir.en)} / ${esc(dir.hi)}</div>
                <div class="rt-outlook-meta"><span class="rt-conf rt-conf-${o.confidence}">${esc(conf.en)} / ${esc(conf.hi)}</span>
                    ${o.seasons} years of data / ${o.seasons} साल का डेटा</div>
                <div class="rt-muted">${esc(why.en)}<br>${esc(why.hi)}</div></div>`;
        });
        el.innerHTML = blocks.join('');
    },

    renderTable() {
        const el = document.getElementById('rtTable');
        if (!el) return;
        const rows = this.visibleRows().slice().reverse();
        if (!rows.length) {
            el.innerHTML = '<div class="rt-empty">No data / डेटा नहीं</div>';
            return;
        }
        el.innerHTML = `<table class="rt-table"><thead><tr>
            <th>Month / महीना</th><th>Purchase / खरीद</th><th>Retail / खुदरा</th><th>Wholesale / थोक</th>
            <th>Margin per kg / प्रति kg मार्जिन</th><th>Bought / खरीदा</th><th>Sold / बेचा</th><th>Bills / बिल</th></tr></thead><tbody>
            ${rows.map(r => `<tr><td>${esc(monthLabel(r.month))}</td><td>${rupees(r.purchase)}</td><td>${rupees(r.retail)}</td>
                <td>${rupees(r.wholesale)}</td><td class="${r.margin < 0 ? 'rt-neg' : ''}">${rupees(r.margin)}</td>
                <td>${kgText(r.kgBought)}</td><td>${kgText(r.kgSold)}</td><td>${r.bills}</td></tr>`).join('')}
            </tbody></table>`;
    },

    // ---------- charts (same hand-drawn canvas approach as Reports) ----------

    prepCanvas(id, height) {
        const canvas = document.getElementById(id);
        if (!canvas || !canvas.getContext) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        canvas.width = Math.max(280, canvas.parentElement?.offsetWidth || 600);
        canvas.height = height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return { canvas, ctx };
    },

    noData(c) {
        c.ctx.font = '14px Arial';
        c.ctx.fillStyle = '#888';
        c.ctx.textAlign = 'center';
        c.ctx.fillText('No data / डेटा नहीं', c.canvas.width / 2, c.canvas.height / 2);
    },

    /**
     * Lines over shared x labels with a min–max y scale (rates sit far above 0).
     * series: [{values: Array<number|null>, color, width?}]
     */
    drawLines(c, labels, series) {
        const { ctx, canvas } = c;
        const values = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
        if (!values.length) return this.noData(c);
        let lo = Math.min(...values);
        let hi = Math.max(...values);
        const pad = Math.max((hi - lo) * 0.1, hi * 0.02, 0.5);
        lo = Math.max(0, lo - pad);
        hi += pad;
        const left = 46;
        const right = 12;
        const top = 10;
        const bottom = 34;
        const w = canvas.width - left - right;
        const h = canvas.height - top - bottom;
        const step = labels.length > 1 ? w / (labels.length - 1) : 0;
        const xAt = (i) => left + (labels.length > 1 ? i * step : w / 2);
        const yAt = (v) => top + h - ((v - lo) / (hi - lo)) * h;

        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        for (let g = 0; g <= 4; g++) {
            const v = lo + ((hi - lo) * g) / 4;
            const y = yAt(v);
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(canvas.width - right, y);
            ctx.stroke();
            ctx.fillText(`₹${v.toFixed(v < 100 ? 1 : 0)}`, left - 4, y + 3);
        }
        ctx.textAlign = 'center';
        const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(w / 46))));
        labels.forEach((l, i) => {
            if (i !== labels.length - 1 && (i % every !== 0 || labels.length - 1 - i < every)) return;
            const last = i === labels.length - 1 && labels.length > 1;
            ctx.textAlign = last ? 'right' : (i === 0 && labels.length > 1 ? 'left' : 'center');
            ctx.fillText(l, last ? xAt(i) + 4 : xAt(i), canvas.height - 14);
        });

        series.forEach(s => {
            ctx.strokeStyle = s.color;
            ctx.fillStyle = s.color;
            ctx.lineWidth = s.width || 2.5;
            ctx.beginPath();
            let drawing = false;
            s.values.forEach((v, i) => {
                if (v === null || v === undefined) {
                    drawing = false;
                    return;
                }
                if (!drawing) ctx.moveTo(xAt(i), yAt(v));
                else ctx.lineTo(xAt(i), yAt(v));
                drawing = true;
            });
            ctx.stroke();
            s.values.forEach((v, i) => {
                if (v === null || v === undefined) return;
                ctx.beginPath();
                ctx.arc(xAt(i), yAt(v), 3, 0, Math.PI * 2);
                ctx.fill();
            });
        });
        return undefined;
    },

    monthAxis(rows) {
        if (!rows.length) return [];
        const months = [];
        for (let m = rows[0].month; m <= rows[rows.length - 1].month; m = addMonths(m, 1)) months.push(m);
        return months;
    },

    drawRateChart() {
        const c = this.prepCanvas('rtRateChart', 240);
        if (!c) return;
        const rows = this.visibleRows();
        const months = this.monthAxis(rows);
        const byMonth = new Map(rows.map(r => [r.month, r]));
        const pick = (k) => months.map(m => byMonth.get(m)?.[k] ?? null);
        this.drawLines(c, months.map(m => `${monthLabel(m, 'en', false)} ${m.slice(2, 4)}`), [
            { values: pick('purchase'), color: COLORS.purchase },
            { values: pick('retail'), color: COLORS.retail },
            { values: pick('wholesale'), color: COLORS.wholesale }
        ]);
    },

    drawVolumeChart() {
        const c = this.prepCanvas('rtVolumeChart', 150);
        if (!c) return;
        const { ctx, canvas } = c;
        const rows = this.visibleRows();
        const months = this.monthAxis(rows);
        if (!months.length) return this.noData(c);
        const byMonth = new Map(rows.map(r => [r.month, r]));
        const max = chartScaleMax(rows.flatMap(r => [r.kgBought, r.kgSold]));
        const left = 46;
        const bottom = 20;
        const h = canvas.height - bottom - 8;
        const slot = (canvas.width - left - 12) / months.length;
        const barW = Math.max(2, Math.min(14, slot / 2 - 1));
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(kgText(max), left - 4, 14);
        ctx.fillText('0', left - 4, canvas.height - bottom);
        months.forEach((m, i) => {
            const r = byMonth.get(m);
            const x = left + i * slot + slot / 2 - barW;
            const hb = r ? (r.kgBought / max) * h : 0;
            const hs = r ? (r.kgSold / max) * h : 0;
            ctx.fillStyle = COLORS.bought;
            ctx.fillRect(x, canvas.height - bottom - hb, barW, hb);
            ctx.fillStyle = COLORS.sold;
            ctx.fillRect(x + barW + 1, canvas.height - bottom - hs, barW, hs);
        });
        return undefined;
    },

    drawYearChart() {
        const c = this.prepCanvas('rtYearChart', 220);
        if (!c) return;
        const series = monthSeries(this.docs, this.compareKind);
        const years = [...new Set(Object.keys(series).map(m => Number(m.slice(0, 4))))].sort((a, b) => b - a).slice(0, YEAR_COLORS.length);
        const overlay = yearOverlay(series, years);
        const thisYear = Number(istMonthKey(Date.now()).slice(0, 4));
        const labels = Array.from({ length: 12 }, (_, i) => monthLabel(`2000-${String(i + 1).padStart(2, '0')}`, 'en', false));
        this.drawLines(c, labels, years.map((y, i) => ({ values: overlay[y], color: YEAR_COLORS[i], width: y === thisYear ? 3.5 : 2 })));
        const legend = document.getElementById('rtYearLegend');
        if (legend) legend.innerHTML = years.map((y, i) => `<span><i style="background:${YEAR_COLORS[i]}"></i>${y}</span>`).join('');
    },

    // ---------- default (catalogue) rate changes, #82 ----------

    async loadDefaultRateChanges(itemId) {
        const card = document.getElementById('rtDefaultRatesCard');
        const el = document.getElementById('rtDefaultRates');
        if (!card || !el) return;
        let entries = this.historyByItem.get(itemId);
        if (!entries) {
            try {
                entries = (await FirebaseService.loadRateHistory(itemId, 10)).filter(e => FIELD_LABELS[e.field] && e.field !== 'name' && e.field !== 'hindiName');
            } catch (e) {
                // Not readable yet (rules not published) or offline: just leave the card out.
                console.warn('Rate trends: default rate changes not read:', e?.code || e);
                entries = null;
            }
            if (entries) this.historyByItem.set(itemId, entries);
        }
        if (itemId !== this.itemId) return;
        if (!entries || !entries.length) {
            card.style.display = 'none';
            return;
        }
        card.style.display = '';
        el.innerHTML = `<ul class="rt-history">${entries.map(e => `<li><span class="rt-muted">${esc(new Date(Number(e.at)).toLocaleDateString('en-IN'))}</span>
            ${esc(FIELD_LABELS[e.field])}: ${esc(formatHistoryValue(e.field, e.old))} → ${esc(formatHistoryValue(e.field, e.new))}
            ${e.by ? `<span class="rt-muted">(${esc(e.by)})</span>` : ''}</li>`).join('')}</ul>`;
    }
};
