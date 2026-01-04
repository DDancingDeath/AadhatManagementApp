// -------------------- UTILITY HELPERS --------------------

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Debounce function
export function debounce(func, wait) {
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

// Format date (DD MMM YYYY)
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

// Format date with time (DD/MM/YYYY, HH:MM AM/PM)
export function formatDateTime(dateString) {
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

// Get current date/time string in en-IN locale
export function getCurrentDateTime() {
    return new Date().toLocaleString('en-IN');
}

// Format currency
export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

// Generate unique ID
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Pick contact from device
export async function pickContact(inputElementId) {
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
