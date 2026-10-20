// Desktop keyboard shortcuts (active only at >= 1024px wide).
// resolveShortcut() is pure (key event + context -> action) so it can be unit-tested;
// installKeyboardShortcuts() wires it to the DOM.

export const DESKTOP_QUERY = '(min-width: 1024px)';

// Alt+1..9 -> first nine side-nav tabs, in navigation.html order.
export const TAB_SHORTCUTS = [
    { tabId: 'day', en: 'Today', hi: 'आज' },
    { tabId: 'billing', en: 'Billing', hi: 'बिलिंग' },
    { tabId: 'wholesale-sales', en: 'Sales', hi: 'बिक्री' },
    { tabId: 'expenses', en: 'Expenses', hi: 'खर्च' },
    { tabId: 'items', en: 'Items', hi: 'आइटम' },
    { tabId: 'history', en: 'History', hi: 'इतिहास' },
    { tabId: 'stock', en: 'Stocks', hi: 'स्टॉक' },
    { tabId: 'due', en: 'Outstanding', hi: 'बकाया' },
    { tabId: 'finance', en: 'Finance', hi: 'वित्त' }
];

const BILL_BUTTONS = {
    purchase: { save: '#saveBillBtn', print: '#printBillBtn' },
    sale: { save: '#saveSaleBtn', print: '#printSaleBtn' },
    wholesale: { save: '#salesEntrySection .save-sale-btn', print: '#salesEntrySection .print-sale-btn' }
};

/** Which bill (if any) Ctrl+S / Ctrl+P act on for the given context. */
function currentBill(ctx) {
    if (ctx.activeTab === 'billing') return ctx.billingMode === 'sale' ? 'sale' : 'purchase';
    if (ctx.activeTab === 'wholesale-sales' && ctx.wholesaleEntryVisible) return 'wholesale';
    return null;
}

/**
 * Map a keydown to an action.
 * @param {{key:string, code?:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, shiftKey?:boolean, repeat?:boolean}} evt
 * @param {{typing?:boolean, modalOpen?:boolean, helpOpen?:boolean, activeTab?:string|null,
 *          billingMode?:string, wholesaleEntryVisible?:boolean}} ctx
 * @returns {null | {type:'tab', tabId:string} | {type:'click', selector:string}
 *          | {type:'focus-search'} | {type:'toggle-help'} | {type:'close-help'} | {type:'close-modal'}}
 */
export function resolveShortcut(evt, ctx = {}) {
    if (!evt || !ctx.activeTab) return null;
    const ctrl = !!(evt.ctrlKey || evt.metaKey);
    const alt = !!evt.altKey;
    const key = typeof evt.key === 'string' ? evt.key : '';

    if (key === 'Escape') {
        if (ctx.helpOpen) return { type: 'close-help' };
        if (ctx.modalOpen) return { type: 'close-modal' };
        return null;
    }
    if (ctx.helpOpen) {
        return !ctrl && !alt && key === '?' ? { type: 'toggle-help' } : null;
    }

    if (ctrl && !alt) {
        const k = key.toLowerCase();
        if ((k !== 's' && k !== 'p') || evt.shiftKey || ctx.modalOpen) return null;
        const bill = currentBill(ctx);
        if (!bill || evt.repeat) return null;
        return { type: 'click', selector: BILL_BUTTONS[bill][k === 's' ? 'save' : 'print'] };
    }

    if (alt && !ctrl) {
        const m = /^Digit([1-9])$/.exec(evt.code || '') || /^([1-9])$/.exec(key);
        if (!m || ctx.modalOpen || evt.repeat) return null;
        const entry = TAB_SHORTCUTS[Number(m[1]) - 1];
        return entry ? { type: 'tab', tabId: entry.tabId } : null;
    }

    if (ctrl || alt || ctx.typing || ctx.modalOpen) return null;
    if (key === '/') return { type: 'focus-search' };
    if (key === '?') return { type: 'toggle-help' };
    return null;
}

// ---------------------------------------------------------------------------
// DOM wiring
// ---------------------------------------------------------------------------

const HELP_ID = 'kbdHelpOverlay';

function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag !== 'input') return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(type);
}

