// -------------------- AUTHENTICATION MODULE --------------------

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';

const AuthManager = {
    // Show/Hide authentication tabs
    showAuthTab(tab) {
        console.log('=== showAuthTab called with:', tab, '===');
        
        const tabs = document.querySelectorAll('.auth-tab');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        
        console.log('Found tabs:', tabs.length);
        console.log('Found loginForm:', !!loginForm);
        console.log('Found registerForm:', !!registerForm);
        
        if (!loginForm || !registerForm) {
            console.error('Forms not found!');
            return false;
        }
        
        if (tabs.length < 2) {
            console.error('Not enough tabs found!');
            return false;
        }
        
        // Remove active from all tabs and hide all forms
        tabs.forEach((t, i) => {
            console.log('Processing tab', i, ':', t);
            t.classList.remove('active');
        });
        loginForm.classList.add('hidden');
        registerForm.classList.add('hidden');
        
        // Show selected tab
        if (tab === 'login') {
            tabs[0].classList.add('active');
            loginForm.classList.remove('hidden');
            console.log('✓ Login form shown, register hidden');
        } else if (tab === 'register') {
            tabs[1].classList.add('active');
            registerForm.classList.remove('hidden');
            console.log('✓ Register form shown, login hidden');
        }
        
        // Verify the changes
        console.log('Login form hidden?', loginForm.classList.contains('hidden'));
        console.log('Register form hidden?', registerForm.classList.contains('hidden'));
        console.log('Tab 0 active?', tabs[0].classList.contains('active'));
        console.log('Tab 1 active?', tabs[1].classList.contains('active'));
        
        return false;
    },

    // Initialize auth tab switching
    initAuthTabs() {
        const tabs = document.querySelectorAll('.auth-tab');
        if (tabs.length === 0) {
            setTimeout(() => this.initAuthTabs(), 10);
            return;
        }
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const tabType = index === 0 ? 'login' : 'register';
                console.log('Tab clicked:', tabType);
                AuthManager.showAuthTab(tabType);
            });
        });
        console.log('Auth tabs initialized, found', tabs.length, 'tabs');
    },

    // Handle login
    async handleLogin() {
        console.log('=== LOGIN STARTED ===');
        console.log('Device:', navigator.userAgent);
        console.log('Online:', navigator.onLine);
        console.log('Firebase auth initialized:', !!auth);
        console.log('Firebase db initialized:', !!db);
        
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        
        console.log('Email input found:', !!emailInput);
        console.log('Password input found:', !!passwordInput);
        
        if (!emailInput || !passwordInput) {
            UIManager.showToast('Form elements not found');
            return;
        }
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        console.log('Email:', email);
        console.log('Password length:', password.length);
        
        if (!email || !password) {
            UIManager.showToast('Please enter email and password');
            return;
        }
        
        console.log('Starting Firebase auth...');
        UIManager.showLoading();
        
        try {
            console.log('Calling signInWithEmailAndPassword...');
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            console.log('Sign in successful!', userCredential.user.uid);
            
            const userId = userCredential.user.uid;
            console.log('Fetching user document from Firestore...');
            const userDoc = await firebase.firestore().collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                console.log('User document not found');
                await firebase.auth().signOut();
                UIManager.hideLoading();
                UIManager.showToast('User account not found. Please register.');
                return;
            }
            
            const userData = userDoc.data();
            console.log('User data:', userData);
            
            if (userData.status === 'pending') {
                console.log('User account pending approval');
                await firebase.auth().signOut();
                UIManager.hideLoading();
                UIManager.showToast('Your account is pending approval. Please wait for admin approval.');
                return;
            }
            
            if (userData.status === 'rejected') {
                console.log('User account rejected');
                await firebase.auth().signOut();
                UIManager.hideLoading();
                UIManager.showToast('Your account has been rejected. Please contact admin.');
                return;
            }
            
            AppState.currentUser = userCredential.user;
            AppState.userRole = userData.role || 'staff';
            AppState.userName = userData.name || 'User';
            
            console.log('Login successful! Role:', AppState.userRole);
            UIManager.hideLoading();
            UIManager.showToast('Login successful!');
            
            document.getElementById('authScreen').style.display = 'none';
            await window.loadUserDataAndInitialize();
            
        } catch (error) {
            console.error('Login error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            UIManager.hideLoading();
            
            let errorMessage = 'Login failed. ';
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage += 'Invalid email address.';
                    break;
                case 'auth/user-disabled':
                    errorMessage += 'This account has been disabled.';
                    break;
                case 'auth/user-not-found':
                    errorMessage += 'No account found with this email.';
                    break;
                case 'auth/wrong-password':
                    errorMessage += 'Incorrect password.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage += 'Network error. Check your internet connection.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage += 'Too many attempts. Please try again later.';
                    break;
                default:
                    errorMessage += error.message;
            }
            
            UIManager.showToast(errorMessage, 4000);
        }
        
        console.log('=== LOGIN ENDED ===');
    },

    // Handle registration
    async handleRegister() {
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const role = document.getElementById('registerRole').value;
        
        if (!name || !email || !password) {
            UIManager.showToast('Please fill all fields');
            return;
        }
        
        if (password.length < 6) {
            UIManager.showToast('Password must be at least 6 characters');
            return;
        }
        
        UIManager.showLoading();
        
        try {
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const userId = userCredential.user.uid;
            
            await firebase.firestore().collection('users').doc(userId).set({
                name: name,
                email: email,
                role: role,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await firebase.auth().signOut();
            
            UIManager.hideLoading();
            UIManager.showToast('Registration successful! Please wait for admin approval.');
            
            this.showAuthTab('login');
            
        } catch (error) {
            console.error('Registration error:', error);
            UIManager.hideLoading();
            
            let errorMessage = 'Registration failed. ';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage += 'This email is already registered.';
                    break;
                case 'auth/invalid-email':
                    errorMessage += 'Invalid email address.';
                    break;
                case 'auth/weak-password':
                    errorMessage += 'Password is too weak.';
                    break;
                default:
                    errorMessage += error.message;
            }
            
            UIManager.showToast(errorMessage, 4000);
        }
    },

    // Handle forgot password
    async handleForgotPassword() {
        const email = document.getElementById('loginEmail').value.trim();
        
        if (!email) {
            UIManager.showToast('Please enter your email address');
            return;
        }
        
        UIManager.showLoading();
        
        try {
            await firebase.auth().sendPasswordResetEmail(email);
            UIManager.hideLoading();
            UIManager.showToast('Password reset email sent! Check your inbox.');
        } catch (error) {
            console.error('Password reset error:', error);
            UIManager.hideLoading();
            UIManager.showToast('Failed to send reset email: ' + error.message, 4000);
        }
    },

    // Handle logout
    async handleLogout() {
        const confirmed = await UIManager.showModal('Are you sure you want to logout?', 'Confirm Logout', true);
        
        if (!confirmed) return;
        
        UIManager.showLoading();
        
        try {
            await firebase.auth().signOut();
            AppState.currentUser = null;
            AppState.userRole = 'staff';
            AppState.userName = 'User';
            
            document.getElementById('authScreen').style.display = 'flex';
            UIManager.hideLoading();
            UIManager.showToast('Logged out successfully');
        } catch (error) {
            console.error('Logout error:', error);
            UIManager.hideLoading();
            UIManager.showToast('Logout failed: ' + error.message);
        }
    },

    // Update user display in settings
    updateUserDisplay() {
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userRoleDisplay = document.getElementById('userRoleDisplay');
        const userEmailDisplay = document.getElementById('userEmailDisplay');
        
        if (userNameDisplay) userNameDisplay.textContent = AppState.userName;
        if (userRoleDisplay) userRoleDisplay.textContent = AppState.userRole.toUpperCase();
        if (userEmailDisplay && AppState.currentUser) {
            userEmailDisplay.textContent = AppState.currentUser.email;
        }
    },

    // Apply role-based UI restrictions
    applyRoleBasedRestrictions() {
        const isOwnerOrManager = AppState.userRole === 'owner' || AppState.userRole === 'manager';
        const isOwner = AppState.userRole === 'owner';
        
        // Hide/show tabs based on role
        const restrictedTabs = {
            'financeTab': isOwnerOrManager,
            'analyticsTab': isOwnerOrManager,
            'usersTab': isOwner
        };
        
        Object.entries(restrictedTabs).forEach(([tabId, allowed]) => {
            const tab = document.getElementById(tabId);
            if (tab) {
                tab.style.display = allowed ? 'block' : 'none';
            }
        });
        
        // Hide/show nav menu items
        const navItems = document.querySelectorAll('.nav-menu a');
        navItems.forEach(item => {
            const tabId = item.getAttribute('onclick')?.match(/showTabFromNav\('([^']+)'/)?.[1];
            if (tabId) {
                if (tabId === 'finance' && !isOwnerOrManager) {
                    item.style.display = 'none';
                }
                if (tabId === 'analytics' && !isOwnerOrManager) {
                    item.style.display = 'none';
                }
                if (tabId === 'users' && !isOwner) {
                    item.style.display = 'none';
                }
            }
        });
        
        // Restrict sensitive buttons
        const deleteButtons = document.querySelectorAll('[data-requires-owner]');
        deleteButtons.forEach(btn => {
            if (!isOwner) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.title = 'Only owners can perform this action';
            }
        });
        
        // Restrict data export
        const exportButtons = document.querySelectorAll('[data-requires-manager]');
        exportButtons.forEach(btn => {
            if (!isOwnerOrManager) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.title = 'Only managers and owners can export data';
            }
        });
    }
};

// Initialize auth tabs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuthManager.initAuthTabs());
} else {
    AuthManager.initAuthTabs();
}

// Export AuthManager
export { AuthManager };
