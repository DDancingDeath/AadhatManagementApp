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
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML string
     */
    static escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
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
     * Format amount as Indian Rupee currency
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency string
     */
    static formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
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
}
