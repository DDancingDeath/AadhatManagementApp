// Standalone validation: replay the user's exact 154-event Gehu timeline
// through the fixed calculateStock math and verify qty=1025 / rate≈22-23.
//
// The events array below was captured from the user's window.debugStock('Gehu')
// dump on 6 June 2026 (BUILD 20260107). It is the literal ground truth — if
// the algorithm here returns qty=1025 and rate in the 22-23 range, the fix
// works against the real production data.

const events = [
    { kind: 'purchase', qty: 6,     rate: 24 },
    { kind: 'purchase', qty: 42,    rate: 24 },
    { kind: 'sale',     qty: 521.6, rate: 26.5 },
    { kind: 'purchase', qty: 3.8,   rate: 24 },
    { kind: 'purchase', qty: 5.2,   rate: 24 },
    { kind: 'purchase', qty: 19.3,  rate: 24 },
    { kind: 'purchase', qty: 76.6,  rate: 25 },
    { kind: 'purchase', qty: 11.3,  rate: 24 },
    { kind: 'sale',     qty: 26.6,  rate: 28 },
    { kind: 'sale',     qty: 50,    rate: 28 },
    { kind: 'purchase', qty: 24,    rate: 25 },
    { kind: 'purchase', qty: 8,     rate: 25 },
    { kind: 'purchase', qty: 5.5,   rate: 25 },
    { kind: 'purchase', qty: 5.9,   rate: 25 },
    { kind: 'purchase', qty: 48.7,  rate: 25 },
    { kind: 'purchase', qty: 174.4, rate: 24.5 },
    { kind: 'purchase', qty: 4,     rate: 25 },
    { kind: 'purchase', qty: 14.8,  rate: 25 },
    { kind: 'purchase', qty: 18.6,  rate: 25 },
    { kind: 'sale',     qty: 20,    rate: 28 },
    { kind: 'purchase', qty: 15,    rate: 25 },
    { kind: 'purchase', qty: 4.9,   rate: 25 },
    { kind: 'purchase', qty: 5.2,   rate: 25 },
    { kind: 'purchase', qty: 24.8,  rate: 25 },
    { kind: 'purchase', qty: 12.3,  rate: 25 },
    { kind: 'purchase', qty: 24.4,  rate: 25 },
    { kind: 'purchase', qty: 53.6,  rate: 25 },
    { kind: 'purchase', qty: 51.4,  rate: 25 },
    { kind: 'purchase', qty: 6,     rate: 25 },
    { kind: 'purchase', qty: 19.2,  rate: 24 },
    { kind: 'purchase', qty: 7.3,   rate: 24 },
    { kind: 'sale',     qty: 20,    rate: 28 },
    { kind: 'purchase', qty: 50.8,  rate: 24 },
    { kind: 'purchase', qty: 16.8,  rate: 24 },
    { kind: 'purchase', qty: 6,     rate: 24 },
    { kind: 'sale',     qty: 715.4, rate: 25 },
    { kind: 'purchase', qty: 98.3,  rate: 23 },
    { kind: 'purchase', qty: 5,     rate: 22 },
    { kind: 'purchase', qty: 100,   rate: 23.5 },
    { kind: 'purchase', qty: 11.5,  rate: 23 },
    { kind: 'purchase', qty: 12.6,  rate: 23 },
    { kind: 'purchase', qty: 65.5,  rate: 24 },
    { kind: 'purchase', qty: 13.6,  rate: 23 },
    { kind: 'purchase', qty: 19.9,  rate: 23 },
    { kind: 'purchase', qty: 5.7,   rate: 23 },
    { kind: 'sale',     qty: 63.5,  rate: 28 },
    { kind: 'purchase', qty: 19.8,  rate: 22 },
    { kind: 'purchase', qty: 7,     rate: 22 },
    { kind: 'purchase', qty: 50.3,  rate: 23 },
    { kind: 'purchase', qty: 8.2,   rate: 22 },
    { kind: 'purchase', qty: 7,     rate: 22 },
    { kind: 'purchase', qty: 10.8,  rate: 22 },
    { kind: 'purchase', qty: 7.8,   rate: 22 },
    { kind: 'purchase', qty: 9.8,   rate: 22 },
    { kind: 'purchase', qty: 16.2,  rate: 22 },
    { kind: 'purchase', qty: 12.9,  rate: 22 },
    { kind: 'purchase', qty: 8.2,   rate: 22 },
    { kind: 'purchase', qty: 8,     rate: 22 },
    { kind: 'purchase', qty: 25.6,  rate: 22.5 },
    { kind: 'purchase', qty: 56.6,  rate: 22.5 },
    { kind: 'purchase', qty: 11.8,  rate: 22 },
    { kind: 'purchase', qty: 28.5,  rate: 23 },
    { kind: 'purchase', qty: 24.6,  rate: 22.5 },
    { kind: 'purchase', qty: 4.6,   rate: 22 },
    { kind: 'sale',     qty: 49.5,  rate: 25 },
    { kind: 'sale',     qty: 44,    rate: 26 },
    { kind: 'purchase', qty: 19.4,  rate: 22 },
    { kind: 'purchase', qty: 18.7,  rate: 22.5 },
    { kind: 'purchase', qty: 19.7,  rate: 22.5 },
    { kind: 'purchase', qty: 18.8,  rate: 22.5 },
    { kind: 'purchase', qty: 14.3,  rate: 22 },
    { kind: 'purchase', qty: 50.9,  rate: 22 },
    { kind: 'purchase', qty: 6,     rate: 22 },
    { kind: 'purchase', qty: 4.7,   rate: 22 },
    { kind: 'purchase', qty: 18,    rate: 22 },
    { kind: 'purchase', qty: 8.6,   rate: 22 },
    { kind: 'purchase', qty: 13.8,  rate: 23 },
    { kind: 'sale',     qty: 4.3,   rate: 27 },
    { kind: 'purchase', qty: 5,     rate: 22 },
    { kind: 'purchase', qty: 8,     rate: 22 },
    { kind: 'purchase', qty: 10.4,  rate: 22 },
    { kind: 'purchase', qty: 4.2,   rate: 22 },
    { kind: 'purchase', qty: 21.2,  rate: 22 },
    { kind: 'purchase', qty: 35,    rate: 22.5 },
    { kind: 'sale',     qty: 900,   rate: 23.25 },
    { kind: 'purchase', qty: 5.2,   rate: 22 },
    { kind: 'purchase', qty: 3.5,   rate: 22 },
    { kind: 'purchase', qty: 27.5,  rate: 22 },
    { kind: 'purchase', qty: 18.2,  rate: 23 },
    { kind: 'purchase', qty: 28.4,  rate: 22 },
    { kind: 'purchase', qty: 24.5,  rate: 22 },
    { kind: 'purchase', qty: 12.5,  rate: 22 },
    { kind: 'purchase', qty: 107.2, rate: 22 },
    { kind: 'purchase', qty: 50.7,  rate: 22 },
    { kind: 'purchase', qty: 6.5,   rate: 22 },
    { kind: 'purchase', qty: 32.5,  rate: 22 },
    { kind: 'purchase', qty: 8,     rate: 22 },
    { kind: 'purchase', qty: 53,    rate: 22 },
    { kind: 'purchase', qty: 7.5,   rate: 22 },
    { kind: 'purchase', qty: 21.3,  rate: 22 },
    { kind: 'purchase', qty: 15.4,  rate: 22 },
    { kind: 'purchase', qty: 10.2,  rate: 22 },
    { kind: 'purchase', qty: 51.5,  rate: 22 },
    { kind: 'purchase', qty: 14,    rate: 22 },
    { kind: 'purchase', qty: 21,    rate: 22 },
    { kind: 'sale',     qty: 810.4, rate: 24 },
    { kind: 'purchase', qty: 9,     rate: 22 },
    { kind: 'purchase', qty: 110.5, rate: 23.25 },
    { kind: 'purchase', qty: 19.6,  rate: 22 },
    { kind: 'purchase', qty: 9,     rate: 22 },
    { kind: 'purchase', qty: 62.3,  rate: 22 },
    { kind: 'purchase', qty: 60.7,  rate: 22 },
    { kind: 'purchase', qty: 12,    rate: 22 },
    { kind: 'purchase', qty: 8.8,   rate: 22 },
    { kind: 'purchase', qty: 14.8,  rate: 22 },
    { kind: 'purchase', qty: 11.3,  rate: 22 },
    { kind: 'sale',     qty: 200,   rate: 25 },
    { kind: 'purchase', qty: 36.6,  rate: 22 },
    { kind: 'purchase', qty: 35.3,  rate: 23 },
    { kind: 'purchase', qty: 66,    rate: 23 },
    { kind: 'purchase', qty: 103,   rate: 23 },
    { kind: 'purchase', qty: 12,    rate: 23 },
    { kind: 'purchase', qty: 4.8,   rate: 23 },
    { kind: 'purchase', qty: 434.2, rate: 23.25 },
    { kind: 'purchase', qty: 15.2,  rate: 23 },
    { kind: 'sale',     qty: 1,     rate: 25 },
    { kind: 'purchase', qty: 22,    rate: 23 },
    { kind: 'purchase', qty: 7,     rate: 23 },
    { kind: 'purchase', qty: 13,    rate: 23.5 },
    { kind: 'sale',     qty: 931.3, rate: 24.25 },
    { kind: 'purchase', qty: 20.3,  rate: 23 },
    { kind: 'sale',     qty: 10,    rate: 26 },
    { kind: 'purchase', qty: 6,     rate: 23.5 },
    { kind: 'purchase', qty: 21,    rate: 23.5 },
    { kind: 'purchase', qty: 12.4,  rate: 23 },
    { kind: 'purchase', qty: 19.7,  rate: 23 },
    { kind: 'purchase', qty: 11.8,  rate: 23 },
    { kind: 'purchase', qty: 6.5,   rate: 23 },
    { kind: 'purchase', qty: 24.6,  rate: 23 },
    { kind: 'purchase', qty: 5,     rate: 23 },
    { kind: 'purchase', qty: 86.5,  rate: 23 },
    { kind: 'purchase', qty: 8.6,   rate: 23 },
    { kind: 'purchase', qty: 12.7,  rate: 23 },
    { kind: 'purchase', qty: 6.7,   rate: 22 },
    { kind: 'purchase', qty: 1556.4,rate: 23.5 },
    { kind: 'purchase', qty: 13.2,  rate: 23.5 },
    { kind: 'purchase', qty: 60,    rate: 23.5 },
    { kind: 'purchase', qty: 165,   rate: 23 },
    { kind: 'purchase', qty: 27.2,  rate: 23 },
    { kind: 'purchase', qty: 6.5,   rate: 23 },
    { kind: 'purchase', qty: 25.2,  rate: 23 },
    { kind: 'purchase', qty: 9.1,   rate: 23 },
    { kind: 'purchase', qty: 4,     rate: 23 },
    { kind: 'purchase', qty: 6.2,   rate: 22 }
];