function isShown(el) {
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Topmost open dialog: { closer: () => void | null } or null when none is open. */
function findOpenModal() {
    const alertOverlay = document.getElementById('modalOverlay');
    if (alertOverlay && alertOverlay.classList.contains('active')) {
        const cancel = document.getElementById('modalCancel');
        const ok = document.getElementById('modalConfirm');
        if (cancel && isShown(cancel)) return { closer: () => cancel.click() };
        // Alert-only dialog: Esc acknowledges it. Custom modals (no stock buttons) are left alone.
        if (ok && isShown(ok)) return { closer: () => ok.click() };
        return { closer: null };
    }
    const overlays = [...document.querySelectorAll('.bill-details-overlay, .modal')].filter(isShown);
    const top = overlays[overlays.length - 1];
    if (top) {
        const btn = top.querySelector('.bill-details-close, .bill-action-btn.btn-close, .modal-close');
        return { closer: btn ? () => btn.click() : null };
    }
    return null;
}

function buildContext(target) {
    const appContent = document.getElementById('appContent');
    const activeTabEl = appContent && !appContent.classList.contains('hidden')
        ? appContent.querySelector('.tab.active') : null;
    const saleSection = document.getElementById('saleSection');
    const wholesaleEntry = document.getElementById('salesEntrySection');
    return {
        typing: isTypingTarget(target),
        modalOpen: !!findOpenModal(),
        helpOpen: !!document.getElementById(HELP_ID),
        activeTab: activeTabEl ? activeTabEl.id : null,
        billingMode: saleSection && saleSection.style.display !== 'none' ? 'sale' : 'purchase',
        wholesaleEntryVisible: !!wholesaleEntry && wholesaleEntry.style.display !== 'none'
    };
}

function closeHelp() {
    const el = document.getElementById(HELP_ID);
    if (el) el.remove();
}

function openHelp() {
    if (document.getElementById(HELP_ID)) return;
    const row = (keys, en, hi) => `<tr><td>${keys}</td><td>${en}<span class="kbd-hi">· ${hi}</span></td></tr>`;
    const tabRows = TAB_SHORTCUTS.map((t, i) => row(`<kbd>Alt</kbd> + <kbd>${i + 1}</kbd>`, t.en, t.hi)).join('');
    const overlay = document.createElement('div');
    overlay.id = HELP_ID;
    overlay.className = 'kbd-help-overlay';
    overlay.innerHTML = `
        <div class="kbd-help" role="dialog" aria-modal="true" aria-labelledby="kbdHelpTitle">
            <h3 id="kbdHelpTitle">Keyboard shortcuts · कीबोर्ड शॉर्टकट</h3>
            <table><tbody>
                ${tabRows}
                ${row('<kbd>Ctrl</kbd> + <kbd>S</kbd>', 'Save current bill', 'मौजूदा बिल सेव करें')}
                ${row('<kbd>Ctrl</kbd> + <kbd>P</kbd>', 'Save &amp; print current bill', 'मौजूदा बिल सेव और प्रिंट करें')}
                ${row('<kbd>/</kbd>', 'Search on this page', 'इस पेज पर खोजें')}
                ${row('<kbd>Esc</kbd>', 'Close dialog', 'डायलॉग बंद करें')}
                ${row('<kbd>?</kbd>', 'Show / hide this help', 'यह मदद दिखाएँ / छिपाएँ')}
            </tbody></table>
            <button type="button" class="kbd-help-close">Close · बंद करें</button>
        </div>`;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('kbd-help-close')) closeHelp();
    });
    document.body.appendChild(overlay);
}

function focusSearch(tabId) {
    const tab = document.getElementById(tabId);
    if (!tab) return false;
    const input = [...tab.querySelectorAll('input[type="search"], input[id*="Search"], input[id*="search"]')].find(isShown);
    if (!input) return false;
    input.focus();
    if (typeof input.select === 'function') input.select();
    return true;
}

/** Run an action; returns true when the key was consumed. */
function perform(action, ctx) {
    switch (action.type) {
        case 'tab':
            if (!window.app || !window.app.nav) return false;
            window.app.nav.showTab(action.tabId);
            return true;
        case 'click': {
            const btn = document.querySelector(action.selector);
            if (!btn || btn.disabled || !isShown(btn)) return false;
            btn.click();
            return true;
        }
        case 'focus-search':
            return focusSearch(ctx.activeTab);
        case 'toggle-help':
            if (document.getElementById(HELP_ID)) closeHelp(); else openHelp();
            return true;
        case 'close-help':
            closeHelp();
            return true;
        case 'close-modal': {
            const open = findOpenModal();
            if (!open || !open.closer) return false;
            open.closer();
            return true;
        }
        default:
            return false;
    }
}

function addSidebarLink() {
    const nav = document.getElementById('sideNav');
    if (!nav || nav.querySelector('.desktop-shortcuts-link')) return !!nav;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'desktop-shortcuts-link';
    btn.textContent = '⌨ Shortcuts · शॉर्टकट (?)';
    btn.addEventListener('click', openHelp);
    nav.appendChild(btn);
    return true;
}

export function installKeyboardShortcuts() {
    if (window.__aadhatShortcutsInstalled) return;
    window.__aadhatShortcutsInstalled = true;
    const mq = window.matchMedia(DESKTOP_QUERY);

    document.addEventListener('keydown', (e) => {
        if (!mq.matches || e.defaultPrevented || e.isComposing) return;
        const ctx = buildContext(e.target);
        const action = resolveShortcut(e, ctx);
        if (action && perform(action, ctx)) e.preventDefault();
    });

    if (!addSidebarLink()) {
        const obs = new MutationObserver(() => { if (addSidebarLink()) obs.disconnect(); });
        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && typeof document !== 'undefined') {
    installKeyboardShortcuts();
}
