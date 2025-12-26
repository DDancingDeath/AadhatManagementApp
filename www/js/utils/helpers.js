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

// Format date
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
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