// ─── Fixed calculateStock math, lifted verbatim from firestore-service.js ───
function calc(evs) {
    let quantity = 0;
    let totalValue = 0;
    const trace = [];
    let n = 0;

    for (const ev of evs) {
        n += 1;
        if (ev.kind === 'purchase') {
            const qty = ev.qty;
            const rate = ev.rate;
            const prevQty = quantity;
            const newQty = prevQty + qty;
            quantity = newQty;
            let note = 'add';
            if (newQty <= 0) {
                totalValue = 0;
                note = 'still-negative→clamp';
            } else if (prevQty < 0) {
                totalValue = newQty * rate;
                note = 'rebase-from-deficit';
            } else {
                totalValue += qty * rate;
            }
            trace.push({ n, kind: 'P', qty, rate, prevQty, newQty: quantity, totalValue, note });
        } else if (ev.kind === 'sale') {
            const qty = ev.qty;
            const prevQty = quantity;
            const avgRate = prevQty > 0 ? totalValue / prevQty : 0;
            const newQty = prevQty - qty;
            quantity = newQty;
            let note = 'sell';
            if (newQty <= 0) {
                totalValue = 0;
                note = 'oversold→clamp';
            } else {
                totalValue -= qty * avgRate;
            }
            trace.push({ n, kind: 'S', qty, rate: ev.rate, prevQty, newQty: quantity, totalValue, avgRate, note });
        }
    }
    const finalRate = quantity > 0 && totalValue > 0 ? totalValue / quantity : 0;
    return { quantity, totalValue, rate: finalRate, trace };
}

