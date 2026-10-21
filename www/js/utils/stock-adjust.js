/**
 * @fileoverview Pure rules for a manual stock adjustment (Stock → Adjust).
 * @module utils/stock-adjust
 */

/** Reason picker options; `other` needs a note. */
export const ADJUST_REASONS = {
    count: 'Physical count / गिनती',
    damage: 'Damaged / खराब',
    theft: 'Theft or loss / चोरी या गुम',
    other: 'Other / अन्य'
};

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Validates an adjustment and works out the stock after it.
 *  - add/remove need a quantity > 0; set accepts 0 ("set stock to 0").
 *  - remove is capped at the stock on hand (`capped` tells the UI to warn);
 *    `quantity` is the effective amount, `rawQuantity` what was typed.
 *  - a reason is required; `other` also needs a note.
 * @param {{adjustType: string, quantity: number, currentStock: number, reasonCode?: string, reasonNote?: string}} input
 * @returns {{ok: true, quantity: number, rawQuantity: number, newStock: number, capped: boolean, reason: string}
 *          | {ok: false, error: string}}
 */
export function planStockAdjustment({ adjustType, quantity, currentStock, reasonCode, reasonNote }) {
    const qty = Number(quantity);
    const stock = Number(currentStock) || 0;
    if (!['add', 'remove', 'set'].includes(adjustType)) {
        return { ok: false, error: 'Choose an adjustment type / प्रकार चुनें' };
    }
    if (!Number.isFinite(qty) || qty < 0 || (qty === 0 && adjustType !== 'set')) {
        return { ok: false, error: 'Please enter a valid quantity / सही मात्रा डालें' };
    }
    const note = (reasonNote || '').trim();
    if (!ADJUST_REASONS[reasonCode]) {
        return { ok: false, error: 'Please choose a reason / कारण चुनें' };
    }
    if (reasonCode === 'other' && !note) {
        return { ok: false, error: 'Please write the reason / कारण लिखें' };
    }
    const reason = note ? `${ADJUST_REASONS[reasonCode]}: ${note}` : ADJUST_REASONS[reasonCode];

    let effective = qty;
    let newStock;
    let capped = false;
    if (adjustType === 'add') {
        newStock = stock + qty;
    } else if (adjustType === 'remove') {
        const onHand = Math.max(0, stock);
        if (qty > onHand) {
            if (onHand === 0) return { ok: false, error: 'There is no stock to remove / हटाने के लिए स्टॉक नहीं है' };
            effective = onHand;
            capped = true;
        }
        newStock = stock - effective;
    } else {
        newStock = qty;
    }
    return { ok: true, quantity: round3(effective), rawQuantity: qty, newStock: round3(newStock), capped, reason };
}
