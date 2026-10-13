/**
 * Utility Helpers Module
 * Common utility functions used throughout the application
 * @module utils/helpers
 */

/**
 * Static utility helper class
 */
export class Helpers {
    // -------------------- FORMATTING --------------------
    
    /**
     * Escape HTML to prevent XSS attacks
     * @param {*} text - Text to escape (null/undefined become '', other values are stringified)
     * @returns {string} Escaped HTML string
     */
    static escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '`': '&#096;'
        };
        return String(text).replace(/[&<>"'`]/g, m => map[m]);
    }

    /**
     * Escape a value for use inside a single- or double-quoted JS string literal that sits
     * inside an HTML attribute, e.g. onclick="fn('${Helpers.escapeJsAttr(name)}')".
     * HTML-escaping alone is not enough there: the browser decodes &#039; back to ' before
     * running the handler, so the value is JS-escaped first and then HTML-escaped.
     * @param {*} text - Value to escape
     * @returns {string} Escaped string
     */
    static escapeJsAttr(text) {
        if (text === null || text === undefined) return '';
        const js = String(text)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/`/g, '\\`')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029')
            .replace(/</g, '\\x3C')
            .replace(/>/g, '\\x3E');
        return Helpers.escapeHtml(js);
    }

    /**
     * Format date as DD MMM YYYY
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date string
     */
    static formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    /**
     * Format date with time as DD/MM/YYYY, HH:MM AM/PM
     * @param {string} dateString - Date string to format
     * @returns {string} Formatted date/time string
     */
    static formatDateTime(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            return `${day}/${month}/${year}, ${displayHours}:${minutes} ${ampm}`;
        } catch (e) {
            return dateString;
        }
    }

    /**
     * Get current date/time string in en-IN locale
     * @returns {string} Current date/time string
     */
    static getCurrentDateTime() {
        return new Date().toLocaleString('en-IN');
    }

    /**
     * Parse date from various formats (Firestore timestamp, ISO string, or Indian locale string)
     * @param {*} dateValue - Date value to parse
     * @returns {Date|null} Parsed Date object or null
     */
    static parseDate(dateValue) {
        if (!dateValue) return null;
        // Firestore timestamp
        if (dateValue.toDate) return dateValue.toDate();
        // Already a Date object
        if (dateValue instanceof Date) return dateValue;
        // Try parsing Indian locale format: "28/12/2025, 7:55:07 pm" (d/m/yyyy)
        if (typeof dateValue === 'string' && dateValue.includes('/')) {
            const [datePart, timePart] = dateValue.split(', ');
            if (datePart) {
                const [day, month, year] = datePart.split('/');
                if (day && month && year) {
                    let hours = 0, minutes = 0, seconds = 0;
                    if (timePart) {
                        const timeMatch = timePart.match(/(\d+):(\d+):?(\d*)?\s*(am|pm)?/i);
                        if (timeMatch) {
                            hours = parseInt(timeMatch[1]);
                            minutes = parseInt(timeMatch[2]);
                            seconds = parseInt(timeMatch[3]) || 0;
                            const period = timeMatch[4];
                            if (period?.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                            if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;
                        }
                    }
                    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hours, minutes, seconds);
                }
            }
        }
        // Try standard Date parsing
        const parsed = new Date(dateValue);
        if (!isNaN(parsed.getTime())) return parsed;
        return null;
    }

    /**
     * Format amount as Indian Rupee currency
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency string
     */
    static formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.round(amount));
    }

    // -------------------- GENERATORS --------------------

    /**
     * Generate a unique ID using timestamp and random string
     * @returns {string} Unique identifier
     */
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Create a debounced version of a function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Milliseconds to wait
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // -------------------- INPUT HELPERS --------------------

    /**
     * Get float value from input element
     * @param {string} elementId - Input element ID
     * @param {number} [defaultValue=0] - Default value if parsing fails
     * @returns {number} Parsed float value
     */
    static getInputNumber(elementId, defaultValue = 0) {
        const el = document.getElementById(elementId);
        const value = parseFloat(el?.value);
        return isNaN(value) ? defaultValue : value;
    }

    /**
     * Get integer value from input element
     * @param {string} elementId - Input element ID
     * @param {number} [defaultValue=0] - Default value if parsing fails
     * @returns {number} Parsed integer value
     */
    static getInputInt(elementId, defaultValue = 0) {
        const el = document.getElementById(elementId);
        const value = parseInt(el?.value, 10);
        return isNaN(value) ? defaultValue : value;
    }

    /**
     * Get trimmed string value from input element
     * @param {string} elementId - Input element ID
     * @param {string} [defaultValue=''] - Default value if empty
     * @returns {string} Trimmed input value
     */
    static getInputText(elementId, defaultValue = '') {
        const el = document.getElementById(elementId);
        return el?.value?.trim() || defaultValue;
    }

    /**
     * Get float value from element's text content
     * @param {string} elementId - Element ID
     * @param {number} [defaultValue=0] - Default value if parsing fails
     * @returns {number} Parsed float value
     */
    static getElementNumber(elementId, defaultValue = 0) {
        const el = document.getElementById(elementId);
        const value = parseFloat(el?.textContent);
        return isNaN(value) ? defaultValue : value;
    }

    /**
     * Get integer value from element's text content
     * @param {string} elementId - Element ID
     * @param {number} [defaultValue=0] - Default value if parsing fails
     * @returns {number} Parsed integer value
     */
    static getElementInt(elementId, defaultValue = 0) {
        const el = document.getElementById(elementId);
        const value = parseInt(el?.textContent, 10);
        return isNaN(value) ? defaultValue : value;
    }

    // -------------------- DEVICE HELPERS --------------------

    /**
     * Pick a contact from the device's contact list
     * @param {string} inputElementId - ID of input element to populate with contact name
     * @returns {Promise<void>}
     */
    static async pickContact(inputElementId) {
        try {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
                if (contacts && contacts.length > 0) {
                    const contact = contacts[0];
                    const nameInput = document.getElementById(inputElementId);
                    if (nameInput && contact.name && contact.name.length > 0) {
                        nameInput.value = contact.name[0];
                    }
                }
            } else {
                const { UIManager } = await import('../ui/ui-manager.js');
                UIManager.showToast('Contact picker not supported');
            }
        } catch (error) {
            console.error('Pick contact error:', error);
        }
    }

    // -------------------- BILL NUMBER GENERATION --------------------

    /**
     * Generate a bill number with prefix and date
     * Format: {prefix}{YYYYMMDD}-{sequence}
     *
     * Online, the sequence comes from an atomic per-day counter document
     * `counters/{prefix}{YYYYMMDD}` (field `next` = last issued sequence), so
     * concurrent devices never get the same number and no per-save scan of
     * today's bills is needed. The first time a counter is used it is seeded
     * from the number of bills already saved today (mid-day deploy).
     * Offline, or if the transaction takes longer than BILL_COUNTER_TIMEOUT_MS,
     * it falls back to counting today's bills from the local cache.
     *
     * @param {string} prefix - Bill type prefix ('P' for purchase, 'S' for retail sale, 'W' for wholesale)
     * @param {string} collectionName - Firebase collection name to query for sequence
     * @returns {Promise<string>} Generated bill number
     */
    static async generateBillNumber(prefix, collectionName) {
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const format = (n) => `${prefix}${dateStr}-${String(n).padStart(3, '0')}`;
        
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        
        try {
            const getCol = window.getCollection || ((name) => name);
            const todaysBills = db.collection(getCol(collectionName))
                .where('timestamp', '>=', todayStart.getTime())
                .where('timestamp', '<', todayEnd.getTime());
            const counterRef = db.collection(getCol('counters')).doc(`${prefix}${dateStr}`);
            
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (!offline && typeof db.runTransaction === 'function') {
                try {
                    const seq = await withTimeout(
                        Helpers._nextCounterValue(counterRef, todaysBills, prefix, dateStr),
                        BILL_COUNTER_TIMEOUT_MS
                    );
                    return format(seq);
                } catch (counterError) {
                    console.warn('Bill counter unavailable, using local fallback:', counterError?.message || counterError);
                }
            }
            
            // Fallback: local cache only, so this never blocks on the network.
            const [cachedBills, counterSnap] = await Promise.all([
                todaysBills.get({ source: 'cache' }).catch(() => null),
                counterRef.get({ source: 'cache' }).catch(() => null)
            ]);
            // No usable cache (e.g. persistence disabled): previous behaviour.
            const billsSnap = cachedBills || await todaysBills.get();
            const cachedCounter = counterSnap?.exists ? (Number(counterSnap.data()?.next) || 0) : 0;
            const seq = Math.max(billsSnap.size, cachedCounter) + 1;
            
            // Reserve the number on the server once we reconnect so online
            // devices skip past it. Queued locally; never awaited.
            try {
                counterRef.set({ next: firebase.firestore.FieldValue.increment(1) }, { merge: true })
                    .catch(err => console.warn('Bill counter reservation failed:', err?.message || err));
            } catch (_) { /* ignore */ }
            
            return format(seq);
        } catch (error) {
            console.error('Error generating bill number:', error);
            return `${prefix}${dateStr}-${Date.now().toString().slice(-3)}`;
        }
    }

    /**
     * Atomically increment and return the day's bill counter.
     * @private
     */
    static async _nextCounterValue(counterRef, todaysBills, prefix, dateStr) {
        let existingCount = null;
        return db.runTransaction(async (tx) => {
            const snap = await tx.get(counterRef);
            const data = snap.exists ? (snap.data() || {}) : {};
            let current = Number(data.next) || 0;
            if (!data.initialized) {
                // Bills may already exist today (counter introduced mid-day or
                // numbers reserved offline): never issue a number below them.
                if (existingCount === null) {
                    existingCount = (await todaysBills.get()).size;
                }
                current = Math.max(current, existingCount);
            }
            const next = current + 1;
            tx.set(counterRef, {
                next,
                initialized: true,
                prefix,
                date: dateStr,
                updatedAt: Date.now()
            }, { merge: true });
            return next;
        });
    }

    /**
     * Run `fn` unless another call with the same key is still running.
     * While running, the matching buttons are disabled so a double tap
     * cannot create a duplicate bill. Returns undefined when ignored.
     * @param {string} key - Lock name (e.g. 'purchase')
     * @param {string} buttonSelector - CSS selector for buttons to disable
     * @param {Function} fn - Async work to run
     * @returns {Promise<*>}
     */
    static async runExclusive(key, buttonSelector, fn) {
        if (inFlightLocks.has(key)) return undefined;
        inFlightLocks.add(key);
        const buttons = (typeof document !== 'undefined' && buttonSelector)
            ? Array.from(document.querySelectorAll(buttonSelector))
            : [];
        const previous = buttons.map(btn => ({ btn, disabled: btn.disabled, opacity: btn.style.opacity }));
        buttons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.setAttribute('aria-busy', 'true');
        });
        try {
            return await fn();
        } finally {
            inFlightLocks.delete(key);
            previous.forEach(({ btn, disabled, opacity }) => {
                btn.disabled = disabled;
                btn.style.opacity = opacity;
                btn.removeAttribute('aria-busy');
            });
        }
    }

    /**
     * Run post-save bookkeeping (audit, item frequency, auto-save cleanup) in the
     * background. Failures are logged and never block or fail the save.
     * @param {Array<Function>} tasks - Functions returning promises (or values)
     * @returns {Promise<PromiseSettledResult[]>}
     */
    static runInBackground(tasks) {
        const promises = tasks.map(task => Promise.resolve().then(task));
        return Promise.allSettled(promises).then(results => {
            results.forEach(r => {
                if (r.status === 'rejected') console.error('Background task failed:', r.reason);
            });
            return results;
        });
    }

    /**
     * Whether a runExclusive lock is currently held
     * @param {string} key
     * @returns {boolean}
     */
    static isBusy(key) {
        return inFlightLocks.has(key);
    }
}

const BILL_COUNTER_TIMEOUT_MS = 2500;
const inFlightLocks = new Set();

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}

// Returns the Android major version from the WebView user agent, or Infinity if unknown
// (so newer-OS permissions are requested when detection fails).
export function getAndroidMajorVersion(userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
    const match = /Android\s+(\d+)/i.exec(userAgent || '');
    return match ? parseInt(match[1], 10) : Infinity;
}