const result = calc(events);

console.log('\n=== Gehu Validation — replaying 154 events from user data ===\n');
console.log('Final state:');
console.log('  quantity   :', result.quantity);
console.log('  totalValue :', result.totalValue.toFixed(2));
console.log('  rate       : ₹' + result.rate.toFixed(2) + '/kg');
console.log('');
console.log('Expected   : qty=1025  rate≈₹22–24/kg  (purchases priced at ₹22–25/kg)');
console.log('Previously : qty=1025  rate=₹92.54/kg  ← the bug');
console.log('');

// Show the critical rebase moment
const rebase = result.trace.find(r => r.note === 'rebase-from-deficit');
if (rebase) {
    console.log('Critical rebase moment (purchase lifting deficit → positive):');
    console.log('  event #' + rebase.n + ': purchase', rebase.qty, '@ ₹' + rebase.rate);
    console.log('  prevQty=', rebase.prevQty, '→ newQty=', rebase.newQty);
    console.log('  totalValue rebased to', rebase.totalValue.toFixed(2),
                '(=', rebase.newQty, '×', rebase.rate + ')');
    console.log('');
}

// Show every time totalValue clamped to 0
const clamps = result.trace.filter(r => r.note.includes('clamp')).length;
console.log('Total-value clamps to 0 (qty went ≤ 0):', clamps);
console.log('');

// Final verdict
const pass = Math.abs(result.quantity - 1025) < 0.01 && result.rate >= 22 && result.rate <= 24;
if (pass) {
    console.log('✅ PASS — fix is mathematically correct against user data.');
    process.exit(0);
} else {
    console.log('❌ FAIL — got qty=' + result.quantity + ', rate=₹' + result.rate.toFixed(2));
    process.exit(1);
}
