// -------------------- UI UTILITIES --------------------

import { AppState } from '../utils/state.js';

const UIManager = {
    // Loading state
    showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('active');
    },

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    // Toast notification
    showToast(message, duration = 2000) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    },

    // Modal
    showModal(message, title = 'Alert', showCancel = false) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('modalOverlay');
            const modalTitle = document.getElementById('modalTitle');
            const modalMessage = document.getElementById('modalMessage');
            const cancelBtn = document.getElementById('modalCancel');
            
            if (!overlay || !modalTitle || !modalMessage) {
                resolve(true);
                return;
            }
            
            modalTitle.textContent = title;
            // Use innerHTML to allow HTML content in modals
            modalMessage.innerHTML = message;
            cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
            overlay.classList.add('active');
            
            AppState.modalResolve = resolve;
        });
    },

    closeModal(result) {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            if (AppState.modalResolve) {
                AppState.modalResolve(result);
                AppState.modalResolve = null;
            }
        }
    },

    // Custom modal with HTML content
    showCustomModal(html, buttons) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('modalOverlay');
            const modalBox = overlay.querySelector('.modal-box');
            
            modalBox.innerHTML = html;
            
            const footer = document.createElement('div');
            footer.className = 'modal-footer';
            
            buttons.forEach(btn => {
                const button = document.createElement('button');
                button.className = btn.class || 'modal-btn';
                button.textContent = btn.text;
                button.onclick = () => {
                    overlay.classList.remove('active');
                    resolve(btn.value);
                };
                footer.appendChild(button);
            });
            
            modalBox.appendChild(footer);
            overlay.classList.add('active');
        });
    },

    // Haptic feedback
    hapticFeedback(type = 'light') {
        try {
            if ('vibrate' in navigator) {
                switch (type) {
                    case 'light':
                        navigator.vibrate(10);
                        break;
                    case 'medium':
                        navigator.vibrate(20);
                        break;
                    case 'heavy':
                        navigator.vibrate(50);
                        break;
                    case 'success':
                        navigator.vibrate([10, 50, 10]);
                        break;
                    case 'error':
                        navigator.vibrate([50, 100, 50]);
                        break;
                }
            }
        } catch (e) {
            console.log('Haptic feedback not supported');
        }
    }
};

// Export UIManager
export { UIManager };
