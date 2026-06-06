// Walk through events #144 onward to see exactly where the 1025 comes from
const events = [
    { n:143, kind:'P', qty:6.7,    rate:22,   date:'30/5'},
    { n:144, kind:'P', qty:1556.4, rate:23.5, date:'31/5  ← Bill #P20260531-009'},
    { n:145, kind:'P', qty:13.2,   rate:23.5, date:'31/5'},
    { n:146, kind:'P', qty:60,     rate:23.5, date:'31/5'},
    { n:147, kind:'P', qty:165,    rate:23,   date:'1/6'},
    { n:148, kind:'P', qty:27.2,   rate:23,   date:'2/6'},
    { n:149, kind:'P', qty:6.5,    rate:23,   date:'2/6'},
    { n:150, kind:'P', qty:25.2,   rate:23,   date:'2/6'},
    { n:151, kind:'P', qty:9.1,    rate:23,   date:'2/6'},
    { n:152, kind:'P', qty:4,      rate:23,   date:'2/6'},
    { n:153, kind:'P', qty:6.2,    rate:22,   date:'6/6'},
];

let q = -847.8;          // running qty just before event 144
let tv = 0;              // totalValue (clamped because q < 0)
console.log('Before event 144: qty=' + q.toFixed(1) + ' totalValue=' + tv);
console.log('  ← system claims 847.8 kg of "phantom sales" preceded this point.\n');

for (const e of events) {
    if (e.n === 143) continue;
    const prev = q;
    q = prev + e.qty;
    let note;
    if (q <= 0) { tv = 0; note = 'still-negative'; }
    else if (prev < 0) { tv = q * e.rate; note = 'REBASE: fill deficit, only excess carried as cost'; }
    else { tv += e.qty * e.rate; note = 'add'; }
    const rate = q > 0 && tv > 0 ? tv/q : 0;
    console.log(`#${e.n} ${e.date}: +${e.qty}@₹${e.rate}  →  qty=${q.toFixed(1)}  tv=₹${tv.toFixed(2)}  rate=₹${rate.toFixed(2)}/kg  [${note}]`);
}

console.log('\nIf instead all 1556.4 + small purchases had been counted (no historical deficit):');
let q2 = 0, tv2 = 0;
for (const e of events) {
    if (e.n === 143) continue;
    q2 += e.qty;
    tv2 += e.qty * e.rate;
}
console.log(`  → qty=${q2.toFixed(1)} kg @ ₹${(tv2/q2).toFixed(2)}/kg  (cost basis ₹${tv2.toFixed(0)})`);
console.log(`\nDifference: 847.8 kg "disappeared" into pre-existing deficit.`);
