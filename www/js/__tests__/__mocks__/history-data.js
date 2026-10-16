/**
 * @fileoverview Synthetic multi-month business history for stock/window tests.
 */

export function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const ITEMS = [
    { id: 'gehu', name: 'Gehu', hindiName: 'गेहूं' },
    { id: 'chana', name: 'Chana Dal', hindiName: 'चना दाल' },
    { id: 'piyar', name: 'piyar dana', hindiName: 'पियर दाना' },
    { id: 'makka', name: 'Makka' },
    { id: 'jau', name: 'Jau', hindiName: 'जौ' }
];

const pad = (n) => String(n).padStart(2, '0');
const enIN = (t) => {
    const d = new Date(t);
    let h = d.getHours();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}, ${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
};

/**
 * @param {number} seed
 * @param {number} now
 * @param {number} [months=18]
 * @returns {{purchases: Array, wholesaleSales: Array, retailSales: Array, stockAdjustments: Array, expenses: Array, withdrawals: Array}}
 */
export function generateHistory(seed, now, months = 18) {
    const r = rng(seed);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const start = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - months, 1).getTime();
    const out = { purchases: [], wholesaleSales: [], retailSales: [], stockAdjustments: [], expenses: [], withdrawals: [] };
    let n = 0;
    const lineFor = () => {
        const item = pick(ITEMS);
        const style = r();
        const qty = Math.round(r() * 40 * 10) / 10 + 0.5;
        const rate = Math.round(20 + r() * 30);
        if (style < 0.55) return { itemId: item.id, name: item.name, qty, rate };
        if (style < 0.7) return { name: `  ${item.name.toUpperCase()} `, qty, rate };
        if (style < 0.8) return { name: item.hindiName || item.name, quantity: qty, rate };
        if (style < 0.88) return { itemId: 'deleted_item', name: item.name.toLowerCase(), qty, rate };
        if (style < 0.94) return { itemId: 'ghost', name: 'Old Legacy Item', qty, rate };
        return { name: 'old legacy item ', qty: String(qty), rate: String(rate) };
    };
    const timeFields = (t) => {
        const s = r();
        if (s < 0.75) return { timestamp: t, date: new Date(t).toISOString() };
        if (s < 0.85) return { date: enIN(t) };
        if (s < 0.9) return { date: new Date(t).toISOString() };
        if (s < 0.93) return { timestamp: t, date: enIN(t) };
        if (s < 0.95) return { date: '' };
        return { timestamp: t - (t % 60000), date: enIN(t) };
    };
    for (let t = start; t < now - 60000; t += Math.floor(r() * 9 * 3600 * 1000) + 60000) {
        const kind = r();
        const id = `d${String(++n).padStart(5, '0')}`;
        const lines = Array.from({ length: 1 + Math.floor(r() * 3) }, lineFor);
        const total = lines.reduce((s, l) => s + (parseFloat(l.qty || l.quantity) || 0) * (parseFloat(l.rate) || 0), 0);
        const dueRoll = r();
        let pay;
        if (dueRoll < 0.6) pay = { payment: { online: 0, cash: total, due: 0, total } };
        else if (dueRoll < 0.75) pay = { payment: { online: 0, cash: total / 2, due: total / 2, total: total / 2 } };
        else if (dueRoll < 0.82) pay = { dueAmount: Math.round(total / 3), cashPayment: 0 };
        else if (dueRoll < 0.88) pay = { amountPaid: Math.round(total / 4) };
        else if (dueRoll < 0.92) pay = { payment: { online: 0, cash: 5, due: 0, total: 5 }, source: 'sales-tab' };
        else if (dueRoll < 0.95) pay = { payment: { online: 0, cash: 0, due: total, total: 0 }, cleared: true };
        else pay = {};
        const base = { id, ...timeFields(t), total, ...pay };
        if (kind < 0.3) out.purchases.push({ ...base, items: lines });
        else if (kind < 0.55) out.wholesaleSales.push({ ...base, items: lines });
        else if (kind < 0.75) out.retailSales.push({ ...base, items: lines });
        else if (kind < 0.88) {
            const item = pick(ITEMS);
            const type = pick(['add', 'remove', 'set', 'set', 'add']);
            out.stockAdjustments.push({
                id, ...timeFields(t),
                itemId: r() < 0.8 ? item.id : null,
                itemName: r() < 0.7 ? item.name : ` ${item.name.toLowerCase()}`,
                adjustType: type,
                quantity: Math.round(r() * 30),
                rate: r() < 0.5 ? Math.round(15 + r() * 30) : 0
            });
        } else if (kind < 0.95) {
            out.expenses.push({ id, date: enIN(t), amount: Math.round(r() * 500), type: 'misc', category: 'business' });
        } else {
            const d = new Date(t);
            out.withdrawals.push({ id, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, amount: 100, createdAt: d.toISOString() });
        }
        // Occasionally a second event at exactly the same millisecond.
        if (r() < 0.03 && out.purchases.length) {
            out.purchases.push({ id: `${id}b`, timestamp: t, date: new Date(t).toISOString(), items: [lineFor()], total: 1, payment: { due: 0 } });
        }
    }
    return out;
}
