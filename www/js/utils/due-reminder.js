/**
 * @fileoverview Pure builders for the Outstanding party actions (#77): the
 * bilingual WhatsApp due reminder, the wa.me link, and the read-only
 * statement (khaata) model that the printer draws as an image.
 * Text only — nothing is stored or uploaded. No DOM, Firestore or AppState.
 * @module utils/due-reminder
 */

import { round2 } from './money.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** Most bills listed in one reminder; the rest are summarised. */
export const REMINDER_MAX_BILLS = 20;

/**
 * ₹ with Indian digit grouping, whole rupees (same as Helpers.formatCurrency).
 * @param {number} amount
 * @returns {string}
 */
export function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(Math.round(Number(amount) || 0));
}

/** DD/MM/YYYY in local time, '' for no date. */
export function formatDMY(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Text from a stored value made safe for one line of a WhatsApp message:
 * newlines collapsed and WhatsApp formatting marks (* _ ~ `) removed so a
 * name can't add lines or bold/strike the rest of the message.
 * @param {*} value
 * @returns {string}
 */
export function cleanText(value) {
    return String(value ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * WhatsApp number (country code + number, digits only) or '' when the stored
 * phone isn't a usable Indian mobile / international number.
 * @param {*} phone
 * @returns {string}
 */
export function normalizePhone(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
    if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
    if (/^91[6-9]\d{9}$/.test(digits)) return digits;
    if (/^00\d{8,13}$/.test(digits)) return digits.slice(2);
    return '';
}

/**
 * wa.me link: straight to the party's chat when a phone is known, otherwise
 * WhatsApp asks whom to send it to.
 * @param {string} text
 * @param {*} [phone]
 * @returns {string}
 */
export function whatsAppReminderUrl(text, phone) {
    const number = normalizePhone(phone);
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/**
 * Bilingual (English / Hindi) polite reminder of a party's open bills,
 * oldest first, with the total due.
 * @param {{name: string, total: number, bills: Array<{billNumber: string, date: ?Date, due: number}>}} party
 * @param {{shopName?: string, upiId?: string}} [opts]
 * @returns {string}
 */
export function buildReminderText(party, { shopName = '', upiId = '' } = {}) {
    const name = cleanText(party?.name);
    const shop = cleanText(shopName);
    const upi = cleanText(upiId);
    const bills = party?.bills || [];
    const total = round2(bills.reduce((s, b) => s + (Number(b.due) || 0), 0));

    const lines = [];
    if (shop) lines.push(`*${shop}*`, '');
    lines.push(name ? `Namaste ${name} ji / नमस्ते ${name} जी 🙏` : 'Namaste / नमस्ते 🙏');
    lines.push('This is a gentle reminder about your pending payment.');
    lines.push('आपका कुछ भुगतान बाकी है, कृपया ध्यान दें।');
    lines.push('', '*Open bills / बकाया बिल:*');
    bills.slice(0, REMINDER_MAX_BILLS).forEach((b, i) => {
        const parts = [];
        if (b.billNumber) parts.push(`#${cleanText(b.billNumber)}`);
        const d = formatDMY(b.date);
        if (d) parts.push(d);
        parts.push(formatINR(b.due));
        lines.push(`${i + 1}. ${parts.join(' · ')}`);
    });
    const more = bills.length - REMINDER_MAX_BILLS;
    if (more > 0) lines.push(`…and ${more} more bill${more === 1 ? '' : 's'} / और ${more} बिल`);
    lines.push('', `*Total due / कुल बकाया: ${formatINR(total)}*`, '');
    lines.push('Please pay by cash or online (UPI) at your convenience.');
    lines.push('कृपया सुविधा अनुसार नकद या ऑनलाइन (UPI) से भुगतान करें।');
    if (upi) lines.push(`UPI: ${upi}`);
    lines.push('', 'Thank you / धन्यवाद');
    return lines.join('\n');
}

/**
 * Read-only statement of a party's open bills, ready for the printer's
 * image path.
 * @param {Object} party Party from buildAging()
 * @param {{kind?: 'receivable'|'payable', shopName?: string, today?: Date}} [opts]
 * @returns {{title: string, shopName: string, partyName: string, asOf: string,
 *   rows: Array<{billNumber: string, date: string, days: ?number, due: number}>,
 *   total: number, totalLabel: string, footer: string, filename: string}}
 */
export function buildStatement(party, { kind = 'receivable', shopName = '', today = new Date() } = {}) {
    const bills = party?.bills || [];
    const rows = bills.map(b => ({
        billNumber: cleanText(b.billNumber),
        date: formatDMY(b.date),
        days: b.days ?? null,
        due: round2(Number(b.due) || 0)
    }));
    const total = round2(rows.reduce((s, r) => s + r.due, 0));
    const partyName = cleanText(party?.name) || 'No name / बिना नाम';
    const slug = partyName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'party';
    return {
        title: 'Statement / खाता विवरण',
        shopName: cleanText(shopName),
        partyName,
        asOf: formatDMY(today),
        rows,
        total,
        totalLabel: kind === 'payable' ? 'Total payable / कुल देय' : 'Total due / कुल बकाया',
        footer: 'Open bills only / केवल बकाया बिल',
        filename: `statement_${slug}_${formatDMY(today).split('/').reverse().join('')}.png`
    };
}
