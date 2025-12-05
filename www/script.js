// -------------------- AUTHENTICATION --------------------
let currentUser = null;
let userRole = 'staff';
let userName = 'User';

// Show/Hide authentication tabs
window.showAuthTab = function(tab) {
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
    
    return false; // Prevent default link behavior
};

// Initialize auth tab switching - runs immediately
(function() {
    function initAuthTabs() {
        const tabs = document.querySelectorAll('.auth-tab');
        if (tabs.length === 0) {
            // DOM not ready yet, try again in 10ms
            setTimeout(initAuthTabs, 10);
            return;
        }
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const tabType = index === 0 ? 'login' : 'register';
                console.log('Tab clicked:', tabType);
                window.showAuthTab(tabType);
            });
        });
        console.log('Auth tabs initialized, found', tabs.length, 'tabs');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthTabs);
    } else {
        initAuthTabs();
    }
})();

// Handle login
window.handleLogin = async function() {
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
        console.error('Login inputs not found!');
        alert('ERROR: Login form not found. Please refresh the page.');
        return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    console.log('Email:', email);
    console.log('Password length:', password.length);
    
    if (!email || !password) {
        console.log('Empty email or password');
        await showModal('Please enter both email and password');
        return;
    }
    
    console.log('Starting Firebase auth...');
    showLoading();
    
    try {
        console.log('Calling signInWithEmailAndPassword...');
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log('Auth successful, user:', userCredential.user.uid);
        
        // Check if user is approved
        console.log('Fetching user document...');
        const userDoc = await db.collection('users').doc(userCredential.user.uid).get();
        console.log('User doc exists:', userDoc.exists);
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            console.log('User data:', userData);
            
            if (userData.status === 'pending' || !userData.role) {
                console.log('User not approved');
                await auth.signOut();
                hideLoading();
                await showModal('Your account is pending approval. Please contact the owner.');
                return;
            }
        }
        
        console.log('Login successful!');
        hapticFeedback('medium');
        showToast('Login successful!');
    } catch (error) {
        hideLoading();
        console.error('=== LOGIN ERROR ===');
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        
        let message = 'Login failed. Please try again.';
        if (error.code === 'auth/user-not-found') {
            message = 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            message = 'Incorrect password.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email address.';
        } else if (error.code === 'auth/invalid-credential') {
            message = 'Invalid email or password. Please check your credentials.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Too many failed login attempts. Please try again later.';
        } else if (error.code === 'auth/network-request-failed') {
            message = 'Network error. Please check your internet connection.';
        } else {
            message = `Login failed: ${error.message}`;
        }
        
        console.log('Showing modal with message:', message);
        try {
            await showModal(message);
            console.log('Modal shown successfully');
        } catch (modalError) {
            console.error('Modal error:', modalError);
            alert(message); // Fallback
        }
    }
    
    console.log('=== LOGIN ENDED ===');
}

// Handle registration
window.handleRegister = async function() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    if (!name || !email || !password || !confirmPassword) {
        await showModal('Please fill in all fields');
        return;
    }
    
    if (password.length < 6) {
        await showModal('Password must be at least 6 characters long');
        return;
    }
    
    if (password !== confirmPassword) {
        await showModal('Passwords do not match');
        return;
    }
    
    showLoading();
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Check if this is the first user
        const usersSnapshot = await db.collection('users').get();
        const isFirstUser = usersSnapshot.empty;
        
        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            role: isFirstUser ? 'owner' : null, // First user is owner, others need approval
            status: isFirstUser ? 'active' : 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Sign out the user immediately if not the first user
        if (!isFirstUser) {
            await auth.signOut();
            hideLoading();
            await showModal('Registration successful! Please wait for the owner to approve your account.');
            return;
        }

        hapticFeedback('medium');
        showToast('Account created successfully!');
    } catch (error) {
        hideLoading();
        let message = 'Registration failed. Please try again.';
        if (error.code === 'auth/email-already-in-use') {
            message = 'An account with this email already exists.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email address.';
        } else if (error.code === 'auth/weak-password') {
            message = 'Password is too weak. Use at least 6 characters.';
        }
        await showModal(message);
    }
}

// Handle forgot password
window.handleForgotPassword = async function() {
    const email = document.getElementById('loginEmail').value.trim();
    
    if (!email) {
        await showModal('Please enter your email address in the login form first');
        return;
    }
    
    try {
        await auth.sendPasswordResetEmail(email);
        await showModal(`Password reset email sent to ${email}. Please check your inbox.`);
    } catch (error) {
        let message = 'Failed to send reset email.';
        if (error.code === 'auth/user-not-found') {
            message = 'No account found with this email.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email address.';
        }
        await showModal(message);
    }
}

// Handle logout
window.handleLogout = async function() {
    const confirmed = await showModal('Are you sure you want to logout?', 'Logout', true);
    if (!confirmed) return;
    
    try {
        await auth.signOut();
        hapticFeedback('light');
        showToast('Logged out successfully');
        
        // Clear login form
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (error) {
        await showModal('Failed to logout. Please try again.');
    }
}

// Update user display in settings
function updateUserDisplay() {
    if (currentUser) {
        const userEmailEl = document.getElementById('userEmail');
        if (userEmailEl) {
            userEmailEl.textContent = currentUser.email;
        }
        
        // userRoleDisplay was removed from settings page
        const userRoleEl = document.getElementById('userRoleDisplay');
        if (userRoleEl) {
            userRoleEl.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        }
    }
}

// Apply role-based UI restrictions
function applyRoleBasedRestrictions() {
    console.log('Applying role-based restrictions for:', userRole);
    
    // Owner only: Show Users tab
    const usersNavLink = document.getElementById('usersNavLink');
    if (usersNavLink) {
        usersNavLink.style.display = userRole === 'owner' ? 'block' : 'none';
    }
    
    // Manager role restrictions
    if (userRole === 'manager') {
        // Hide Items tab
        const itemsNav = document.querySelector('.nav-menu a[onclick*="items"]');
        if (itemsNav) itemsNav.style.display = 'none';
        
        // Hide Sales tab
        const salesNav = document.querySelector('.nav-menu a[onclick*="sales"]');
        if (salesNav) salesNav.style.display = 'none';
        
        // Hide Configure tab
        const configNav = document.querySelector('.nav-menu a[onclick*="configure"]');
        if (configNav) configNav.style.display = 'none';
    }
    
    // Staff role restrictions
    if (userRole === 'staff') {
        // Hide Items tab
        const itemsNav = document.querySelector('.nav-menu a[onclick*="items"]');
        if (itemsNav) itemsNav.style.display = 'none';
        
        // Hide Stock tab
        const stockNav = document.querySelector('.nav-menu a[onclick*="stock"]');
        if (stockNav) stockNav.style.display = 'none';
        
        // Hide Sales tab
        const salesNav = document.querySelector('.nav-menu a[onclick*="sales"]');
        if (salesNav) salesNav.style.display = 'none';
        
        // Hide Configure tab
        const configNav = document.querySelector('.nav-menu a[onclick*="configure"]');
        if (configNav) configNav.style.display = 'none';
    }
    
    // Manager and Staff: Hide clear data button
    if (userRole !== 'owner') {
        const clearDataBtn = document.querySelector('button[onclick*="clearAllData"]');
        if (clearDataBtn) clearDataBtn.style.display = 'none';
    }
    
    // Staff: Hide month and custom date filters (limit to 1 week)
    if (userRole === 'staff') {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            if (btn.textContent.includes('Month') || btn.textContent.includes('Custom')) {
                btn.style.display = 'none';
            }
        });
    }
    
    console.log('Role restrictions applied');
}

// Chat tab functions
window.sendChatMessageFromTab = async function() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;
    
    askChatbot(message);
    input.value = '';
};

window.askChatbot = async function(message) {
    const messagesDiv = document.getElementById('chatMessages');
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.textContent = message;
    userMsg.style.cssText = 'background: #667eea; color: white; padding: 12px 16px; border-radius: 18px; margin-bottom: 12px; max-width: 70%; margin-left: auto; text-align: right; box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);';
    messagesDiv.appendChild(userMsg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Process message
    const response = await processChatMessage(message.toLowerCase());
    
    // Add bot response with animation
    setTimeout(() => {
        const botMsg = document.createElement('div');
        botMsg.innerHTML = response;
        botMsg.style.cssText = 'background: white; padding: 12px 16px; border-radius: 18px; margin-bottom: 12px; max-width: 70%; box-shadow: 0 2px 8px rgba(0,0,0,0.1); animation: slideIn 0.3s ease-out;';
        messagesDiv.appendChild(botMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 600);
};

async function processChatMessage(message) {
    // Stock queries
    if (message.includes('stock') || message.includes('inventory')) {
        const itemsList = items.map(item => {
            const qty = stock[item.name]?.quantity || 0;
            return `<br>• ${item.name}: ${qty.toFixed(2)} kg`;
        }).join('');
        return `📦 Current Stock:${itemsList || '<br>No items in stock'}`;
    }
    
    // Sales queries
    if (message.includes('sales') || message.includes('revenue')) {
        const totalSales = salesHistory.reduce((sum, sale) => sum + sale.total, 0);
        return `💰 Total Sales: ₹${totalSales.toFixed(2)}<br>Transactions: ${salesHistory.length}`;
    }
    
    // Purchase queries
    if (message.includes('purchase') || message.includes('bill')) {
        const totalPurchases = billHistory.reduce((sum, bill) => sum + bill.total, 0);
        return `📝 Total Purchases: ₹${totalPurchases.toFixed(2)}<br>Bills: ${billHistory.length}`;
    }
    
    // Item queries
    if (message.includes('item') || message.includes('product')) {
        return `📋 You have ${items.length} items in your catalog.`;
    }
    
    // Customer queries
    if (message.includes('customer')) {
        const customers = [...new Set(billHistory.map(b => b.customerName).filter(n => n))];
        return `👥 You have ${customers.length} unique customers.`;
    }
    
    // Help/Default
    return `I can help you with:<br>• Stock levels ("show stock")<br>• Sales reports ("total sales")<br>• Purchase history ("total purchases")<br>• Customer info ("customers")<br><br>Try asking me!`;
}

// -------------------- FIRESTORE DATA OPERATIONS --------------------

// Load items from Firestore
async function loadItemsFromFirestore() {
    const snapshot = await db.collection('items').get();
    items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Also calculate stock from bills
    await calculateStockFromBills();
}

// Save item to Firestore
async function saveItemToFirestore(item) {
    if (item.id) {
        // Update existing
        await db.collection('items').doc(item.id).update(item);
    } else {
        // Create new
        const docRef = await db.collection('items').add({
            ...item,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid
        });
        item.id = docRef.id;
    }
}

// Delete item from Firestore
async function deleteItemFromFirestore(itemId) {
    await db.collection('items').doc(itemId).delete();
}

// Load bills from Firestore
async function loadBillsFromFirestore() {
    const snapshot = await db.collection('bills').orderBy('date', 'desc').get();
    billHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Save bill to Firestore
async function saveBillToFirestore(bill) {
    // Check if we're editing an existing bill
    if (window.editingBillDocId) {
        const oldBillSnapshot = await db.collection('bills').doc(window.editingBillDocId).get();
        const oldBill = oldBillSnapshot.data();
        
        // Update the existing document
        await db.collection('bills').doc(window.editingBillDocId).update({
            ...bill,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.uid,
            updatedByName: userName,
            editHistory: firebase.firestore.FieldValue.arrayUnion({
                editedAt: new Date().toLocaleString('en-IN'),
                editedBy: userName,
                previousData: {
                    customerName: oldBill.customerName,
                    total: oldBill.total,
                    items: oldBill.items,
                    laborCharges: oldBill.laborCharges
                }
            })
        });
        
        bill.id = window.editingBillDocId;
        
        // Send notification to owners about the edit
        await notifyOwnersOfEdit('purchase', window.editingBillDocId, oldBill, bill);
        
        // Clear edit mode flags
        delete window.editingBillId;
        delete window.editingBillDocId;
        
        return bill;
    } else {
        // Create new bill
        const docRef = await db.collection('bills').add({
            ...bill,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid,
            createdByName: userName
        });
        bill.id = docRef.id;
        return bill;
    }
}

// Load sales from Firestore
async function loadSalesFromFirestore() {
    const snapshot = await db.collection('sales').orderBy('date', 'desc').get();
    salesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Save sale to Firestore
async function saveSaleToFirestore(sale) {
    // Check if we're editing an existing sale
    if (window.editingSaleDocId) {
        const oldSaleSnapshot = await db.collection('sales').doc(window.editingSaleDocId).get();
        const oldSale = oldSaleSnapshot.data();
        
        // Update the existing document
        await db.collection('sales').doc(window.editingSaleDocId).update({
            ...sale,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.uid,
            updatedByName: userName,
            editHistory: firebase.firestore.FieldValue.arrayUnion({
                editedAt: new Date().toLocaleString('en-IN'),
                editedBy: userName,
                previousData: {
                    customerName: oldSale.customerName,
                    total: oldSale.total,
                    items: oldSale.items
                }
            })
        });
        
        sale.id = window.editingSaleDocId;
        
        // Send notification to owners about the edit
        await notifyOwnersOfEdit('sale', window.editingSaleDocId, oldSale, sale);
        
        // Clear edit mode flags
        delete window.editingSaleId;
        delete window.editingSaleDocId;
        
        return sale;
    } else {
        // Create new sale
        const docRef = await db.collection('sales').add({
            ...sale,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid,
            createdByName: userName
        });
        sale.id = docRef.id;
        return sale;
    }
}

// Load payments from Firestore
async function loadPaymentsFromFirestore() {
    const snapshot = await db.collection('payments').orderBy('date', 'desc').get();
    paymentsHistory = snapshot.docs.map(doc => {
        const data = doc.data();
        if (!data.category) {
            data.category = 'business';
        }
        return { id: doc.id, ...data };
    });
}

// Save payment to Firestore
async function savePaymentToFirestore(payment) {
    const docRef = await db.collection('payments').add({
        ...payment,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid,
        createdByName: userName
    });
    payment.id = docRef.id;
    return payment;
}

// Load stock adjustments from Firestore
async function loadStockAdjustmentsFromFirestore() {
    const snapshot = await db.collection('stockAdjustments').orderBy('date', 'desc').limit(100).get();
    stockAdjustments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Save stock adjustment to Firestore
async function saveStockAdjustmentToFirestore(adjustment) {
    const docRef = await db.collection('stockAdjustments').add({
        ...adjustment,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid,
        createdByName: userName
    });
    adjustment.id = docRef.id;
    return adjustment;
}

// Calculate stock from all bills (purchase increases, sales decrease)
async function calculateStockFromBills() {
    stock = {};
    
    // Add purchases
    billHistory.forEach(bill => {
        bill.items.forEach(item => {
            if (!stock[item.name]) {
                stock[item.name] = { quantity: 0, avgRate: 0, totalValue: 0 };
            }
            const oldQty = stock[item.name].quantity;
            const oldValue = stock[item.name].totalValue;
            const newQty = oldQty + item.qty;
            const newValue = oldValue + item.total;
            
            stock[item.name].quantity = newQty;
            stock[item.name].totalValue = newValue;
            stock[item.name].avgRate = newValue / newQty;
        });
    });
    
    // Subtract sales
    salesHistory.forEach(sale => {
        sale.items.forEach(item => {
            if (stock[item.name]) {
                // Handle both qty (from billing tab) and quantity (from sales tab)
                const saleQty = item.qty || item.quantity || 0;
                stock[item.name].quantity -= saleQty;
            }
        });
    });
    
    // Apply adjustments (apply the change delta, not absolute newQuantity)
    stockAdjustments.forEach(adj => {
        if (!stock[adj.itemName]) {
            stock[adj.itemName] = { quantity: 0, avgRate: 0, totalValue: 0 };
        }
        // Apply the change amount (delta) to current calculated stock
        stock[adj.itemName].quantity += adj.change;
        // Ensure non-negative
        stock[adj.itemName].quantity = Math.max(0, stock[adj.itemName].quantity);
    });
}

// Set up real-time listeners for live sync
function setupRealtimeListeners() {
    // Listen to items changes
    db.collection('items').onSnapshot((snapshot) => {
        // Save currently focused element
        const activeElement = document.activeElement;
        const isFocusedOnItemInput = activeElement && 
            (activeElement.classList.contains('item-name-input') || 
             activeElement.classList.contains('rate-input') ||
             (activeElement.tagName === 'INPUT' && activeElement.closest('.item-card')));
        
        items = [];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });
        
        // Only re-render if not currently typing in an item field
        if (!isFocusedOnItemInput) {
            renderItems();
        }
        loadItemsDropdown();
    });
    
    // Listen to bills changes
    db.collection('bills').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        billHistory = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            billHistory.push({ id: doc.id, ...data });
        });
        calculateStockFromBills();
    });
    
    // Listen to sales changes
    db.collection('sales').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        salesHistory = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            salesHistory.push({ id: doc.id, ...data });
        });
        calculateStockFromBills();
    });
    
    // Listen to payments changes
    db.collection('payments').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        paymentsHistory = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            paymentsHistory.push({ id: doc.id, ...data });
        });
        renderPaymentsHistory();
    });
    
    // Listen to stock adjustments changes
    db.collection('stockAdjustments').orderBy('createdAt', 'desc').limit(100).onSnapshot((snapshot) => {
        stockAdjustments = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            stockAdjustments.push({ id: doc.id, ...data });
        });
        calculateStockFromBills();
    });
}

// -------------------- DATABASE --------------------
let items = [];
let billItems = [];
let labourCharges = [];
let billHistory = [];
let currentWeights = [];
let stock = {};
let salesItems = [];
let salesHistory = [];
let paymentsHistory = [];
let stockAdjustments = [];
let withdrawalsHistory = [];
let currentDateFilter = 'today';
let customDateRange = { from: null, to: null };
let transactionMode = 'purchase'; // 'purchase' or 'sale'
let reportFilters = { transaction: 'all', item: 'all', customer: 'all' };
let customerPhoneNumber = ''; // Store phone number for WhatsApp

// Auto-save draft bills to prevent data loss
function saveBillDraft() {
    try {
        const draft = {
            billItems: billItems,
            currentWeights: currentWeights,
            transactionMode: transactionMode,
            customerName: document.getElementById('customerName')?.value || '',
            customerPhone: customerPhoneNumber,
            billComments: document.getElementById('billComments')?.value || '',
            itemIndex: document.getElementById('billItem')?.value || '',
            rate: document.getElementById('billRate')?.value || '',
            laborCharges: document.getElementById('manualLaborCharges')?.value || 0,
            cashPayment: document.getElementById('cashPayment')?.value || 0,
            onlinePayment: document.getElementById('onlinePayment')?.value || 0,
            dueAmount: document.getElementById('dueAmount')?.value || 0,
            timestamp: Date.now()
        };
        localStorage.setItem('billDraft', JSON.stringify(draft));
        
        // Show draft saved indicator briefly
        const indicator = document.getElementById('draftIndicator');
        if (indicator) {
            indicator.style.display = 'inline';
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving bill draft:', error);
    }
}

function restoreBillDraft() {
    try {
        const draftStr = localStorage.getItem('billDraft');
        if (!draftStr) return false;
        
        const draft = JSON.parse(draftStr);
        
        // Check if draft is not too old (less than 24 hours)
        const ageHours = (Date.now() - draft.timestamp) / (1000 * 60 * 60);
        if (ageHours > 24) {
            localStorage.removeItem('billDraft');
            return false;
        }
        
        // Restore bill state
        if (draft.billItems && draft.billItems.length > 0) {
            billItems = draft.billItems;
            currentWeights = draft.currentWeights || [];
            transactionMode = draft.transactionMode || 'purchase';
            
            // Restore form fields
            setTimeout(() => {
                if (draft.customerName) {
                    const customerEl = document.getElementById('customerName');
                    if (customerEl) customerEl.value = draft.customerName;
                }
                if (draft.customerPhone) {
                    customerPhoneNumber = draft.customerPhone;
                }
                if (draft.billComments) {
                    const commentsEl = document.getElementById('billComments');
                    if (commentsEl) commentsEl.value = draft.billComments;
                }
                if (draft.itemIndex) {
                    const itemEl = document.getElementById('billItem');
                    if (itemEl) itemEl.value = draft.itemIndex;
                }
                if (draft.rate) {
                    const rateEl = document.getElementById('billRate');
                    if (rateEl) rateEl.value = draft.rate;
                }
                if (draft.laborCharges) {
                    const laborEl = document.getElementById('manualLaborCharges');
                    if (laborEl) laborEl.value = draft.laborCharges;
                }
                if (draft.cashPayment) {
                    const cashEl = document.getElementById('cashPayment');
                    if (cashEl) cashEl.value = draft.cashPayment;
                }
                if (draft.onlinePayment) {
                    const onlineEl = document.getElementById('onlinePayment');
                    if (onlineEl) onlineEl.value = draft.onlinePayment;
                }
                if (draft.dueAmount) {
                    const dueEl = document.getElementById('dueAmount');
                    if (dueEl) dueEl.value = draft.dueAmount;
                }
                
                renderBill();
                renderWeights();
                updateTotals();
                updateModeUI();
            }, 500);
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error restoring bill draft:', error);
        return false;
    }
}

function clearBillDraft() {
    localStorage.removeItem('billDraft');
}

// Settings with defaults
let settings = JSON.parse(localStorage.getItem("settings")) || {
    heavyWeightThreshold: 30,
    laborRate: 6,
    autoLaborEnabled: true,
    showHindi: false
};

// Modal system
let modalResolve = null;

// -------------------- MOBILE UI ENHANCEMENTS --------------------
// Haptic feedback
function hapticFeedback(type = 'light') {
    if (window.Capacitor && window.Capacitor.Plugins.Haptics) {
        const { Haptics, ImpactStyle } = window.Capacitor.Plugins;
        try {
            if (type === 'light') {
                Haptics.impact({ style: ImpactStyle.Light });
            } else if (type === 'medium') {
                Haptics.impact({ style: ImpactStyle.Medium });
            } else if (type === 'heavy') {
                Haptics.impact({ style: ImpactStyle.Heavy });
            }
        } catch (e) {
            // Haptics not available
        }
    } else if (navigator.vibrate) {
        // Fallback to vibration API
        if (type === 'light') navigator.vibrate(10);
        else if (type === 'medium') navigator.vibrate(20);
        else if (type === 'heavy') navigator.vibrate(30);
    }
}

// -------------------- BLUETOOTH PRINTER --------------------
let connectedPrinter = null;
let printerSettings = JSON.parse(localStorage.getItem('printerSettings')) || {
    enabled: false,
    deviceId: null,
    deviceName: null,
    paperWidth: 48 // characters per line for 80mm thermal printer
};

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';

class BluetoothPrinterManager {
    constructor() {
        this.device = null;
        this.printerName = null;
    }

    async scanDevices() {
        try {
            if (!window.bluetoothSerial) {
                throw new Error('Bluetooth Serial plugin not available');
            }
            
            showLoading();
            console.log('[SCAN] Starting Bluetooth scan...');
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.list(
                    (devices) => {
                        hideLoading();
                        console.log('[SCAN] Found', devices.length, 'devices');
                        // Format to match expected structure
                        const formattedDevices = devices.map(d => ({
                            address: d.address,
                            name: d.name || d.address
                        }));
                        resolve(formattedDevices);
                    },
                    (error) => {
                        hideLoading();
                        console.error('[SCAN] Error:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            hideLoading();
            console.error('[SCAN] Error:', error);
            throw error;
        }
    }

    async connect(deviceId) {
        try {
            if (!window.bluetoothSerial) {
                throw new Error('Bluetooth Serial plugin not available');
            }
            
            showLoading();
            console.log('[CONNECT] Connecting to:', deviceId);
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.connect(
                    deviceId,
                    () => {
                        hideLoading();
                        console.log('[CONNECT] Connected successfully');
                        this.device = deviceId;
                        connectedPrinter = this;
                        resolve(true);
                    },
                    (error) => {
                        hideLoading();
                        console.error('[CONNECT] Error:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            hideLoading();
            console.error('[CONNECT] Error:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.device && window.bluetoothSerial) {
            try {
                return new Promise((resolve) => {
                    window.bluetoothSerial.disconnect(
                        () => {
                            this.device = null;
                            this.printerName = null;
                            connectedPrinter = null;
                            console.log('[DISCONNECT] Disconnected');
                            resolve();
                        },
                        () => {
                            // Even if disconnect fails, clear state
                            this.device = null;
                            this.printerName = null;
                            connectedPrinter = null;
                            resolve();
                        }
                    );
                });
            } catch (error) {
                console.error('[DISCONNECT] Error:', error);
            }
        }
    }

    async write(billData) {
        if (!this.device) {
            throw new Error('Not connected to device');
        }

        if (!window.bluetoothSerial) {
            throw new Error('Bluetooth Serial plugin not available');
        }
        
        console.log('[WRITE] Building receipt as image...');
        
        try {
            // STEP 1: Create large temporary canvas for drawing
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set canvas size for 58mm thermal printer (384 pixels width)
            const width = 384;
            let y = 30;
            tempCanvas.width = width;
            tempCanvas.height = 2000; // Large temporary canvas
            
            // White background with black text
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.fillStyle = '#000000';
            
            // Helper function to draw centered text
            const drawCenter = (text, yPos, fontSize = 20, bold = false) => {
                tempCtx.font = `${bold ? 'bold ' : ''}${fontSize}px Arial`;
                tempCtx.fillStyle = '#000000';
                const textWidth = tempCtx.measureText(text).width;
                tempCtx.fillText(text, (width - textWidth) / 2, yPos);
                return yPos + fontSize + 6;
            };
            
            // Helper function to draw left-aligned text
            const drawLeft = (text, yPos, fontSize = 18) => {
                tempCtx.font = `${fontSize}px Arial`;
                tempCtx.fillStyle = '#000000';
                tempCtx.fillText(text, 15, yPos);
                return yPos + fontSize + 6;
            };
            
            // Helper function to draw right-aligned text
            const drawRight = (text, yPos, fontSize = 18) => {
                tempCtx.font = `${fontSize}px Arial`;
                tempCtx.fillStyle = '#000000';
                const textWidth = tempCtx.measureText(text).width;
                tempCtx.fillText(text, width - textWidth - 15, yPos);
                return yPos + fontSize + 6;
            };
            
            // Helper function to add spacing (no lines)
            const addSpacing = (yPos, space = 12) => {
                return yPos + space;
            };
            
            // Build receipt content on temporary canvas
            
            // STEP 1: Show weights breakdown FIRST for items with multiple weights
            tempCtx.font = '18px Arial';
            tempCtx.fillStyle = '#000000';
            
            billData.items.forEach(item => {
                if (item.weights && item.weights.length > 1) {
                    // Item name with weight count
                    y = drawLeft(`${item.name} (${item.weights.length} वजन)`, y, 18);
                    
                    // Show weights 6 per line
                    for (let i = 0; i < item.weights.length; i += 6) {
                        const weightsLine = item.weights.slice(i, i + 6)
                            .map(w => w.toFixed(1))
                            .join(' ');
                        y = drawLeft(weightsLine, y, 16);
                    }
                    
                    y = addSpacing(y, 8);
                }
            });
            
            // STEP 2: Receipt header
            const receiptY = y;
            y = drawCenter('Receipt', y, 26, true);
            // Draw underline for Receipt
            tempCtx.fillStyle = '#000000';
            const receiptWidth = tempCtx.measureText('Receipt').width;
            tempCtx.fillRect((width - receiptWidth) / 2, receiptY + 2, receiptWidth, 2);
            
            y = drawCenter(new Date().toLocaleDateString('en-IN') + ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), y, 18);
            y = addSpacing(y, 12);
            
            // Customer name if provided
            if (billData.customerName) {
                y = drawLeft('Customer: ' + billData.customerName, y, 18);
                y += 8;
            }
            
            // Table header
            tempCtx.font = 'bold 20px Arial';
            tempCtx.fillStyle = '#000000';
            tempCtx.fillText('वस्तु', 15, y);
            tempCtx.fillText('दर', 140, y);
            tempCtx.fillText('मात्रा', 220, y);
            tempCtx.fillText('कुल', 310, y);
            y += 24;
            y = addSpacing(y, 8);
            
            // Items summary (without weight breakdown in line)
            tempCtx.font = '18px Arial';
            billData.items.forEach(item => {
                const weightsStr = item.qty + 'kg';
                
                tempCtx.fillStyle = '#000000';
                tempCtx.fillText(item.name.substring(0, 11), 15, y);
                tempCtx.fillText('₹' + item.rate, 140, y);
                tempCtx.fillText(weightsStr, 220, y);
                tempCtx.fillText('₹' + item.total, 310, y);
                y += 24;
            });
            
            y = addSpacing(y, 12);
            
            // Totals with proper alignment
            tempCtx.font = '18px Arial';
            tempCtx.fillStyle = '#000000';
            tempCtx.fillText('कुल:', 15, y);
            const totalText = '₹' + billData.billTotal;
            const totalWidth = tempCtx.measureText(totalText).width;
            tempCtx.fillText(totalText, width - totalWidth - 15, y);
            y += 24;
            
            if (billData.isPurchase && billData.laborCharges > 0) {
                tempCtx.fillText('मजदूरी:', 15, y);
                
                // Show calculation only if auto-calculated, else show just the amount
                if (billData.isAutoLabor) {
                    const totalPackets = billData.totalPackets || 0;
                    const laborText = settings.laborRate + ' × ' + totalPackets + ' = ₹' + billData.laborCharges;
                    const laborWidth = tempCtx.measureText(laborText).width;
                    tempCtx.fillText(laborText, width - laborWidth - 15, y);
                } else {
                    const laborText = '₹' + billData.laborCharges;
                    const laborWidth = tempCtx.measureText(laborText).width;
                    tempCtx.fillText(laborText, width - laborWidth - 15, y);
                }
                
                y += 24;
            }
            
            tempCtx.fillText('पैकेट:', 15, y);
            const packetText = String(billData.totalPackets);
            const packetWidth = tempCtx.measureText(packetText).width;
            tempCtx.fillText(packetText, width - packetWidth - 15, y);
            y += 24;
            
            y = addSpacing(y, 12);
            
            // Grand total
            y = drawCenter('कुल भुगतान: ₹' + billData.amountPayable, y, 24, true);
            
            console.log('[WRITE] Drawing complete, height:', y);
            
            // STEP 2: Copy to final canvas with exact height
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = width;
            finalCanvas.height = y;
            const finalCtx = finalCanvas.getContext('2d');
            
            // Copy only the used portion from temp canvas
            finalCtx.drawImage(tempCanvas, 0, 0, width, y, 0, 0, width, y);
            
            // DEBUG: Show canvas preview
            // const debugPreview = document.getElementById('canvasDebugPreview');
            // if (debugPreview) {
            //     debugPreview.src = finalCanvas.toDataURL('image/png');
            //     debugPreview.style.display = 'block';
            //     debugPreview.style.maxWidth = '100%';
            //     debugPreview.style.border = '2px solid #667eea';
            //     debugPreview.style.margin = '10px auto';
            // }
            
            console.log('[WRITE] Canvas rendered, converting to bitmap...');
            
            // Get image data from FINAL canvas
            const imageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const pixels = imageData.data;
            
            // Convert to 1-bit monochrome bitmap
            const threshold = 128;
            const bytesPerLine = Math.ceil(finalCanvas.width / 8);
            const bitmapData = [];
            
            for (let y = 0; y < finalCanvas.height; y++) {
                const line = new Array(bytesPerLine).fill(0);
                
                for (let x = 0; x < finalCanvas.width; x++) {
                    const pixelIndex = (y * finalCanvas.width + x) * 4;
                    const r = pixels[pixelIndex];
                    const g = pixels[pixelIndex + 1];
                    const b = pixels[pixelIndex + 2];
                    
                    // Convert to grayscale and apply threshold
                    const gray = (r + g + b) / 3;
                    
                    // Black pixels on canvas should print as black
                    // ESC/POS: bit 1 = black dot, bit 0 = white/no print
                    if (gray < threshold) {
                        const byteIndex = Math.floor(x / 8);
                        const bitIndex = 7 - (x % 8);
                        line[byteIndex] |= (1 << bitIndex);
                    }
                }
                
                bitmapData.push(...line);
            }
            
            console.log('[WRITE] Bitmap created:', bitmapData.length, 'bytes for', finalCanvas.height, 'lines');
            
            // Build ESC/POS commands for image printing
            const commands = [];
            
            // Initialize printer
            commands.push(0x1B, 0x40); // ESC @
            
            // Center align
            commands.push(0x1B, 0x61, 0x01); // ESC a 1
            
            // Use GS v 0 command for raster bitmap printing
            // Format: GS v 0 m xL xH yL yH d1...dk
            // m = mode (0 = normal)
            // xL xH = width in bytes (little endian)
            // yL yH = height in dots (little endian)
            
            commands.push(0x1D, 0x76, 0x30, 0x00); // GS v 0 m
            
            // Width in bytes (little endian)
            commands.push(bytesPerLine & 0xFF);
            commands.push((bytesPerLine >> 8) & 0xFF);
            
            // Height in dots (little endian)
            commands.push(finalCanvas.height & 0xFF);
            commands.push((finalCanvas.height >> 8) & 0xFF);
            
            // Add bitmap data
            commands.push(...bitmapData);
            
            // Feed paper and cut
            commands.push(0x1B, 0x64, 0x03); // ESC d 3 - feed 3 lines
            commands.push(0x1D, 0x56, 0x41, 0x03); // GS V A 3 - partial cut
            
            console.log('[WRITE] Sending', commands.length, 'bytes to printer...');
            
            // Convert to Uint8Array for binary transmission
            const commandBytes = new Uint8Array(commands);
            
            return new Promise((resolve, reject) => {
                window.bluetoothSerial.write(
                    commandBytes,
                    () => {
                        console.log('[WRITE] Print successful!');
                        resolve(true);
                    },
                    (error) => {
                        console.error('[WRITE] Print failed:', error);
                        reject(error);
                    }
                );
            });
        } catch (error) {
            console.error('[WRITE] Print failed:', error);
            throw error;
        }
    }
}

const printerManager = new BluetoothPrinterManager();

// ESC/POS Print Commands Generator
function generateESCPOS(billData) {
    try {
        console.log('[DEBUG] generateESCPOS started');
        if (!billData || !billData.items || billData.items.length === 0) {
            throw new Error('Invalid bill data');
        }
        console.log('[DEBUG] Bill data valid, items:', billData.items.length);
        
        let commands = '';
        
        // Initialize printer
        commands += ESC + '@'; // Initialize
        commands += ESC + 'a' + '\x01'; // Center align
    
    // Title - Large and bold
    commands += ESC + '!' + '\x30'; // Double height + double width
    const receiptTitle = billData.duePayment > 0 ? 'RECEIPT\n' : (billData.isPurchase ? 'PURCHASE RECEIPT\n' : 'SALE RECEIPT\n');
    commands += receiptTitle;
    commands += ESC + '!' + '\x00'; // Normal size
    commands += '\n';
    
    // Customer name if provided
    if (billData.customerName) {
        commands += 'Customer: ' + billData.customerName + '\n';
    }
    
    // Date and time
    const now = new Date();
    commands += now.toLocaleString('en-IN') + '\n';
    commands += '--------------------------------\n';
    
    // Left align for items
    commands += ESC + 'a' + '\x00';
    
    // Column headers
    commands += 'वस्तु        दर     मात्रा   कुल\n';
    commands += '--------------------------------\n';
    
    // Items
    billData.items.forEach(item => {
        const name = item.name.substring(0, 12).padEnd(12);
        const rate = ('₹' + item.rate).padEnd(8);
        const qty = (item.qty + 'kg').padEnd(7);
        const total = '₹' + item.total;
        commands += name + rate + qty + total + '\n';
        
        // Show weight breakdown if multiple weights
        if (item.weights && item.weights.length > 1) {
            commands += '  (' + item.weights.join('+') + ')\n';
        }
    });
    
    commands += '--------------------------------\n';
    
    // Totals
    commands += 'कुल:'.padEnd(24) + '₹' + billData.billTotal + '\n';
    
    if (billData.isPurchase && billData.laborCharges > 0) {
        let laborLine = 'मजदूरी:';
        if (billData.isAutoLabor && billData.laborCalc) {
            laborLine += '     ' + billData.laborCalc + ' = ₹' + billData.laborCharges;
        } else {
            laborLine = laborLine.padEnd(16) + '₹' + billData.laborCharges;
        }
        commands += laborLine + '\n';
    }
    
    commands += 'पैकेट:'.padEnd(24) + billData.totalPackets + '\n';
    commands += '\n';
    
    // Grand total - Bold
    commands += ESC + '!' + '\x18'; // Bold + double height
    commands += (billData.isPurchase ? 'कुल भुगतान:' : 'कुल प्राप्त:') + ' ₹' + billData.amountPayable + '\n';
    commands += ESC + '!' + '\x00'; // Normal
    
    commands += '\n';
    
    // Payment details (for purchase)
    if (billData.isPurchase && (billData.onlinePayment > 0 || billData.cashPayment > 0)) {
        commands += '--------------------------------\n';
        if (billData.onlinePayment > 0) {
            commands += 'ऑनलाइन:'.padEnd(24) + '₹' + billData.onlinePayment + '\n';
        }
        if (billData.cashPayment > 0) {
            commands += 'नकद:'.padEnd(24) + '₹' + billData.cashPayment + '\n';
        }
        commands += '\n';
    }
    
        // Center align for footer
        commands += ESC + 'a' + '\x01';
        commands += 'धन्यवाद!\n';
        commands += '\n\n\n';
        
        // Cut paper
        commands += GS + 'V' + '\x41' + '\x03'; // Partial cut
        
        return commands;
    } catch (error) {
        console.error('Generate ESCPOS error:', error);
        throw new Error('Failed to generate print commands: ' + error.message);
    }
}

// Loading state
function showLoading() {
    const loader = document.getElementById('loadingOverlay');
    if (loader) loader.classList.add('active');
}

function hideLoading() {
    const loader = document.getElementById('loadingOverlay');
    if (loader) loader.classList.remove('active');
}

// Toast notification
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function showModal(message, title = 'Alert', showCancel = false) {
    return new Promise((resolve) => {
        modalResolve = resolve;
        
        const modalOverlay = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalCancelBtn = document.getElementById('modalCancelBtn');
        const modalConfirmBtn = document.getElementById('modalConfirmBtn');
        
        modalTitle.textContent = title;
        modalMessage.innerHTML = message.replace(/\n/g, '<br>');
        
        if (showCancel) {
            modalCancelBtn.style.display = 'block';
            modalConfirmBtn.textContent = 'Yes';
        } else {
            modalCancelBtn.style.display = 'none';
            modalConfirmBtn.textContent = 'OK';
        }
        
        modalOverlay.classList.add('active');
    });
}

function closeModal(result) {
    const modalOverlay = document.getElementById('modalOverlay');
    modalOverlay.classList.remove('active');
    
    if (modalResolve) {
        modalResolve(result);
        modalResolve = null;
    }
}

// Save DB (without re-rendering)
async function saveDB() {
    // Save all items to Firestore
    for (const item of items) {
        await saveItemToFirestore(item);
    }
    loadItemsDropdown();
}

// Save DB with full re-render (only when structure changes)
async function saveDBAndRender() {
    // Save all items to Firestore
    for (const item of items) {
        await saveItemToFirestore(item);
    }
    renderItems();
    loadItemsDropdown();
}

// -------------------- SIDE NAVIGATION --------------------
function toggleMenu() {
    const sideNav = document.getElementById("sideNav");
    const overlay = document.getElementById("overlay");
    
    sideNav.classList.toggle("active");
    overlay.classList.toggle("active");
}

function showTabFromNav(tabId, event) {
    // Hide all tabs
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    
    // Show selected tab
    document.getElementById(tabId).classList.add("active");
    
    // Update active nav link
    document.querySelectorAll(".nav-menu a").forEach(a => a.classList.remove("active"));
    if (event) event.target.closest("a").classList.add("active");
    
    // Refresh data for specific tabs with slight delay for canvas rendering
    if (tabId === 'history') renderHistory();
    if (tabId === 'reports') {
        setTimeout(() => renderReports(), 100);
    }
    if (tabId === 'configure') loadSettings();
    if (tabId === 'stock') renderStock();
    if (tabId === 'sales') {
        loadSalesPageDropdown();
        renderSalesBill();
    }
    
    // Close menu
    toggleMenu();
}

// -------------------- HISTORY --------------------
async function saveBillToHistory() {
    if (billItems.length === 0) return;

    const laborCharges = Number(document.getElementById("manualLaborCharges").value) || 0;
    const billTotal = Number(document.getElementById("billTotal").textContent);
    const amountPayable = billTotal - laborCharges;
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const duePayment = Number(document.getElementById("dueAmount").value) || 0;
    const totalPayment = onlinePayment + cashPayment + duePayment;
    const customerName = document.getElementById("customerName").value.trim();
    const billComments = document.getElementById("billComments").value.trim();

    // Update customer options
    if (customerName) {
        updateCustomerOptions(customerName);
    }

    const bill = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        customerName: customerName,
        customerPhone: customerPhoneNumber,
        comments: billComments,
        items: [...billItems], // Full item details with weights
        laborCharges: laborCharges,
        billTotal: billTotal,
        total: amountPayable,
        payment: {
            online: onlinePayment,
            cash: cashPayment,
            due: duePayment,
            total: totalPayment
        },
        type: 'purchase'
    };

    await saveBillToFirestore(bill);
    billHistory.unshift(bill);
    await calculateStockFromBills();
    
    // Update finance overview if on Finance tab
    if (document.getElementById('financeOverview') && document.getElementById('financeOverview').style.display !== 'none') {
        calculateFinanceOverview();
    }
    
    // Clear current bill - set payment fields to empty
    billItems = [];
    document.getElementById("manualLaborCharges").value = 0;
    document.getElementById("onlinePayment").value = "";
    document.getElementById("cashPayment").value = "";
    document.getElementById("dueAmount").value = "";
    document.getElementById("onlineCheckbox").checked = false;
    document.getElementById("cashCheckbox").checked = false;
    document.getElementById("dueCheckbox").checked = false;
    document.getElementById("totalPayment").textContent = 0;
    
    const totalPacketsElement = document.getElementById("totalPacketsInBill");
    if (totalPacketsElement) {
        totalPacketsElement.textContent = 0;
    }

    const laborCalcElement = document.getElementById("laborCalculation");
    if (laborCalcElement) {
        laborCalcElement.textContent = `${settings.laborRate} × 0`;
    }
    
    renderBill();
    updateTotals();
    renderDue();
    
    // Clear customer fields
    document.getElementById("customerName").value = "";
    customerPhoneNumber = '';
    document.getElementById("billComments").value = "";
    
    // Clear draft after successful save
    clearBillDraft();
    
    // Reset item dropdown to most frequent
    loadItemsDropdown();
}

function updateCustomerOptions(newCustomer) {
    // Get unique customer names from history
    const uniqueCustomers = [...new Set(
        billHistory
            .filter(b => b.customerName)
            .map(b => b.customerName)
    )];
    
    // Add new customer if not exists
    if (newCustomer && !uniqueCustomers.includes(newCustomer)) {
        uniqueCustomers.unshift(newCustomer);
    }
    
    // Update datalist
    const datalist = document.getElementById('customerOptions');
    if (datalist) {
        datalist.innerHTML = uniqueCustomers.map(name => `<option value="${name}">`).join('');
    }
}

function updateWholesaleCustomerOptions(newCustomer) {
    // Get unique customer names from wholesale sales history
    const uniqueCustomers = [...new Set(
        salesHistory
            .filter(s => s.source === 'sales-tab' && s.customerName)
            .map(s => s.customerName)
    )];
    
    // Add new customer if not exists
    if (newCustomer && !uniqueCustomers.includes(newCustomer)) {
        uniqueCustomers.unshift(newCustomer);
    }
    
    // Update datalist
    const datalist = document.getElementById('wholesaleCustomerOptions');
    if (datalist) {
        datalist.innerHTML = uniqueCustomers.map(name => `<option value="${name}">`).join('');
    }
}

function updateSalePaymentTotal() {
    const onlinePayment = Number(document.getElementById("saleOnlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("saleCashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;
    
    const totalPaymentElement = document.getElementById("saleTotalPayment");
    totalPaymentElement.textContent = totalPayment;
    
    // Get amount payable
    const amountPayable = Number(document.getElementById("salesTotalAmount").textContent) || 0;
    
    // Check if payment exceeds amount payable
    const paymentTotalRow = document.querySelector('#sales .payment-total');
    if (paymentTotalRow) {
        if (totalPayment > amountPayable && amountPayable > 0) {
            paymentTotalRow.classList.add('payment-excess');
        } else {
            paymentTotalRow.classList.remove('payment-excess');
        }
    }
}

function fillSalePayableAmount(type) {
    const onlineCheckbox = document.getElementById('saleOnlineCheckbox');
    const cashCheckbox = document.getElementById('saleCashCheckbox');
    const dueCheckbox = document.getElementById('saleDueCheckbox');
    const onlinePayment = document.getElementById('saleOnlinePayment');
    const cashPayment = document.getElementById('saleCashPayment');
    const dueAmount = document.getElementById('saleDueAmount');
    const amountPayable = Number(document.getElementById('salesTotalAmount').textContent) || 0;

    if (type === 'online') {
        if (onlineCheckbox.checked) {
            cashCheckbox.checked = false;
            dueCheckbox.checked = false;
            onlinePayment.value = amountPayable;
            cashPayment.value = '';
            dueAmount.value = '';
        } else {
            onlinePayment.value = '';
        }
    } else if (type === 'cash') {
        if (cashCheckbox.checked) {
            onlineCheckbox.checked = false;
            dueCheckbox.checked = false;
            cashPayment.value = amountPayable;
            onlinePayment.value = '';
            dueAmount.value = '';
        } else {
            cashPayment.value = '';
        }
    } else if (type === 'due') {
        if (dueCheckbox.checked) {
            onlineCheckbox.checked = false;
            cashCheckbox.checked = false;
            dueAmount.value = amountPayable;
            onlinePayment.value = '';
            cashPayment.value = '';
        } else {
            dueAmount.value = '';
        }
    }

    updateSalePaymentTotal();
}

function filterSalesTab(view, evt) {
    // Update button states
    const buttons = document.querySelectorAll('#sales .filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (evt) evt.target.classList.add('active');
    
    // Show/hide sections
    const entrySection = document.getElementById('salesEntrySection');
    const outstandingSection = document.getElementById('salesOutstandingSection');
    
    if (view === 'sales') {
        entrySection.style.display = 'block';
        outstandingSection.style.display = 'none';
    } else {
        entrySection.style.display = 'none';
        outstandingSection.style.display = 'block';
        renderSalesOutstanding();
    }
}

async function recordPayment(saleId) {
    const sale = salesHistory.find(s => s.id == saleId);
    if (!sale) {
        showToast('Error: Sale not found');
        return;
    }
    
    const paymentInput = document.getElementById(`payment_${saleId}`);
    const paymentAmount = Number(paymentInput.value) || 0;
    
    if (paymentAmount <= 0) {
        showToast('Please enter a valid payment amount');
        return;
    }
    
    const currentReceived = (sale.payment.online || 0) + (sale.payment.cash || 0);
    const outstanding = sale.payment.due || 0;
    
    if (paymentAmount > outstanding) {
        showToast('Payment amount exceeds outstanding amount');
        return;
    }
    
    // Initialize payments array if it doesn't exist
    if (!sale.payments) {
        sale.payments = [];
    }
    
    // Record the payment
    const payment = {
        amount: paymentAmount,
        date: new Date().toLocaleString(),
        recordedBy: currentUser ? currentUser.name : 'Unknown'
    };
    
    sale.payments.push(payment);
    
    // Update payment totals
    sale.payment.cash = (sale.payment.cash || 0) + paymentAmount;
    sale.payment.total = (sale.payment.online || 0) + sale.payment.cash;
    sale.payment.due = sale.total - sale.payment.total;
    
    // Update in Firestore
    try {
        await db.collection('sales').doc(String(saleId)).update({
            payments: sale.payments,
            payment: sale.payment
        });
        
        paymentInput.value = '';
        renderSalesOutstanding();
        renderSalesHistory();
        renderDue();
        showToast(`✓ Payment of ₹${paymentAmount} recorded`);
    } catch (error) {
        console.error('Error recording payment:', error);
        showToast('Error: ' + error.message);
    }
}

async function markSaleAsCleared(saleId) {
    const sale = salesHistory.find(s => s.id == saleId);
    if (!sale) {
        console.error('Sale not found:', saleId);
        showToast('Error: Sale not found');
        return;
    }
    
    sale.cleared = true;
    
    // Update in Firestore
    try {
        await db.collection('sales').doc(String(saleId)).update({ cleared: true });
        
        renderSalesOutstanding();
        renderDue();
        showToast('✓ Sale marked as cleared');
    } catch (error) {
        console.error('Error updating sale:', error, 'Sale ID:', saleId);
        showToast('Error: ' + error.message);
    }
}

function renderSalesOutstanding() {
    const container = document.getElementById("salesOutstandingList");
    
    // Filter wholesale sales with outstanding amounts and not cleared
    const outstandingSales = salesHistory
        .filter(sale => {
            if (sale.source !== 'sales-tab') return false;
            if (sale.cleared) return false;
            
            const totalReceivable = sale.total || 0;
            const onlineReceived = sale.payment ? (sale.payment.online || 0) : 0;
            const cashReceived = sale.payment ? (sale.payment.cash || 0) : 0;
            const totalReceived = onlineReceived + cashReceived;
            const outstanding = sale.payment?.due || (totalReceivable - totalReceived);
            
            return outstanding > 0;
        })
        .map(sale => {
            const totalReceivable = sale.total || 0;
            const onlineReceived = sale.payment ? (sale.payment.online || 0) : 0;
            const cashReceived = sale.payment ? (sale.payment.cash || 0) : 0;
            const totalReceived = onlineReceived + cashReceived;
            const outstanding = sale.payment?.due || (totalReceivable - totalReceived);
            
            return {
                ...sale,
                outstanding: outstanding,
                totalAmount: totalReceivable,
                paidAmount: totalReceived
            };
        });
    
    if (outstandingSales.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No outstanding payments</p>';
        return;
    }

    // Group by customer and calculate totals
    const customerOutstanding = {};
    outstandingSales.forEach(sale => {
        const customer = sale.customerName || 'Unknown';
        if (!customerOutstanding[customer]) {
            customerOutstanding[customer] = {
                name: customer,
                totalOutstanding: 0,
                billCount: 0,
                sales: []
            };
        }
        customerOutstanding[customer].totalOutstanding += sale.outstanding;
        customerOutstanding[customer].billCount++;
        customerOutstanding[customer].sales.push(sale);
    });

    // Sort customers by outstanding amount
    const sortedCustomers = Object.values(customerOutstanding).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    container.innerHTML = "";

    // Create summary table
    const summaryTable = document.createElement('div');
    summaryTable.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Customer</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600;">Bills</th>
                    <th style="padding: 12px; text-align: right; font-weight: 600;">Outstanding</th>
                </tr>
            </thead>
            <tbody>
                ${sortedCustomers.map(customer => `
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 12px;"><strong>${customer.name}</strong></td>
                        <td style="padding: 12px; text-align: center;">${customer.billCount}</td>
                        <td style="padding: 12px; text-align: right; color: #28a745; font-weight: 600;">₹${customer.totalOutstanding.toFixed(2)}</td>
                    </tr>
                `).join('')}
                <tr style="background: #e9ecef; font-weight: 700;">
                    <td style="padding: 12px;">Total</td>
                    <td style="padding: 12px; text-align: center;">${outstandingSales.length}</td>
                    <td style="padding: 12px; text-align: right; color: #28a745;">₹${sortedCustomers.reduce((sum, c) => sum + c.totalOutstanding, 0).toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    `;
    container.appendChild(summaryTable);

    // Add detailed bills section
    const detailsHeader = document.createElement('h4');
    detailsHeader.textContent = 'Bill-wise Details';
    detailsHeader.style.marginBottom = '12px';
    container.appendChild(detailsHeader);

    // Render detailed bills grouped by customer
    sortedCustomers.forEach(customer => {
        const customerSection = document.createElement('div');
        customerSection.style.marginBottom = '30px';
        
        const customerHeader = document.createElement('h5');
        customerHeader.innerHTML = `${customer.name} <span style="color: #28a745;">(₹${customer.totalOutstanding.toFixed(2)})</span>`;
        customerHeader.style.marginBottom = '10px';
        customerHeader.style.padding = '8px 12px';
        customerHeader.style.background = '#e9ecef';
        customerHeader.style.borderRadius = '4px';
        customerSection.appendChild(customerHeader);

        customer.sales.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sale => {
        const div = document.createElement("div");
        div.className = "history-item";
        
        div.innerHTML = `
            <div class="history-header">
                <span>Sale #${sale.id}${sale.customerName ? ` • <strong>${sale.customerName}</strong>` : ''}</span>
                <span style="color: #28a745; font-weight: 700;">Due: ₹${sale.outstanding.toFixed(2)}</span>
            </div>
            <div class="history-date">${sale.date}${sale.createdByName ? ` • By: <strong>${sale.createdByName}</strong>` : ''}</div>
            <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 12px; margin: 12px 0; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>Total Receivable:</span>
                    <strong>₹${sale.totalAmount.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>Received:</span>
                    <strong>₹${sale.paidAmount.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 2px solid #17a2b8; padding-top: 6px; margin-top: 6px;">
                    <span style="font-weight: 600;">Outstanding:</span>
                    <strong style="color: #28a745; font-size: 16px;">₹${sale.outstanding.toFixed(2)}</strong>
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #17a2b8;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <label style="font-weight: 500;">Payment (₹):</label>
                        <input type="number" inputmode="decimal" id="payment_${sale.id}" placeholder="Enter amount" style="flex: 1; padding: 6px; border: 1px solid #17a2b8; border-radius: 4px;" />
                        <button onclick="window.recordPayment('${sale.id}')" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Record</button>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <input type="checkbox" id="clear_${sale.id}" onchange="window.markSaleAsCleared('${sale.id}')" style="margin-right: 8px; transform: scale(1.2);" />
                        <label for="clear_${sale.id}" style="cursor: pointer; font-weight: 500;">Mark as Cleared</label>
                    </div>
                </div>
            </div>
        `;
        
        customerSection.appendChild(div);
        });
        
        container.appendChild(customerSection);
    });
}

function renderHistory() {
    const container = document.getElementById("historyList");
    
    // Show only purchase history in History tab
    if (billHistory.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No purchase history yet</p>';
        return;
    }

    container.innerHTML = "";

    billHistory.forEach(bill => {
        const div = document.createElement("div");
        div.className = "history-item";
        
        // Calculate total packets from items
        const totalPackets = bill.items.reduce((sum, item) => sum + (item.packets || 0), 0);
        const totalWeight = bill.items.reduce((sum, item) => sum + (item.qty || 0), 0);
        
        // Build items detail HTML
        const itemsDetailHTML = bill.items.map(item => {
            const weightsDisplay = item.weights ? item.weights.map(w => `${w}kg`).join(', ') : '';
            return `
                <div class="history-item-detail">
                    <strong>${item.name}</strong> - Rate: ₹${item.rate}<br>
                    <small>${item.packets} packets: ${weightsDisplay} = ${item.qty}kg → ₹${item.total}</small>
                </div>
            `;
        }).join("");
        
        // Payment details
        const paymentParts = [];
        if (bill.payment) {
            if (bill.payment.online > 0) paymentParts.push(`Online: ₹${bill.payment.online}`);
            if (bill.payment.cash > 0) paymentParts.push(`Cash: ₹${bill.payment.cash}`);
            if (bill.payment.due > 0) paymentParts.push(`Due: ₹${bill.payment.due}`);
        }
        const paymentHTML = paymentParts.length > 0 ? `
            <div class="history-payment">
                ${paymentParts.join(' | ')}
            </div>
        ` : '';
        
        const billIndex = billHistory.indexOf(bill);
        
        div.innerHTML = `
            <div class="history-header">
                <span style="cursor: pointer; color: #007bff; text-decoration: underline;" onclick="reprintBill(${billIndex})">Bill #${bill.id}</span>${bill.customerName ? ` • <strong>${bill.customerName}</strong>` : ''}
                <span style="color: #007bff; font-weight: 700;">₹ ${bill.total}</span>
            </div>
            <div class="history-date">${bill.date}${bill.createdByName ? ` • By: <strong>${bill.createdByName}</strong>` : ''}</div>
            <div class="history-summary">
                ${bill.items.map(item => item.name).join(', ')} • ${totalPackets} packets • ${totalWeight}kg
            </div>
            ${paymentHTML}
        `;
        
        container.appendChild(div);
    });
}

// -------------------- OUTSTANDING --------------------
let currentDueFilter = 'purchase';

function filterDue(filter, evt) {
    currentDueFilter = filter;
    
    // Update button states
    document.querySelectorAll('#due .filter-btn').forEach(btn => btn.classList.remove('active'));
    if (evt) evt.target.classList.add('active');
    
    renderDue();
}

function renderDue() {
    const container = document.getElementById("dueList");
    
    // Collect transactions based on filter
    const dueTransactions = [];
    
    if (currentDueFilter === 'purchase') {
        billHistory.forEach(bill => {
            const totalPayable = bill.total || 0;
            const onlinePaid = bill.payment ? (bill.payment.online || 0) : 0;
            const cashPaid = bill.payment ? (bill.payment.cash || 0) : 0;
            const totalPaid = onlinePaid + cashPaid;
            const outstanding = bill.payment?.due || (totalPayable - totalPaid);
            
            if (outstanding > 0 && !bill.cleared) {
                dueTransactions.push({
                    ...bill,
                    transactionType: 'purchase',
                    outstanding: outstanding,
                    totalAmount: totalPayable,
                    paidAmount: totalPaid
                });
            }
        });
    } else if (currentDueFilter === 'sale') {
        salesHistory.forEach(sale => {
            const totalReceivable = sale.total || 0;
            const onlineReceived = sale.payment ? (sale.payment.online || 0) : 0;
            const cashReceived = sale.payment ? (sale.payment.cash || 0) : 0;
            const totalReceived = onlineReceived + cashReceived;
            const outstanding = sale.payment?.due || (totalReceivable - totalReceived);
            
            if (outstanding > 0 && !sale.cleared) {
                dueTransactions.push({
                    ...sale,
                    transactionType: 'sale',
                    outstanding: outstanding,
                    totalAmount: totalReceivable,
                    paidAmount: totalReceived
                });
            }
        });
    }
    
    // Sort by outstanding amount (highest first)
    dueTransactions.sort((a, b) => b.outstanding - a.outstanding);
    
    if (dueTransactions.length === 0) {
        const message = currentDueFilter === 'purchase' ? 'No outstanding purchase amounts' : 'No outstanding sale amounts';
        container.innerHTML = `<p style="text-align: center; color: #888; margin-top: 40px;">${message}</p>`;
        return;
    }

    container.innerHTML = "";
    
    const isPurchase = currentDueFilter === 'purchase';
    const headerColor = isPurchase ? '#dc3545' : '#28a745';
    const bgColor = isPurchase ? '#fff3cd' : '#d1ecf1';
    const borderColor = isPurchase ? '#ffc107' : '#17a2b8';
    const totalLabel = isPurchase ? 'Total Payable' : 'Total Receivable';
    const paidLabel = isPurchase ? 'Paid' : 'Received';
    const billLabel = isPurchase ? 'Bill' : 'Sale';

    dueTransactions.forEach(transaction => {
        const div = document.createElement("div");
        div.className = "history-item";
        
        div.innerHTML = `
            <div class="history-header">
                <span style="cursor: pointer; color: #007bff; text-decoration: underline;" onclick="showOutstandingDetails('${transaction.id}', '${transaction.transactionType}')">${billLabel} #${transaction.id}</span>${transaction.customerName ? ` • <strong>${transaction.customerName}</strong>` : ''}
                <span style="color: ${headerColor}; font-weight: 700;">Due: ₹${transaction.outstanding.toFixed(2)}</span>
            </div>
            <div class="history-date">${transaction.date}${transaction.createdByName ? ` • By: <strong>${transaction.createdByName}</strong>` : ''}</div>
            <div style="background: ${bgColor}; border-left: 4px solid ${borderColor}; padding: 12px; margin: 12px 0; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>${totalLabel}:</span>
                    <strong>₹${transaction.totalAmount.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>${paidLabel}:</span>
                    <strong>₹${transaction.paidAmount.toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 2px solid ${borderColor}; padding-top: 6px; margin-top: 6px;">
                    <span style="font-weight: 600;">Outstanding:</span>
                    <strong style="color: ${headerColor}; font-size: 16px;">₹${transaction.outstanding.toFixed(2)}</strong>
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" ${transaction.cleared ? 'checked' : ''} onchange="markOutstandingAsCleared('${transaction.id}', '${transaction.transactionType}')" style="margin-right: 8px;" />
                        <span style="font-size: 13px; color: #666;">Mark as Cleared</span>
                    </label>
                </div>
            </div>
        `;
        
        container.appendChild(div);
    });
}

// -------------------- STOCK MANAGEMENT --------------------
function updateStock(itemName, quantity, rate) {
    if (!stock[itemName]) {
        stock[itemName] = {
            quantity: 0,
            avgRate: 0,
            totalValue: 0
        };
    }
    
    // Calculate new average rate using weighted average
    const oldValue = stock[itemName].quantity * stock[itemName].avgRate;
    const newValue = quantity * rate;
    stock[itemName].quantity += quantity;
    
    if (stock[itemName].quantity > 0) {
        stock[itemName].avgRate = (oldValue + newValue) / stock[itemName].quantity;
    }
    
    // Stock is now calculated from bills, no need to save separately
}

function reduceStock(itemName, quantity) {
    if (!stock[itemName]) {
        return false;
    }
    
    if (stock[itemName].quantity < quantity) {
        return false;
    }
    
    stock[itemName].quantity -= quantity;
    // Stock is now calculated from bills, no need to save separately
    return true;
}

function renderStock() {
    // Populate adjustment item dropdown
    const adjustSelect = document.getElementById("adjustItem");
    if (adjustSelect) {
        adjustSelect.innerHTML = '<option value="">Select item</option>';
        Object.keys(stock).forEach(itemName => {
            const opt = document.createElement("option");
            opt.value = itemName;
            opt.textContent = itemName;
            adjustSelect.appendChild(opt);
        });
    }
    
    // Render stock list
    const container = document.getElementById("stockList");
    
    const stockItems = Object.keys(stock);
    
    if (stockItems.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No stock data available. Start purchasing items to build stock.</p>';
    } else {
        container.innerHTML = "";
        
        stockItems.forEach(itemName => {
            const item = stock[itemName];
            const div = document.createElement("div");
            
            let stockClass = "stock-item";
            if (item.quantity === 0) stockClass += " stock-out";
            else if (item.quantity < 100) stockClass += " stock-low";
            
            div.className = stockClass;
            
            const stockValue = item.quantity * item.avgRate;
            
            div.innerHTML = `
                <div class="stock-header">
                    <span>${itemName}</span>
                    <span style="color: ${item.quantity > 0 ? '#28a745' : '#dc3545'};">${item.quantity.toFixed(2)} kg</span>
                </div>
                <div class="stock-details">
                    <div><strong>Average Purchase Rate:</strong> ₹${item.avgRate.toFixed(2)}/kg</div>
                    <div><strong>Stock Value:</strong> ₹${stockValue.toFixed(2)}</div>
                    ${item.quantity < 100 && item.quantity > 0 ? '<div style="color: #ffc107; font-weight: 600; margin-top: 8px;">⚠️ Low Stock</div>' : ''}
                    ${item.quantity === 0 ? '<div style="color: #dc3545; font-weight: 600; margin-top: 8px;">❌ Out of Stock</div>' : ''}
                </div>
            `;
            
            container.appendChild(div);
        });
    }
    
    // Render adjustment history
    renderAdjustmentHistory();
}

// -------------------- STOCK ADJUSTMENTS --------------------
function loadAdjustItemStock() {
    const itemName = document.getElementById("adjustItem").value;
    const displaySpan = document.getElementById("currentStockDisplay");
    
    if (!itemName) {
        displaySpan.textContent = "-";
        return;
    }
    
    const currentStock = stock[itemName] ? stock[itemName].quantity : 0;
    displaySpan.textContent = currentStock.toFixed(2);
}

function updateAdjustmentPlaceholder() {
    const adjustType = document.getElementById("adjustType").value;
    const quantityInput = document.getElementById("adjustQuantity");
    
    if (adjustType === 'add') {
        quantityInput.placeholder = "Enter quantity to add";
    } else if (adjustType === 'remove') {
        quantityInput.placeholder = "Enter quantity to remove";
    } else {
        quantityInput.placeholder = "Enter new total quantity";
    }
}

async function applyStockAdjustment() {
    const itemName = document.getElementById("adjustItem").value;
    const adjustType = document.getElementById("adjustType").value;
    const quantity = parseFloat(document.getElementById("adjustQuantity").value);
    const reason = document.getElementById("adjustReason").value.trim();
    
    if (!itemName) {
        showAlert("Please select an item");
        return;
    }
    
    if (!quantity || quantity <= 0) {
        showAlert("Please enter a valid quantity");
        return;
    }
    
    if (!stock[itemName]) {
        stock[itemName] = { quantity: 0, avgRate: 0 };
    }
    
    const oldQuantity = stock[itemName].quantity;
    let newQuantity = oldQuantity;
    
    if (adjustType === 'add') {
        newQuantity = oldQuantity + quantity;
    } else if (adjustType === 'remove') {
        newQuantity = Math.max(0, oldQuantity - quantity);
    } else if (adjustType === 'set') {
        newQuantity = quantity;
    }

    // Log the adjustment
    const adjustment = {
        id: Date.now(),
        date: new Date().toISOString(),
        itemName: itemName,
        type: adjustType,
        oldQuantity: oldQuantity,
        newQuantity: newQuantity,
        change: newQuantity - oldQuantity,
        reason: reason || "No reason provided"
    };
    
    await saveStockAdjustmentToFirestore(adjustment);
    stockAdjustments.unshift(adjustment);
    
    // Recalculate stock from bills
    await calculateStockFromBills();
    
    // Clear form
    document.getElementById("adjustQuantity").value = "";
    document.getElementById("adjustReason").value = "";
    
    // Refresh displays
    loadAdjustItemStock();
    renderStock();
    
    hapticFeedback('medium');
    showAlert(`Stock adjusted successfully!\n${itemName}: ${oldQuantity.toFixed(2)} kg → ${newQuantity.toFixed(2)} kg`);
}

function renderAdjustmentHistory() {
    const container = document.getElementById("adjustmentHistory");
    
    if (stockAdjustments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 20px;">No adjustments yet</p>';
        return;
    }
    
    container.innerHTML = "";
    
    // Show last 20 adjustments
    const recentAdjustments = stockAdjustments.slice(0, 20);
    
    recentAdjustments.forEach(adj => {
        const div = document.createElement("div");
        div.className = "stock-item";
        
        const date = new Date(adj.date);
        const dateStr = date.toLocaleDateString('en-IN') + ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        
        let typeIcon = '';
        let typeColor = '';
        if (adj.type === 'add') {
            typeIcon = '➕';
            typeColor = '#28a745';
        } else if (adj.type === 'remove') {
            typeIcon = '➖';
            typeColor = '#dc3545';
        } else {
            typeIcon = '=';
            typeColor = '#007bff';
        }
        
        div.innerHTML = `
            <div class="stock-header">
                <span>${adj.itemName}</span>
                <span style="color: ${typeColor};">${typeIcon} ${adj.change >= 0 ? '+' : ''}${adj.change.toFixed(2)} kg</span>
            </div>
            <div class="stock-details">
                <div><strong>Date:</strong> ${dateStr}</div>
                <div><strong>Change:</strong> ${adj.oldQuantity.toFixed(2)} kg → ${adj.newQuantity.toFixed(2)} kg</div>
                <div><strong>Reason:</strong> ${adj.reason}</div>
            </div>
        `;
        
        container.appendChild(div);
    });
}

// -------------------- SALES MANAGEMENT --------------------
function loadSellItemDropdown() {
    const select = document.getElementById("billItem");
    if (!select) return;
    
    select.innerHTML = '<option value="">Select item</option>';

    // Load items that have stock
    Object.keys(stock).forEach(itemName => {
        if (stock[itemName].quantity > 0) {
            const opt = document.createElement("option");
            opt.value = itemName;
            opt.textContent = itemName;
            select.appendChild(opt);
        }
    });
    
    clearWeights();
}

function loadSalesPageDropdown() {
    const select = document.getElementById("sellItem");
    if (!select) return;
    
    select.innerHTML = '<option value="">Select item</option>';

    // Load all items
    items.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.name;
        const displayName = (settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        opt.textContent = displayName;
        select.appendChild(opt);
    });
}

function loadSellItemDetails() {
    const itemName = document.getElementById("sellItem").value;
    const availableStockEl = document.getElementById("availableStock");
    const avgRateEl = document.getElementById("avgPurchaseRate");
    const sellRateEl = document.getElementById("sellRate");
    
    if (!itemName || !stock[itemName]) {
        availableStockEl.textContent = "-";
        avgRateEl.textContent = "-";
        sellRateEl.value = "";
        return;
    }
    
    availableStockEl.textContent = stock[itemName].quantity.toFixed(2);
    avgRateEl.textContent = stock[itemName].avgRate.toFixed(2);
    
    // Check if item has predefined sale rates
    const itemData = items.find(item => item.name === itemName);
    if (itemData && itemData.saleRates && itemData.saleRates.length > 0) {
        // Use first sale rate as default
        const firstValidRate = itemData.saleRates.find(rate => rate && rate > 0);
        sellRateEl.value = firstValidRate || "";
    } else {
        // Don't suggest any rate if no sale rates are defined
        sellRateEl.value = "";
    }
}

async function addToSalesBill() {
    const itemName = document.getElementById("sellItem").value;
    const quantity = Number(document.getElementById("sellQuantity").value);
    const rate = Number(document.getElementById("sellRate").value);
    
    if (!itemName) {
        await showModal("Please select an item");
        return;
    }
    
    if (!quantity || quantity <= 0) {
        await showModal("Please enter valid quantity");
        return;
    }
    
    if (!rate || rate <= 0) {
        await showModal("Please enter valid selling rate");
        return;
    }
    
    if (!stock[itemName] || stock[itemName].quantity < quantity) {
        await showModal(`Insufficient stock! Only ${stock[itemName]?.quantity.toFixed(2) || 0} kg available`);
        return;
    }
    
    salesItems.push({
        name: itemName,
        quantity: quantity,
        rate: rate,
        total: Math.round(quantity * rate),
        costRate: stock[itemName].avgRate,
        profit: Math.round((rate - stock[itemName].avgRate) * quantity)
    });
    
    renderSalesBill();
    
    // Clear inputs
    document.getElementById("sellItem").value = "";
    document.getElementById("sellQuantity").value = "";
    document.getElementById("sellRate").value = "";
    document.getElementById("availableStock").textContent = "-";
    document.getElementById("avgPurchaseRate").textContent = "-";
}

function renderSalesBill() {
    const tbody = document.querySelector("#salesTable tbody");
    tbody.innerHTML = "";
    
    let total = 0;
    
    salesItems.forEach((item, i) => {
        total += item.total;
        
        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.name}</td>
            <td>₹${item.rate}</td>
            <td>${item.quantity} kg</td>
            <td>₹${item.total}</td>
            <td><button class="remove-bill-item" onclick="removeSalesItem(${i})">×</button></td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById("salesTotalAmount").textContent = total;
}

function removeSalesItem(index) {
    salesItems.splice(index, 1);
    renderSalesBill();
}

async function completeSale() {
    if (salesItems.length === 0) {
        await showModal("No items in sale");
        return;
    }
    
    const customerName = document.getElementById("wholesaleCustomerName").value.trim();
    const saleTotal = Number(document.getElementById("salesTotalAmount").textContent);
    
    // Update customer options if name provided
    if (customerName) {
        updateWholesaleCustomerOptions(customerName);
    }
    
    // Reduce stock for each item
    const saleRecord = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        customerName: customerName,
        items: [...salesItems],
        total: saleTotal,
        payment: {
            online: 0,
            cash: 0,
            due: saleTotal,
            total: saleTotal
        },
        source: 'sales-tab',
        createdByName: currentUser ? currentUser.name : 'Unknown',
        cleared: false
    };
    
    let stockUpdateFailed = false;
    
    salesItems.forEach(item => {
        if (!reduceStock(item.name, item.quantity)) {
            stockUpdateFailed = true;
        }
    });
    
    if (stockUpdateFailed) {
        await showModal("Error: Some items couldn't be reduced from stock. Please check stock levels.");
        return;
    }
    
    // Save to sales history
    const savedSale = await saveSaleToFirestore(saleRecord);
    salesHistory.unshift(savedSale);
    await calculateStockFromBills();
    
    // Clear sales bill
    salesItems = [];
    document.getElementById("wholesaleCustomerName").value = "";
    
    renderSalesBill();
    renderSalesHistory();
    renderSalesOutstanding();
    renderDue();
    renderStock();
    loadSellItemDropdown();
    
    await showModal(`Sale completed! Total: ₹${saleRecord.total}`, "Success");
}

function renderSalesHistory() {
    const container = document.getElementById("salesHistoryList");
    
    // Filter to only show sales from Sales tab
    const salesTabHistory = salesHistory.filter(sale => sale.source === 'sales-tab');
    
    if (salesTabHistory.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No sales yet</p>';
        return;
    }

    container.innerHTML = "";

    salesTabHistory.forEach(sale => {
        const div = document.createElement("div");
        div.className = "history-item";
        
        // Calculate total weight
        const totalWeight = sale.items.reduce((sum, item) => sum + (item.qty || item.quantity || 0), 0);
        
        // Payment details (if available)
        const paymentParts = [];
        if (sale.payment) {
            if (sale.payment.online > 0) paymentParts.push(`Online: ₹${sale.payment.online}`);
            if (sale.payment.cash > 0) paymentParts.push(`Cash: ₹${sale.payment.cash}`);
            if (sale.payment.due > 0) paymentParts.push(`Due: ₹${sale.payment.due}`);
        }
        const paymentHTML = paymentParts.length > 0 ? `
            <div class="history-payment">
                ${paymentParts.join(' | ')}
            </div>
        ` : '';
        
        const saleIndex = salesHistory.indexOf(sale);
        
        div.innerHTML = `
            <div class="history-header">
                <span style="cursor: pointer; color: #007bff; text-decoration: underline;" onclick="reprintSale(${saleIndex})">Sale #${sale.id}</span>${sale.customerName ? ` • <strong>${sale.customerName}</strong>` : ''}
                <span style="color: #28a745; font-weight: 700;">₹ ${sale.total}</span>
            </div>
            <div class="history-date">${sale.date}${sale.createdByName ? ` • By: <strong>${sale.createdByName}</strong>` : ''}</div>
            <div class="history-summary">
                ${sale.items.map(item => item.name).join(', ')} • ${totalWeight.toFixed(2)}kg
            </div>
            ${paymentHTML}
        `;
        
        container.appendChild(div);
    });
}

// -------------------- DATE FILTERING --------------------
function setDateFilter(filter, evt) {
    currentDateFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (evt) evt.target.classList.add('active');
    
    // Show/hide custom date range
    const customRange = document.getElementById('customDateRange');
    if (filter === 'custom') {
        customRange.style.display = 'block';
    } else {
        customRange.style.display = 'none';
        renderReports();
    }
}

function applyCustomDateFilter() {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    
    if (from && to) {
        customDateRange.from = new Date(from);
        customDateRange.to = new Date(to);
        customDateRange.to.setHours(23, 59, 59, 999);
        renderReports();
    }
}

function filterBillsByDate(bills) {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    
    return bills.filter(bill => {
        const billDate = new Date(bill.date);
        
        // Staff can only view last 7 days
        if (userRole === 'staff' && billDate < weekAgo) {
            return false;
        }
        
        switch(currentDateFilter) {
            case 'today':
                return billDate.toDateString() === now.toDateString();
            
            case 'week':
                return billDate >= weekAgo;
            
            case 'month':
                return billDate.getMonth() === now.getMonth() && 
                       billDate.getFullYear() === now.getFullYear();
            
            case 'custom':
                if (customDateRange.from && customDateRange.to) {
                    return billDate >= customDateRange.from && billDate <= customDateRange.to;
                }
                return true;
            
            default:
                return true;
        }
    });
}

// -------------------- REPORTS --------------------
function populateReportFilters() {
    // Populate item filter
    const itemFilter = document.getElementById("reportItemFilter");
    if (itemFilter) {
        itemFilter.innerHTML = '<option value="all">All Items</option>';
        const uniqueItems = [...new Set(billHistory.flatMap(bill => bill.items.map(item => item.name)))];
        uniqueItems.forEach(itemName => {
            const opt = document.createElement("option");
            opt.value = itemName;
            opt.textContent = itemName;
            itemFilter.appendChild(opt);
        });
    }
    
    // Populate customer filter
    const customerFilter = document.getElementById("reportCustomerFilter");
    if (customerFilter) {
        customerFilter.innerHTML = '<option value="all">All Customers</option>';
        const uniqueCustomers = [...new Set(billHistory.map(bill => bill.customerName).filter(c => c))];
        uniqueCustomers.forEach(customerName => {
            const opt = document.createElement("option");
            opt.value = customerName;
            opt.textContent = customerName;
            customerFilter.appendChild(opt);
        });
    }
}

function applyReportFilters() {
    reportFilters.transaction = document.getElementById("reportTransactionFilter").value;
    reportFilters.item = document.getElementById("reportItemFilter").value;
    reportFilters.customer = document.getElementById("reportCustomerFilter").value;
    renderReports();
}

function filterBillsByReportFilters(bills) {
    return bills.filter(bill => {
        // Transaction type filter
        if (reportFilters.transaction !== 'all' && bill.type !== reportFilters.transaction) {
            return false;
        }
        
        // Item filter
        if (reportFilters.item !== 'all') {
            const hasItem = bill.items.some(item => item.name === reportFilters.item);
            if (!hasItem) return false;
        }
        
        // Customer filter
        if (reportFilters.customer !== 'all' && bill.customerName !== reportFilters.customer) {
            return false;
        }
        
        return true;
    });
}

function renderReports() {
    populateReportFilters();
    
    let filteredBills = filterBillsByDate(billHistory);
    filteredBills = filterBillsByReportFilters(filteredBills);
    
    const totalSales = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalBills = filteredBills.length;
    const totalLabour = filteredBills.reduce((sum, bill) => sum + (bill.laborCharges || 0), 0);
    const totalCash = filteredBills.reduce((sum, bill) => sum + (bill.payment?.cash || 0), 0);
    const totalOnline = filteredBills.reduce((sum, bill) => sum + (bill.payment?.online || 0), 0);
    const totalPayment = totalCash + totalOnline;

    // Calculate outstanding amounts for all bills and sales
    let purchaseOutstanding = 0;
    billHistory.forEach(bill => {
        const totalPayable = bill.total || 0;
        const onlinePaid = bill.payment ? (bill.payment.online || 0) : 0;
        const cashPaid = bill.payment ? (bill.payment.cash || 0) : 0;
        const totalPaid = onlinePaid + cashPaid;
        const outstanding = bill.payment?.due || (totalPayable - totalPaid);
        if (outstanding > 0) {
            purchaseOutstanding += outstanding;
        }
    });

    let saleOutstanding = 0;
    salesHistory.forEach(sale => {
        const totalReceivable = sale.total || 0;
        const onlineReceived = sale.payment ? (sale.payment.online || 0) : 0;
        const cashReceived = sale.payment ? (sale.payment.cash || 0) : 0;
        const totalReceived = onlineReceived + cashReceived;
        const outstanding = sale.payment?.due || (totalReceivable - totalReceived);
        if (outstanding > 0) {
            saleOutstanding += outstanding;
        }
    });

    document.getElementById("totalSales").textContent = totalSales;
    document.getElementById("totalBills").textContent = totalBills;
    document.getElementById("totalLabour").textContent = totalLabour;
    document.getElementById("totalCash").textContent = totalCash;
    document.getElementById("totalOnline").textContent = totalOnline;
    document.getElementById("totalPaymentReport").textContent = totalPayment;
    document.getElementById("purchaseOutstanding").textContent = purchaseOutstanding.toFixed(2);
    document.getElementById("saleOutstanding").textContent = saleOutstanding.toFixed(2);

    // Popular items
    const itemCounts = {};
    const itemQuantities = {};
    const itemValues = {};
    
    filteredBills.forEach(bill => {
        bill.items.forEach(item => {
            if (!itemCounts[item.name]) {
                itemCounts[item.name] = 0;
                itemQuantities[item.name] = 0;
                itemValues[item.name] = 0;
            }
            itemCounts[item.name]++;
            itemQuantities[item.name] += item.qty;
            itemValues[item.name] += item.total;
        });
    });

    const popularItems = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const popularContainer = document.getElementById("popularItems");
    
    if (popularItems.length === 0) {
        popularContainer.innerHTML = '<p style="text-align: center; color: #888;">No data available</p>';
    } else {
        popularContainer.innerHTML = popularItems.map(([name, count]) => `
            <div class="popular-item">
                <span>${name}</span>
                <span>${count} purchases • ${itemQuantities[name].toFixed(0)}kg • ₹${itemValues[name]}</span>
            </div>
        `).join("");
    }
    
    // Item-wise detailed report
    renderItemWiseReport(itemCounts, itemQuantities, itemValues);
    
    // Render chart
    renderPurchaseChart(filteredBills);
}

function renderItemWiseReport(itemCounts, itemQuantities, itemValues) {
    const container = document.getElementById("itemWiseReport");
    
    const items = Object.keys(itemCounts).sort((a, b) => itemValues[b] - itemValues[a]);
    
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888;">No data available</p>';
        return;
    }
    
    container.innerHTML = items.map(itemName => `
        <div class="item-report">
            <div class="item-report-header">${itemName}</div>
            <div class="item-report-details">
                <strong>Purchases:</strong> ${itemCounts[itemName]} times<br>
                <strong>Quantity:</strong> ${itemQuantities[itemName].toFixed(2)} kg<br>
                <strong>Total Value:</strong> ₹${itemValues[itemName]}<br>
                <strong>Avg Rate:</strong> ₹${(itemValues[itemName] / itemQuantities[itemName]).toFixed(2)}/kg
            </div>
        </div>
    `).join("");
}

function renderPurchaseChart(bills) {
    const canvas = document.getElementById('purchaseChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Set canvas size based on container
    const container = canvas.parentElement;
    canvas.width = container.offsetWidth - 40;
    canvas.height = 250;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (bills.length === 0) {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Group by date
    const dailyData = {};
    bills.forEach(bill => {
        const date = new Date(bill.date).toLocaleDateString();
        if (!dailyData[date]) {
            dailyData[date] = 0;
        }
        dailyData[date] += bill.total;
    });
    
    const dates = Object.keys(dailyData).slice(-7); // Last 7 days
    const values = dates.map(date => dailyData[date]);
    
    if (values.length === 0) {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const maxValue = Math.max(...values);
    const barWidth = (canvas.width - 40) / dates.length;
    const chartHeight = canvas.height - 60;
    
    ctx.fillStyle = '#007bff';
    
    values.forEach((value, index) => {
        const barHeight = (value / maxValue) * chartHeight;
        const x = 20 + index * barWidth;
        const y = canvas.height - 40 - barHeight;
        
        // Draw bar
        ctx.fillRect(x, y, barWidth - 10, barHeight);
        
        // Draw value
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('₹' + value, x + (barWidth - 10) / 2, y - 5);
        
        // Draw date
        ctx.save();
        ctx.translate(x + (barWidth - 10) / 2, canvas.height - 10);
        ctx.rotate(-Math.PI / 4);
        ctx.font = '10px Arial';
        ctx.fillText(dates[index], 0, 0);
        ctx.restore();
        
        ctx.fillStyle = '#007bff';
    });
}

// -------------------- HELPER: GET MOST FREQUENT ITEMS --------------------
function getMostFrequentItem(mode) {
    const freq = {};
    
    if (mode === 'purchase') {
        // Count purchase frequency from billHistory
        billHistory.forEach(bill => {
            if (bill.type === 'purchase' || !bill.type) {
                bill.items.forEach(item => {
                    freq[item.name] = (freq[item.name] || 0) + 1;
                });
            }
        });
    } else {
        // Count sale frequency from both billHistory (sale mode) and salesHistory
        billHistory.forEach(bill => {
            if (bill.type === 'sale') {
                bill.items.forEach(item => {
                    freq[item.name] = (freq[item.name] || 0) + 1;
                });
            }
        });
        salesHistory.forEach(sale => {
            sale.items.forEach(item => {
                freq[item.name] = (freq[item.name] || 0) + 1;
            });
        });
    }
    
    // Find most frequent
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
}

// -------------------- TABS --------------------
function showTab(tabId, evt) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));

    document.getElementById(tabId).classList.add("active");
    if (evt) evt.target.classList.add("active");
}

// -------------------- ITEMS & RATES PAGE --------------------
function renderItems() {
    const container = document.getElementById("itemsList");
    container.innerHTML = "";

    items.forEach((item, index) => {
        // Initialize rates and saleRates if they don't exist
        if (!item.rates) item.rates = [];
        if (!item.saleRates) item.saleRates = [];
        
        let card = document.createElement("div");
        card.className = "item-card";

        // Build purchase rates - wrap each rate+button in a container
        const purchaseRatesHTML = item.rates.map((rate, rIndex) => `
            <div class="rate-group">
                <input type="number" value="${rate}" class="rate-input purchase" oninput="updateRate(${index}, ${rIndex}, this.value)" placeholder="Rate" />
                <button class="delete-rate" onclick="deleteRate(${index}, ${rIndex})">×</button>
            </div>
        `).join('');

        // Build sale rates - wrap each rate+button in a container
        const saleRatesHTML = item.saleRates.map((rate, rIndex) => `
            <div class="rate-group">
                <input type="number" value="${rate}" class="rate-input sale" oninput="updateSaleRate(${index}, ${rIndex}, this.value)" placeholder="Rate" />
                <button class="delete-rate" onclick="deleteSaleRate(${index}, ${rIndex})">×</button>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="item-header">
                <input type="text" class="item-name-input" 
                       value="${item.name}" 
                       oninput="updateItemName(${index}, this.value)"
                       placeholder="Enter item name (English)">
                <button class="delete-item-btn" onclick="deleteItem(${index})">Delete</button>
            </div>
            <div style="margin-bottom: 12px;">
                <label style="font-size: 13px; font-weight: 600; color: #666; margin-bottom: 4px; display: block;">Hindi Name:</label>
                <input type="text" 
                       value="${item.hindiName || ''}" 
                       oninput="updateItemHindiName(${index}, this.value)"
                       placeholder="हिंदी नाम"
                       style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px; font-size: 15px;">
            </div>
            <div class="item-row">
                <div style="margin-bottom: 8px;">
                    <label style="font-size: 14px; font-weight: 600; color: #007bff; margin-bottom: 8px; display: block;">Purchase Rates (₹/kg):</label>
                    <div class="rates-container">${purchaseRatesHTML}<button class="add-rate-plus purchase" onclick="addRate(${index})">+</button></div>
                </div>

                <div>
                    <label style="font-size: 14px; font-weight: 600; color: #28a745; margin-bottom: 8px; display: block;">Sale Rates (₹/kg):</label>
                    <div class="rates-container">${saleRatesHTML}<button class="add-rate-plus sale" onclick="addSaleRate(${index})">+</button></div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// Add item
async function addItem() {
    const newItem = { name: "", hindiName: "", rates: [], saleRates: [] };
    await saveItemToFirestore(newItem);
    items.push(newItem);
    renderItems();
    loadItemsDropdown();
}

// Debounce timers for item updates
const itemUpdateTimers = {};

// Update item name (AUTO-SAVE without re-render)
function updateItemName(index, value) {
    items[index].name = value;
    
    // Clear existing timer for this item
    if (itemUpdateTimers[`name_${index}`]) {
        clearTimeout(itemUpdateTimers[`name_${index}`]);
    }
    
    // Set new timer to save after 500ms of no typing
    itemUpdateTimers[`name_${index}`] = setTimeout(async () => {
        await saveItemToFirestore(items[index]);
        loadItemsDropdown();
    }, 500);
}

// Update item Hindi name (AUTO-SAVE without re-render)
function updateItemHindiName(index, value) {
    items[index].hindiName = value;
    
    // Clear existing timer for this item
    if (itemUpdateTimers[`hindi_${index}`]) {
        clearTimeout(itemUpdateTimers[`hindi_${index}`]);
    }
    
    // Set new timer to save after 500ms of no typing
    itemUpdateTimers[`hindi_${index}`] = setTimeout(async () => {
        await saveItemToFirestore(items[index]);
        loadItemsDropdown();
    }, 500);
}

// Add rate inline
async function addRate(index) {
    items[index].rates.push('');
    await saveItemToFirestore(items[index]);
    renderItems();
    loadItemsDropdown();
}

// Update rate (AUTO-SAVE without re-render)
function updateRate(itemIndex, rateIndex, value) {
    items[itemIndex].rates[rateIndex] = Number(value);
    
    // Clear existing timer
    const timerId = `rate_${itemIndex}_${rateIndex}`;
    if (itemUpdateTimers[timerId]) {
        clearTimeout(itemUpdateTimers[timerId]);
    }
    
    // Set new timer to save after 500ms of no typing
    itemUpdateTimers[timerId] = setTimeout(async () => {
        await saveItemToFirestore(items[itemIndex]);
        loadItemsDropdown();
    }, 500);
}

// Delete rate
async function deleteRate(itemIndex, rateIndex) {
    items[itemIndex].rates.splice(rateIndex, 1);
    await saveItemToFirestore(items[itemIndex]);
    renderItems();
    loadItemsDropdown();
}

// Add sale rate inline
async function addSaleRate(index) {
    if (!items[index].saleRates) {
        items[index].saleRates = [];
    }
    items[index].saleRates.push('');
    await saveItemToFirestore(items[index]);
    renderItems();
    loadItemsDropdown();
}

// Update sale rate (AUTO-SAVE without re-render)
function updateSaleRate(itemIndex, rateIndex, value) {
    if (!items[itemIndex].saleRates) {
        items[itemIndex].saleRates = [];
    }
    items[itemIndex].saleRates[rateIndex] = Number(value);
    
    // Clear existing timer
    const timerId = `salerate_${itemIndex}_${rateIndex}`;
    if (itemUpdateTimers[timerId]) {
        clearTimeout(itemUpdateTimers[timerId]);
    }
    
    // Set new timer to save after 500ms of no typing
    itemUpdateTimers[timerId] = setTimeout(async () => {
        await saveItemToFirestore(items[itemIndex]);
        loadItemsDropdown();
    }, 500);
}

// Delete sale rate
async function deleteSaleRate(itemIndex, rateIndex) {
    if (items[itemIndex].saleRates) {
        items[itemIndex].saleRates.splice(rateIndex, 1);
        await saveItemToFirestore(items[itemIndex]);
        renderItems();
        loadItemsDropdown();
    }
}

// Delete item
async function deleteItem(index) {
    const itemToDelete = items[index];
    if (itemToDelete.id) {
        await deleteItemFromFirestore(itemToDelete.id);
    }
    items.splice(index, 1);
    renderItems();
    loadItemsDropdown();
}

// -------------------- BILLING PAGE --------------------
function loadItemsDropdown() {
    let select = document.getElementById("billItem");
    if (!select) return;
    
    select.innerHTML = "";

    items.forEach((item, index) => {
        let opt = document.createElement("option");
        opt.value = index;
        const displayName = (settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        opt.textContent = displayName;
        select.appendChild(opt);
    });

    // Select most frequent purchased item by default
    if (items.length > 0) {
        const mostFrequent = getMostFrequentItem('purchase');
        if (mostFrequent) {
            const frequentIndex = items.findIndex(item => item.name === mostFrequent);
            if (frequentIndex !== -1) {
                select.value = frequentIndex;
            }
        }
        loadRates();
    }
    clearWeights(); // Clear weights when loading items
}

// Load sale items dropdown (all items)
function loadSaleItemsDropdown() {
    const select = document.getElementById("billItem");
    if (!select) return;
    
    select.innerHTML = '';

    // Load all items
    items.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.name;
        const displayName = (settings.showHindi && item.hindiName) ? item.hindiName : item.name;
        opt.textContent = displayName;
        select.appendChild(opt);
    });
    
    // Select most frequent sold item by default
    if (items.length > 0) {
        const mostFrequent = getMostFrequentItem('sale');
        if (mostFrequent) {
            select.value = mostFrequent;
        }
        loadRates();
    }
    
    clearWeights();
}

// Load rates of selected item
function loadRates() {
    const itemIndex = document.getElementById("billItem").value;
    const rateInput = document.getElementById("billRate");
    const rateDatalist = document.getElementById("rateOptions");
    
    if (!rateInput) return;
    
    rateDatalist.innerHTML = "";
    rateInput.value = "";
    rateInput.placeholder = "Select or enter rate";

    if (transactionMode === 'sale') {
        // For sale mode, load predefined sale rates
        const itemName = itemIndex;
        
        // Try to find item in items list to get sale rates
        const itemData = items.find(item => item.name === itemName);
        
        if (itemData && itemData.saleRates && itemData.saleRates.length > 0) {
            // Load sale rates into datalist
            itemData.saleRates.forEach(rate => {
                if (rate && rate > 0) {
                    let opt = document.createElement("option");
                    opt.value = rate;
                    rateDatalist.appendChild(opt);
                }
            });
        }
        // Don't auto-fill any rate - leave empty for manual entry
    } else {
        // For purchase mode, load predefined purchase rates
        if (!items[itemIndex]) return;

        items[itemIndex].rates.forEach(rate => {
            let opt = document.createElement("option");
            opt.value = rate;
            rateDatalist.appendChild(opt);
        });
    }

    clearWeights();
}

// Handle rate selection change
function handleRateChange() {
    const rateSelect = document.getElementById("billRate");
    const customRateInput = document.getElementById("customRate");
    
    // Clear custom rate when predefined rate is selected
    customRateInput.value = "";
}

// Update rate select when custom rate is entered
function updateRateFromCustom() {
    const customRateInput = document.getElementById("customRate");
    const rateSelect = document.getElementById("billRate");
    
    if (customRateInput.value) {
        // Clear selection when custom rate is entered
        rateSelect.value = "";
    }
}

// -------------------- WEIGHTS MANAGEMENT --------------------
async function addWeight() {
    const weightInput = document.getElementById("newWeight");
    const weight = Number(weightInput.value);

    if (!weight || weight <= 0) {
        await showModal("Enter valid weight");
        return;
    }

    hapticFeedback('light');
    currentWeights.push(weight);
    renderWeights();
    saveBillDraft(); // Auto-save draft
    showToast(`Added ${weight}kg`);
    weightInput.value = "";
    
    // Auto-add to bill when 10 weights are collected (lot-wise)
    if (currentWeights.length >= 10) {
        const itemIndex = document.getElementById("billItem").value;
        const rate = Number(document.getElementById("billRate").value);
        
        if (itemIndex && rate && rate > 0) {
            // Automatically add to bill (will combine with existing item)
            await addToBill(true); // true = auto-add, combine with existing
            showToast(`✓ Lot of 10 packets added to bill`);
        } else {
            // Just notify user that they can add manually
            showToast(`⚠️ 10 packets collected - select item & rate to add`);
        }
    }
    
    weightInput.focus();
}

function renderWeights() {
    const container = document.getElementById("weightsDisplay");
    
    let totalWeight = 0;

    currentWeights.forEach(w => {
        totalWeight += w;
    });

    // Update summary
    document.getElementById("totalWeights").textContent = totalWeight.toFixed(1);
    document.getElementById("totalPackets").textContent = currentWeights.length;

    // Render weight chips
    if (currentWeights.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div class="weights-compact-list">
            ${currentWeights.map((weight, index) => `
                <div class="weight-chip">
                    <span class="weight-chip-value">${weight}</span>
                    <button class="weight-chip-remove" onclick="removeWeight(${index})">×</button>
                </div>
            `).join("")}
        </div>
    `;
}

function removeWeight(index) {
    currentWeights.splice(index, 1);
    renderWeights();
}

function clearWeights() {
    currentWeights = [];
    renderWeights();
    if (document.getElementById("newWeight")) {
        document.getElementById("newWeight").value = "";
    }
}

// Add to bill
async function addToBill(autoAdd = false) {
    // Check if there's a weight entered but not added
    const weightInput = document.getElementById("newWeight");
    const pendingWeight = Number(weightInput.value);
    
    if (pendingWeight && pendingWeight > 0) {
        currentWeights.push(pendingWeight);
        weightInput.value = "";
        renderWeights();
    }

    let itemIndex = document.getElementById("billItem").value;
    let rate = Number(document.getElementById("billRate").value);

    if (!itemIndex) {
        await showModal("Please select an item");
        return;
    }

    if (!rate || rate <= 0) {
        await showModal("Please enter a valid rate");
        return;
    }

    if (currentWeights.length === 0) {
        await showModal("Please add at least one weight");
        return;
    }

    const totalQty = currentWeights.reduce((sum, w) => sum + w, 0);

    if (transactionMode === 'sale') {
        // Sale mode
        const itemName = itemIndex;
        
        if (!stock[itemName] || stock[itemName].quantity < totalQty) {
            await showModal(`Insufficient stock! Only ${stock[itemName]?.quantity.toFixed(2) || 0} kg available`);
            return;
        }

        // Check if item with same rate already exists in bill (only for auto-add)
        const existingItem = autoAdd ? billItems.find(item => item.name === itemName && item.rate === rate && item.mode === 'sale') : null;
        
        if (existingItem) {
            // Add to existing item (auto-add combines lots)
            existingItem.weights.push(...currentWeights);
            existingItem.packets += currentWeights.length;
            existingItem.qty += totalQty;
            existingItem.total = Math.round(existingItem.rate * existingItem.qty);
        } else {
            // Create new item (manual add always creates new row)
            billItems.push({
                name: itemName,
                rate,
                qty: totalQty,
                weights: [...currentWeights],
                packets: currentWeights.length,
                total: Math.round(rate * totalQty),
                mode: 'sale'
            });
        }
    } else {
        // Purchase mode
        let item = items[itemIndex];
        const heavyPackets = currentWeights.filter(w => w > settings.heavyWeightThreshold).length;

        // Check if item with same rate already exists in bill (only for auto-add)
        const existingItem = autoAdd ? billItems.find(billItem => billItem.name === item.name && billItem.rate === rate && billItem.mode === 'purchase') : null;
        
        if (existingItem) {
            // Add to existing item (auto-add combines lots)
            existingItem.weights.push(...currentWeights);
            existingItem.packets += currentWeights.length;
            existingItem.heavyPackets = (existingItem.heavyPackets || 0) + heavyPackets;
            existingItem.qty += totalQty;
            existingItem.total = Math.round(existingItem.rate * existingItem.qty);
            
            // Update stock with the new quantity
            updateStock(item.name, totalQty, rate);
            
            // Auto-add labor charge for heavy packets if checkbox is enabled
            const autoLaborEnabled = document.getElementById("autoLaborCharge").checked;
            if (heavyPackets > 0 && autoLaborEnabled) {
                const autoLabor = heavyPackets * settings.laborRate;
                const currentLabor = Number(document.getElementById("manualLaborCharges").value) || 0;
                document.getElementById("manualLaborCharges").value = currentLabor + autoLabor;
            }
        } else {
            // Create new item (manual add always creates new row)
            billItems.push({
                name: item.name,
                rate,
                qty: totalQty,
                weights: [...currentWeights],
                packets: currentWeights.length,
                heavyPackets: heavyPackets,
                total: Math.round(rate * totalQty),
                mode: 'purchase'
            });

            // Update stock - ADD to stock when purchasing
            updateStock(item.name, totalQty, rate);

            // Auto-add labor charge for heavy packets if checkbox is enabled
            const autoLaborEnabled = document.getElementById("autoLaborCharge").checked;
            if (heavyPackets > 0 && autoLaborEnabled) {
                const autoLabor = heavyPackets * settings.laborRate;
                const currentLabor = Number(document.getElementById("manualLaborCharges").value) || 0;
                document.getElementById("manualLaborCharges").value = currentLabor + autoLabor;
            }
        }
    }

    hapticFeedback('medium');
    renderBill();
    clearWeights();
    updateTotals();
    saveBillDraft(); // Auto-save draft
    
    const itemName = transactionMode === 'sale' ? itemIndex : items[itemIndex].name;
    showToast(`Added ${itemName} to bill`);
    
    // Reset selection only for manual add (not auto-add)
    if (!autoAdd) {
        document.getElementById("billItem").value = "";
        document.getElementById("billRate").value = "";
    }
}

// Render bill items in the table
function renderBill() {
    const tbody = document.querySelector("#billTable tbody");
    tbody.innerHTML = "";

    let total = 0;
    let totalPacketsCount = 0;
    let totalHeavyPacketsCount = 0;

    billItems.forEach((b, i) => {
        total += b.total;
        totalPacketsCount += b.packets;
        totalHeavyPacketsCount += b.heavyPackets || 0;

        // Format weights display - group by lots of 10
        let weightsDisplay = '';
        if (b.weights) {
            if (b.weights.length === 1) {
                weightsDisplay = `<strong>${b.qty}kg</strong>`;
            } else {
                // Group weights into lots of 10
                const lots = [];
                for (let j = 0; j < b.weights.length; j += 10) {
                    const lot = b.weights.slice(j, j + 10);
                    const lotSum = lot.reduce((sum, w) => sum + w, 0);
                    lots.push(lot.join('+') + ` = ${lotSum}`);
                }
                weightsDisplay = lots.join('<br>') + `<br><strong>= ${b.qty}kg</strong>`;
            }
        }

        let row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${b.name}</strong></td>
            <td>₹${b.rate}</td>
            <td>${weightsDisplay}</td>
            <td><strong>₹${b.total}</strong></td>
            <td><button class="remove-bill-item" onclick="deleteBillItem(${i})">×</button></td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById("billTotal").textContent = total;
    
    // Update total packets display
    const totalPacketsElement = document.getElementById("totalPacketsInBill");
    if (totalPacketsElement) {
        totalPacketsElement.textContent = totalPacketsCount;
    }
    
    // Update labor calculation display (only for purchase mode)
    if (transactionMode === 'purchase') {
        const laborCalcElement = document.getElementById("laborCalculation");
        if (laborCalcElement) {
            laborCalcElement.textContent = `${settings.laborRate} × ${totalHeavyPacketsCount}`;
        }
    }
    
    updateTotals();
}

function deleteBillItem(index) {
    billItems.splice(index, 1);
    renderBill();
    saveBillDraft(); // Auto-save draft
}

// Update totals calculation
function updateTotals() {
    const billTotal = Number(document.getElementById("billTotal").textContent) || 0;
    
    if (transactionMode === 'sale') {
        // For sales, no labor charges
        document.getElementById("amountPayable").textContent = Math.round(billTotal);
    } else {
        // For purchases, subtract labor charges
        const laborCharges = Number(document.getElementById("manualLaborCharges").value) || 0;
        const amountPayable = Math.round(billTotal - laborCharges);
        document.getElementById("amountPayable").textContent = amountPayable;
    }
}

// Update payment total
function updatePaymentTotal() {
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;
    
    const totalPaymentElement = document.getElementById("totalPayment");
    totalPaymentElement.textContent = totalPayment;
    
    // Get amount payable
    const amountPayable = Number(document.getElementById("amountPayable").textContent) || 0;
    
    // Check if payment exceeds amount payable
    const paymentTotalRow = document.querySelector('.payment-total');
    if (totalPayment > amountPayable && amountPayable > 0) {
        paymentTotalRow.classList.add('payment-excess');
    } else {
        paymentTotalRow.classList.remove('payment-excess');
    }
}

function fillPayableAmount(type) {
    const onlineCheckbox = document.getElementById('onlineCheckbox');
    const cashCheckbox = document.getElementById('cashCheckbox');
    const dueCheckbox = document.getElementById('dueCheckbox');
    const onlinePayment = document.getElementById('onlinePayment');
    const cashPayment = document.getElementById('cashPayment');
    const dueAmount = document.getElementById('dueAmount');
    const amountPayable = Number(document.getElementById('amountPayable').textContent) || 0;

    if (type === 'online') {
        if (onlineCheckbox.checked) {
            cashCheckbox.checked = false;
            dueCheckbox.checked = false;
            onlinePayment.value = amountPayable;
            cashPayment.value = '';
            dueAmount.value = '';
        } else {
            onlinePayment.value = '';
        }
    } else if (type === 'cash') {
        if (cashCheckbox.checked) {
            onlineCheckbox.checked = false;
            dueCheckbox.checked = false;
            cashPayment.value = amountPayable;
            onlinePayment.value = '';
            dueAmount.value = '';
        } else {
            cashPayment.value = '';
        }
    } else if (type === 'due') {
        if (dueCheckbox.checked) {
            onlineCheckbox.checked = false;
            cashCheckbox.checked = false;
            dueAmount.value = amountPayable;
            onlinePayment.value = '';
            cashPayment.value = '';
        } else {
            dueAmount.value = '';
        }
    }

    updatePaymentTotal();
}

// -------------------- PRINT BILL --------------------
async function printBill() {
    try {
        console.log('[DEBUG] printBill started');
        if (billItems.length === 0) {
            await showModal("No items in bill");
            return;
        }
        console.log('[DEBUG] Bill items count:', billItems.length);
        
        hapticFeedback('medium');

        // Get payment details - treat empty as 0
        console.log('[DEBUG] Getting payment details');
        const amountPayable = Number(document.getElementById("amountPayable").textContent) || 0;
        const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
        const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
        const duePayment = Number(document.getElementById("dueAmount").value) || 0;
        const totalPayment = onlinePayment + cashPayment + duePayment;
        console.log('[DEBUG] Payment details:', { amountPayable, totalPayment });
    
    // Check if payment is sufficient
    if (totalPayment < amountPayable) {
        const shortfall = amountPayable - totalPayment;
        const confirmPrint = await showModal(
            `⚠️ Payment Insufficient!\n\n` +
            `Amount Payable: ₹${amountPayable}\n` +
            `Total Payment: ₹${totalPayment}\n` +
            `Shortfall: ₹${shortfall.toFixed(2)}\n\n` +
            `Do you still want to print the bill?`,
            'Confirmation',
            true
        );
        
        if (!confirmPrint) {
            hideLoading();
            return;
        }
    }

        console.log('[DEBUG] Payment check passed');
        const isPurchase = billItems[0].mode === 'purchase';
        console.log('[DEBUG] isPurchase:', isPurchase);
        
        // Get values before clearing
        const billTotal = Number(document.getElementById("billTotal").textContent);
        console.log('[DEBUG] billTotal:', billTotal);
    const laborCharges = isPurchase ? Number(document.getElementById("manualLaborCharges").value) || 0 : 0;
    const amountPayableFinal = isPurchase ? billTotal - laborCharges : billTotal;

    // Calculate totals before clearing
    const totalHeavyPackets = billItems.reduce((sum, b) => sum + (b.heavyPackets || 0), 0);
    const totalPackets = billItems.reduce((sum, b) => sum + (b.packets || 0), 0);
    const isAutoLabor = isPurchase && document.getElementById("autoLaborCharge").checked;
    const customerName = document.getElementById("customerName").value.trim();

        // Prepare bill data
        console.log('[DEBUG] Preparing bill data');
        const billData = {
            isPurchase,
            customerName,
        billTotal,
        laborCharges,
        amountPayable: amountPayableFinal,
        totalPackets,
        onlinePayment,
        cashPayment,
        duePayment,
        isAutoLabor: isAutoLabor,
        laborCalc: totalHeavyPackets > 0 ? `${settings.laborRate} × ${totalHeavyPackets}` : '',
        items: billItems.map(b => {
            const item = items.find(i => i.name === b.name);
            // Always use Hindi name for bills, show warning if missing
            const printName = (item && item.hindiName) ? item.hindiName : b.name;
            if (item && !item.hindiName) {
                console.warn(`Hindi name missing for item: ${b.name}`);
            }
            return {
                name: printName,
                rate: b.rate,
                qty: b.qty,
                total: b.total,
                weights: b.weights
            };
        })
    };

        // Check if Bluetooth printer is enabled and connected
        console.log('[DEBUG] Checking printer settings:', { enabled: printerSettings.enabled, connected: !!connectedPrinter });
        if (printerSettings.enabled && connectedPrinter) {
            try {
                console.log('[DEBUG] Attempting Bluetooth print');
                showLoading();
                await printViaBluetooth(billData);
            hideLoading();
            showToast('✓ Printed via Bluetooth');
        } catch (error) {
            hideLoading();
            const retry = await showModal(
                `Bluetooth print failed: ${error.message}\n\nTry web print instead?`,
                'Print Error',
                true
            );
            if (retry) {
                await printViaWeb(billData);
            } else {
                return;
            }
        }
    } else {
        // Use web print
        showLoading();
        await printViaWeb(billData);
        hideLoading();
    }

        // Save to appropriate history
        if (isPurchase) {
            await saveBillToHistory();
        } else {
            await saveSaleToHistory();
        }
        
        hapticFeedback('heavy');
    } catch (error) {
        hideLoading();
        console.error('Print bill error:', error);
        await showModal('Print failed: ' + (error.message || 'Unknown error'));
    }
}

async function printViaBluetooth(billData) {
    try {
        console.log('[DEBUG] printViaBluetooth started');
        
        // Use the ES6 module printer manager if available
        if (window.printerManager && window.printerManager.device) {
            console.log('[DEBUG] Using ES6 module printer manager');
            await window.printerManager.write(billData);
            console.log('[DEBUG] Print completed successfully');
            return;
        }
        
        // Fallback to legacy printerManager
        if (!connectedPrinter) {
            throw new Error('Printer not connected');
        }
        console.log('[DEBUG] Printer device:', connectedPrinter.device);
        
        if (!connectedPrinter.device) {
            throw new Error('No printer device available');
        }
        
        console.log('[DEBUG] Printing with thermal printer plugin');
        await connectedPrinter.write(billData);
        console.log('[DEBUG] Print completed successfully');
    } catch (error) {
        console.error('Bluetooth print error:', error);
        throw new Error(error.message || 'Failed to print via Bluetooth');
    }
}

async function printViaWeb(billData) {
    // Build bill items HTML
    let billItemsHTML = billData.items.map(item => {
        let weightsDisplay = '';
        if (item.weights) {
            if (item.weights.length === 1) {
                weightsDisplay = `${item.qty}kg`;
            } else {
                weightsDisplay = `(${item.weights.join('+')}) = ${item.qty}kg`;
            }
        }
        
        return `
            <tr>
                <td>${item.name}</td>
                <td>₹${item.rate}</td>
                <td>${weightsDisplay}</td>
                <td>₹${item.total}</td>
            </tr>
        `;
    }).join("");

    // Labor display
    let laborDisplay = '';
    if (billData.isPurchase && billData.laborCharges > 0) {
        if (billData.isAutoLabor && billData.laborCalc) {
            laborDisplay = `<div><span>मजदूरी:</span><span>${billData.laborCalc} = ₹${billData.laborCharges}</span></div>`;
        } else {
            laborDisplay = `<div><span>मजदूरी:</span><span>₹${billData.laborCharges}</span></div>`;
        }
    }

    const printContent = `
        <html>
        <head>
            <title>Bill</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border-bottom: 1px solid #ccc; padding: 8px; text-align: center; }
                h2 { text-align: center; text-decoration: underline; }
                .totals { margin-top: 30px; font-size: 16px; }
                .totals div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                .grand-total { font-size: 20px; font-weight: bold; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; }
            </style>
        </head>
        <body>
            <h2>${billData.duePayment > 0 ? 'RECEIPT' : (billData.isPurchase ? 'PURCHASE RECEIPT' : 'SALE RECEIPT')}</h2>
            ${billData.customerName ? `<p style="text-align: center; margin: 10px 0; font-size: 16px;"><strong>Customer:</strong> ${billData.customerName}</p>` : ''}
            <table>
                <tr><th>वस्तु</th><th>दर</th><th>मात्रा</th><th>कुल</th></tr>
                ${billItemsHTML}
            </table>

            <div class="totals">
                <div><span>कुल:</span><span>₹${billData.billTotal}</span></div>
                ${laborDisplay}
                <div><span>पैकेट:</span><span>${billData.totalPackets}</span></div>
                <div class="grand-total"><span>${billData.isPurchase ? 'कुल भुगतान:' : 'कुल प्राप्त:'}</span><span>₹${billData.amountPayable}</span></div>
            </div>
        </body>
        </html>
    `;

    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printContent);
    doc.close();
    
    // Wait for content to load, then print
    await new Promise(resolve => {
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
                resolve();
            }, 100);
        }, 250);
    });
}

async function saveSaleToHistory() {
    if (billItems.length === 0) return;

    const billTotal = Number(document.getElementById("billTotal").textContent);
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const duePayment = Number(document.getElementById("dueAmount").value) || 0;
    const totalPayment = onlinePayment + cashPayment + duePayment;

    // Reduce stock for each item
    billItems.forEach(item => {
        reduceStock(item.name, item.qty);
    });

    const billComments = document.getElementById("billComments").value.trim();

    const sale = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        customerPhone: customerPhoneNumber,
        comments: billComments,
        items: [...billItems],
        total: billTotal,
        payment: {
            online: onlinePayment,
            cash: cashPayment,
            due: duePayment,
            total: totalPayment
        },
        type: 'sale',
        source: 'billing-tab'
    };

    await saveSaleToFirestore(sale);
    salesHistory.unshift(sale);
    await calculateStockFromBills();
    
    // Update finance overview if on Finance tab
    if (document.getElementById('financeOverview') && document.getElementById('financeOverview').style.display !== 'none') {
        calculateFinanceOverview();
    }
    
    // Clear current bill - set payment fields to empty
    billItems = [];
    document.getElementById("onlinePayment").value = "";
    document.getElementById("cashPayment").value = "";
    document.getElementById("dueAmount").value = "";
    document.getElementById("onlineCheckbox").checked = false;
    document.getElementById("cashCheckbox").checked = false;
    document.getElementById("dueCheckbox").checked = false;
    document.getElementById("totalPayment").textContent = 0;
    
    const totalPacketsElement = document.getElementById("totalPacketsInBill");
    if (totalPacketsElement) {
        totalPacketsElement.textContent = 0;
    }
    
    renderBill();
    updateTotals();
    renderSalesHistory();
    renderDue();
    
    // Clear customer fields
    customerPhoneNumber = '';
    document.getElementById("billComments").value = "";
    
    // Reload stock dropdown for next sale with most frequent item
    if (transactionMode === 'sale') {
        loadSaleItemsDropdown();
    }
}

// -------------------- SAVE BILL ONLY --------------------
async function saveBillOnly() {
    if (billItems.length === 0) {
        await showModal("No items in bill");
        return;
    }

    // Get payment details
    const amountPayable = Number(document.getElementById("amountPayable").textContent) || 0;
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;
    
    // Check if payment is sufficient
    if (totalPayment < amountPayable) {
        const shortfall = amountPayable - totalPayment;
        const confirmSave = await showModal(
            `⚠️ Payment Insufficient!\n\n` +
            `Amount Payable: ₹${amountPayable}\n` +
            `Total Payment: ₹${totalPayment}\n` +
            `Shortfall: ₹${shortfall.toFixed(2)}\n\n` +
            `Do you still want to save the bill?`,
            'Confirmation',
            true
        );
        
        if (!confirmSave) {
            return;
        }
    }

    const isPurchase = billItems[0].mode === 'purchase';
    
    // Save to appropriate history
    if (isPurchase) {
        hapticFeedback('heavy');
        await saveBillToHistory();
        await showModal("Purchase bill saved successfully!", "Success");
    } else {
        hapticFeedback('heavy');
        await saveSaleToHistory();
        await showModal("Sale bill saved successfully!", "Success");
    }
}

// -------------------- TRANSACTION MODE --------------------
async function toggleTransactionMode() {
    transactionMode = transactionMode === 'purchase' ? 'sale' : 'purchase';
    updateModeUI();
    
    // Load appropriate items
    if (transactionMode === 'sale') {
        loadSaleItemsDropdown();
    } else {
        loadItemsDropdown();
    }
    
    // Clear current bill if switching modes
    if (billItems.length > 0) {
        const shouldContinue = await showModal('Switching modes will clear current bill. Continue?', 'Confirmation', true);
        if (shouldContinue) {
            billItems = [];
            renderBill();
            updateTotals();
        } else {
            // Revert mode
            transactionMode = transactionMode === 'purchase' ? 'sale' : 'purchase';
            updateModeUI();
            return;
        }
    }
}

function updateModeUI() {
    const billingTab = document.getElementById('billing');
    const toggleBtn = document.getElementById('modeToggleBtn');
    const title = document.getElementById('billingTitle');
    const laborSection = document.querySelector('.labor-input-row');
    const paymentSection = document.querySelector('.payment-details');
    const totalLabel = document.querySelector('.bill-totals .total-row span');
    const grandTotalLabel = document.querySelector('.grand-total span');
    const printBtn = document.getElementById('printBillBtn');
    const saveBtn = document.getElementById('saveBillBtn');
    
    if (transactionMode === 'sale') {
        // Sale mode
        billingTab.classList.remove('purchase-theme');
        billingTab.classList.add('sale-theme');
        toggleBtn.textContent = '📦 Switch to Purchase';
        toggleBtn.classList.add('sale-mode');
        title.textContent = 'Sale Entry';
        title.style.color = '#28a745';
        
        // Hide labor charges for sales
        if (laborSection) laborSection.style.display = 'none';
        
        totalLabel.textContent = 'Sale Total:';
        grandTotalLabel.textContent = 'Total Receivable:';
        
        // Update payment row label
        const paymentTotalSpan = document.querySelector('.payment-total span');
        if (paymentTotalSpan) {
            paymentTotalSpan.textContent = 'Total Received:';
        }
        
        // Update buttons
        if (printBtn) {
            printBtn.textContent = 'Print';
            printBtn.classList.remove('print-purchase-btn');
            printBtn.classList.add('print-sale-btn');
        }
        if (saveBtn) {
            saveBtn.textContent = 'Save';
            saveBtn.classList.remove('save-purchase-btn');
            saveBtn.classList.add('save-sale-btn');
        }
        
    } else {
        // Purchase mode
        billingTab.classList.remove('sale-theme');
        billingTab.classList.add('purchase-theme');
        toggleBtn.textContent = '💰 Switch to Sale';
        toggleBtn.classList.remove('sale-mode');
        title.textContent = 'Purchase Entry';
        title.style.color = '#007bff';
        
        // Show labor charges for purchases
        if (laborSection) laborSection.style.display = 'flex';
        
        totalLabel.textContent = 'Purchase Total:';
        grandTotalLabel.textContent = 'Total Payable:';
        
        // Update payment row label
        const paymentTotalSpan = document.querySelector('.payment-total span');
        if (paymentTotalSpan) {
            paymentTotalSpan.textContent = 'Total Paid:';
        }
        
        // Update buttons
        if (printBtn) {
            printBtn.textContent = 'Print';
            printBtn.classList.remove('print-sale-btn');
            printBtn.classList.add('print-purchase-btn');
        }
        if (saveBtn) {
            saveBtn.textContent = 'Save';
            saveBtn.classList.remove('save-sale-btn');
            saveBtn.classList.add('save-purchase-btn');
        }
    }
}

// -------------------- SETTINGS --------------------
function loadSettings() {
    document.getElementById('settingHeavyWeight').value = settings.heavyWeightThreshold;
    document.getElementById('settingLaborRate').value = settings.laborRate;
    document.getElementById('settingAutoLabor').checked = settings.autoLaborEnabled;
    document.getElementById('settingShowHindi').checked = settings.showHindi || false;
    
    // Load dark mode setting
    const darkModeCheckbox = document.getElementById('settingDarkMode');
    if (darkModeCheckbox) {
        const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
        darkModeCheckbox.checked = darkModeEnabled;
        if (darkModeEnabled) {
            document.body.classList.add('dark-mode');
        }
    }
    
    // Load Bluetooth printer settings
    const bluetoothCheckbox = document.getElementById('settingBluetoothEnabled');
    if (bluetoothCheckbox) {
        bluetoothCheckbox.checked = printerSettings.enabled || false;
        const section = document.getElementById('bluetoothPrinterSection');
        if (section) {
            section.style.display = printerSettings.enabled ? 'block' : 'none';
        }
    }
    
    updatePrinterStatus();
}

function toggleDarkMode() {
    const enabled = document.getElementById('settingDarkMode').checked;
    localStorage.setItem('darkMode', enabled);
    
    if (enabled) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    hapticFeedback('light');
    showToast(enabled ? 'Dark mode enabled' : 'Dark mode disabled');
}

function saveSettings() {
    settings.heavyWeightThreshold = Number(document.getElementById('settingHeavyWeight').value) || 30;
    settings.laborRate = Number(document.getElementById('settingLaborRate').value) || 6;
    settings.autoLaborEnabled = document.getElementById('settingAutoLabor').checked;
    settings.showHindi = document.getElementById('settingShowHindi').checked;
    
    localStorage.setItem('settings', JSON.stringify(settings));
    
    hapticFeedback('light');
    showToast('Settings saved successfully');
    
    // Re-render items to show/hide Hindi names
    renderItems();
    loadItemsDropdown();
}

async function clearAllData() {
    const confirmed = await showModal(
        'Are you sure you want to delete ALL data? This cannot be undone!',
        'Clear All Data',
        true
    );
    
    if (confirmed) {
        localStorage.clear();
        location.reload();
    }
}

// -------------------- EXPORT FUNCTIONS --------------------
function exportToCSV() {
    let filteredBills = filterBillsByDate(billHistory);
    filteredBills = filterBillsByReportFilters(filteredBills);
    
    if (filteredBills.length === 0) {
        showAlert("No data to export for the selected filters");
        return;
    }
    
    // Prepare CSV content
    let csv = "Bill ID,Date,Time,Type,Customer,Item,Quantity (kg),Rate (₹/kg),Amount (₹),Labor Charges (₹),Total (₹),Cash Payment (₹),Online Payment (₹)\n";
    
    filteredBills.forEach(bill => {
        const date = new Date(bill.date);
        const dateStr = date.toLocaleDateString('en-IN');
        const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const type = bill.type === 'sale' ? 'Sale' : 'Purchase';
        const customer = bill.customerName || '-';
        
        bill.items.forEach(item => {
            csv += `${bill.id},"${dateStr}","${timeStr}","${type}","${customer}","${item.name}",${item.qty},${item.rate},${item.total},${bill.laborCharges || 0},${bill.total},${bill.payment?.cash || 0},${bill.payment?.online || 0}\n`;
        });
    });
    
    // Add summary
    const totalSales = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalLabor = filteredBills.reduce((sum, bill) => sum + (bill.laborCharges || 0), 0);
    const totalCash = filteredBills.reduce((sum, bill) => sum + (bill.payment?.cash || 0), 0);
    const totalOnline = filteredBills.reduce((sum, bill) => sum + (bill.payment?.online || 0), 0);
    
    csv += `\n"SUMMARY",,,,,,,,,,,,\n`;
    csv += `"Total Bills:",${filteredBills.length},,,,,,,,,,\n`;
    csv += `"Total Amount:",₹${totalSales},,,,,,,,,,\n`;
    csv += `"Total Labor:",₹${totalLabor},,,,,,,,,,\n`;
    csv += `"Cash Payment:",₹${totalCash},,,,,,,,,,\n`;
    csv += `"Online Payment:",₹${totalOnline},,,,,,,,,,\n`;
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const filename = `Aadhat_Report_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    hapticFeedback('medium');
    showToast(`Exported ${filteredBills.length} bills to CSV`);
}

function exportToPDF() {
    let filteredBills = filterBillsByDate(billHistory);
    filteredBills = filterBillsByReportFilters(filteredBills);
    
    if (filteredBills.length === 0) {
        showAlert("No data to export for the selected filters");
        return;
    }
    
    // Create a printable HTML report
    const totalSales = filteredBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalLabor = filteredBills.reduce((sum, bill) => sum + (bill.laborCharges || 0), 0);
    const totalCash = filteredBills.reduce((sum, bill) => sum + (bill.payment?.cash || 0), 0);
    const totalOnline = filteredBills.reduce((sum, bill) => sum + (bill.payment?.online || 0), 0);
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Aadhat Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
                .summary { background: #f0f8ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .summary-item { margin: 8px 0; font-size: 16px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #007bff; color: white; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <h1>Aadhat Billing Report</h1>
            <p><strong>Generated on:</strong> ${new Date().toLocaleString('en-IN')}</p>
            <p><strong>Filter Period:</strong> ${currentDateFilter.charAt(0).toUpperCase() + currentDateFilter.slice(1)}</p>
            
            <div class="summary">
                <h2>Summary</h2>
                <div class="summary-item"><strong>Total Bills:</strong> ${filteredBills.length}</div>
                <div class="summary-item"><strong>Total Amount:</strong> ₹${totalSales}</div>
                <div class="summary-item"><strong>Labor Charges:</strong> ₹${totalLabor}</div>
                <div class="summary-item"><strong>Cash Payment:</strong> ₹${totalCash}</div>
                <div class="summary-item"><strong>Online Payment:</strong> ₹${totalOnline}</div>
            </div>
            
            <h2>Bill Details</h2>
            <table>
                <thead>
                    <tr>
                        <th>Bill ID</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Customer</th>
                        <th>Item</th>
                        <th>Qty (kg)</th>
                        <th>Rate (₹/kg)</th>
                        <th>Amount (₹)</th>
                        <th>Total (₹)</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    filteredBills.forEach(bill => {
        const date = new Date(bill.date);
        const dateStr = date.toLocaleDateString('en-IN') + ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const type = bill.type === 'sale' ? 'Sale' : 'Purchase';
        const customer = bill.customerName || '-';
        
        bill.items.forEach((item, idx) => {
            html += `
                <tr>
                    <td>${idx === 0 ? bill.id : ''}</td>
                    <td>${idx === 0 ? dateStr : ''}</td>
                    <td>${idx === 0 ? type : ''}</td>
                    <td>${idx === 0 ? customer : ''}</td>
                    <td>${item.name}</td>
                    <td>${item.qty.toFixed(2)}</td>
                    <td>₹${item.rate}</td>
                    <td>₹${item.total}</td>
                    <td>${idx === 0 ? '₹' + bill.total : ''}</td>
                </tr>
            `;
        });
    });
    
    html += `
                </tbody>
            </table>
            
            <div class="footer">
                <p>Aadhat Billing System • Generated automatically</p>
            </div>
        </body>
        </html>
    `;
    
    // Open in new window for printing/saving as PDF
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Auto-trigger print dialog after content loads
    printWindow.onload = function() {
        printWindow.print();
    };
    
    hapticFeedback('medium');
    showToast(`Report opened in new window. Use Print → Save as PDF`);
}

// -------------------- BLUETOOTH PRINTER UI --------------------
function toggleBluetoothPrinter() {
    const enabled = document.getElementById('settingBluetoothEnabled').checked;
    printerSettings.enabled = enabled;
    localStorage.setItem('printerSettings', JSON.stringify(printerSettings));
    
    const section = document.getElementById('bluetoothPrinterSection');
    if (section) {
        section.style.display = enabled ? 'block' : 'none';
    }
    
    updatePrinterStatus();
}

async function scanBluetoothDevices() {
    try {
        hapticFeedback('light');
        
        console.log('[SCAN] Checking Capacitor:', !!window.Capacitor);
        console.log('[SCAN] Available plugins:', window.Capacitor?.Plugins ? Object.keys(window.Capacitor.Plugins) : 'none');
        console.log('[SCAN] CapacitorThermalPrinter available:', !!window.Capacitor?.Plugins?.CapacitorThermalPrinter);
        
        if (!window.Capacitor || !window.Capacitor.Plugins.CapacitorThermalPrinter) {
            await showModal('Bluetooth is only available in the mobile app.\n\nWeb printing will be used instead.');
            return;
        }
        
        const devices = await printerManager.scanDevices();
        displayBluetoothDevices(devices);
    } catch (error) {
        await showModal('Failed to scan devices: ' + error.message);
    }
}

function displayBluetoothDevices(devices) {
    const container = document.getElementById('bluetoothDevicesList');
    if (!container) return;
    
    if (!devices || devices.length === 0) {
        container.innerHTML = '<p style="color: #666; padding: 12px;">No devices found. Make sure your printer is powered on and in pairing mode.</p>';
        return;
    }
    
    container.innerHTML = '<div style="margin-top: 12px;"><strong>Available Devices:</strong></div>';
    
    devices.forEach(device => {
        const deviceCard = document.createElement('div');
        deviceCard.style.cssText = 'background: #f5f5f5; padding: 12px; margin: 8px 0; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
        // ThermalPrinter plugin uses 'address' instead of 'deviceId' and 'name' for device info
        const address = device.address || device.deviceId || device.id;
        const name = device.name || 'Unknown Device';
        deviceCard.innerHTML = `
            <div>
                <strong>${name}</strong><br>
                <small style="color: #666;">${address}</small>
            </div>
            <button class="add-item-btn" onclick="connectToPrinter('${address}', '${name}')">Connect</button>
        `;
        container.appendChild(deviceCard);
    });
}

async function connectToPrinter(deviceId, deviceName) {
    try {
        hapticFeedback('medium');
        await printerManager.connect(deviceId);
        
        printerSettings.deviceId = deviceId;
        printerSettings.deviceName = deviceName;
        localStorage.setItem('printerSettings', JSON.stringify(printerSettings));
        
        updatePrinterStatus();
        showToast('✓ Connected to ' + deviceName);
        
        // Clear devices list
        const container = document.getElementById('bluetoothDevicesList');
        if (container) container.innerHTML = '';
        
    } catch (error) {
        await showModal('Failed to connect: ' + error.message);
    }
}

async function disconnectPrinter() {
    try {
        hapticFeedback('light');
        await printerManager.disconnect();
        
        printerSettings.deviceId = null;
        printerSettings.deviceName = null;
        localStorage.setItem('printerSettings', JSON.stringify(printerSettings));
        
        updatePrinterStatus();
        showToast('Printer disconnected');
    } catch (error) {
        await showModal('Failed to disconnect: ' + error.message);
    }
}

function updatePrinterStatus() {
    const statusText = document.getElementById('printerStatusText');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const testPrintBtn = document.getElementById('testPrintBtn');
    
    if (connectedPrinter && printerSettings.deviceName) {
        if (statusText) {
            statusText.innerHTML = `<span style="color: #4CAF50;">● Connected to ${printerSettings.deviceName}</span>`;
        }
        if (disconnectBtn) disconnectBtn.style.display = 'block';
        if (testPrintBtn) testPrintBtn.style.display = 'block';
    } else {
        if (statusText) {
            statusText.innerHTML = '<span style="color: #999;">○ Not connected</span>';
        }
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        if (testPrintBtn) testPrintBtn.style.display = 'none';
    }
}

async function testPrint() {
    if (!connectedPrinter) {
        await showModal('Printer not connected');
        return;
    }
    
    try {
        hapticFeedback('medium');
        showLoading();
        
        // Create test bill data
        const testBillData = {
            isPurchase: true,
            billTotal: 1000,
            laborCharges: 12,
            amountPayable: 988,
            totalPackets: 3,
            onlinePayment: 500,
            cashPayment: 488,
            laborCalc: '(6 × 2)',
            items: [
                {
                    name: 'Test Item 1',
                    rate: 50,
                    qty: 10,
                    total: 500,
                    weights: [5, 5]
                },
                {
                    name: 'Test Item 2',
                    rate: 50,
                    qty: 10,
                    total: 500,
                    weights: [10]
                }
            ]
        };
        
        await printViaBluetooth(testBillData);
        hideLoading();
        showToast('✓ Test print sent');
        hapticFeedback('heavy');
    } catch (error) {
        hideLoading();
        await showModal('Test print failed: ' + error.message);
    }
}

// -------------------- INIT --------------------
// -------------------- PAYMENTS --------------------

function updateExpensePersonOptions() {
    // Get unique person names from all expenses (business and personal)
    const uniquePersons = [...new Set(
        paymentsHistory
            .filter(p => p.personName && p.personName.trim() !== '')
            .map(p => p.personName)
    )];
    
    // Update business expense person options
    const businessDatalist = document.getElementById('businessExpensePersonOptions');
    if (businessDatalist) {
        businessDatalist.innerHTML = uniquePersons.map(name => `<option value="${name}">`).join('');
    }
    
    // Update personal expense person options
    const personalDatalist = document.getElementById('personalExpensePersonOptions');
    if (personalDatalist) {
        personalDatalist.innerHTML = uniquePersons.map(name => `<option value="${name}">`).join('');
    }
}

function filterExpenseTab(view, evt) {
    const buttons = document.querySelectorAll('#payments .filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (evt) evt.target.classList.add('active');
    
    const businessSection = document.getElementById('businessExpenseSection');
    const personalSection = document.getElementById('personalExpenseSection');
    
    if (view === 'business') {
        businessSection.style.display = 'block';
        personalSection.style.display = 'none';
    } else {
        businessSection.style.display = 'none';
        personalSection.style.display = 'block';
    }
}

async function saveBusinessExpense() {
    const type = document.getElementById('businessExpenseType').value.trim();
    const personName = document.getElementById('businessExpensePerson').value.trim();
    const amount = Number(document.getElementById('businessExpenseAmount').value);
    const remarks = document.getElementById('businessExpenseRemarks').value.trim();

    if (!type) {
        showModal('Please enter expense type');
        return;
    }

    if (!amount || amount <= 0) {
        showModal('Please enter a valid amount');
        return;
    }

    const expense = {
        id: Date.now(),
        type,
        personName,
        amount,
        remarks,
        category: 'business',
        date: new Date().toLocaleString('en-IN'),
        createdBy: currentUser ? currentUser.uid : 'unknown',
        createdByName: currentUser ? currentUser.name : 'Unknown'
    };

    await savePaymentToFirestore(expense);
    paymentsHistory.unshift(expense);
    
    hapticFeedback('medium');
    showToast('✓ Business expense saved');
    
    document.getElementById('businessExpenseType').value = '';
    document.getElementById('businessExpensePerson').value = '';
    document.getElementById('businessExpenseAmount').value = '';
    document.getElementById('businessExpenseRemarks').value = '';
    
    updateExpensePersonOptions();
    renderPaymentsHistory();
    
    // Update finance overview if on Finance tab
    if (document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
        calculateFinanceOverview();
    }
}

async function savePersonalExpense() {
    const type = document.getElementById('personalExpenseType').value.trim();
    const amount = Number(document.getElementById('personalExpenseAmount').value);
    const personName = document.getElementById('personalExpensePerson').value.trim();
    const remarks = document.getElementById('personalExpenseRemarks').value.trim();

    if (!type) {
        showModal('Please enter expense type');
        return;
    }

    if (!amount || amount <= 0) {
        showModal('Please enter a valid amount');
        return;
    }

    const expense = {
        id: Date.now(),
        type,
        personName,
        amount,
        remarks,
        category: 'personal',
        date: new Date().toLocaleString('en-IN'),
        createdBy: currentUser ? currentUser.uid : 'unknown',
        createdByName: currentUser ? currentUser.name : 'Unknown'
    };

    await savePaymentToFirestore(expense);
    paymentsHistory.unshift(expense);
    
    hapticFeedback('medium');
    showToast('✓ Personal expense saved');
    
    document.getElementById('personalExpenseType').value = '';
    document.getElementById('personalExpenseAmount').value = '';
    document.getElementById('personalExpensePerson').value = '';
    document.getElementById('personalExpenseRemarks').value = '';
    
    updateExpensePersonOptions();
    renderPaymentsHistory();
    
    // Update finance overview if on Finance tab
    if (document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
        calculateFinanceOverview();
    }
}

async function saveAndPrintBusinessExpense() {
    const type = document.getElementById('businessExpenseType').value.trim();
    const personName = document.getElementById('businessExpensePerson').value.trim();
    const amount = Number(document.getElementById('businessExpenseAmount').value);
    const remarks = document.getElementById('businessExpenseRemarks').value.trim();

    if (!type) {
        await showModal('Please enter expense type');
        return;
    }

    if (!amount || amount <= 0) {
        await showModal('Please enter a valid amount');
        return;
    }

    const expense = {
        id: Date.now(),
        type,
        personName,
        amount,
        remarks,
        category: 'business',
        date: new Date().toLocaleString('en-IN'),
        createdBy: currentUser ? currentUser.uid : 'unknown',
        createdByName: currentUser ? currentUser.name : 'Unknown'
    };

    await savePaymentToFirestore(expense);
    paymentsHistory.unshift(expense);
    
    printExpenseReceipt(expense);
    
    document.getElementById('businessExpenseType').value = '';
    document.getElementById('businessExpensePerson').value = '';
    document.getElementById('businessExpenseAmount').value = '';
    document.getElementById('businessExpenseRemarks').value = '';
    
    renderPaymentsHistory();
    
    // Update finance overview if on Finance tab
    if (document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
        calculateFinanceOverview();
    }
}

async function saveAndPrintPersonalExpense() {
    const type = document.getElementById('personalExpenseType').value.trim();
    const amount = Number(document.getElementById('personalExpenseAmount').value);
    const personName = document.getElementById('personalExpensePerson').value.trim();
    const remarks = document.getElementById('personalExpenseRemarks').value.trim();

    if (!type) {
        await showModal('Please enter expense type');
        return;
    }

    if (!amount || amount <= 0) {
        await showModal('Please enter a valid amount');
        return;
    }

    const expense = {
        id: Date.now(),
        type,
        personName,
        amount,
        remarks,
        category: 'personal',
        date: new Date().toLocaleString('en-IN'),
        createdBy: currentUser ? currentUser.uid : 'unknown',
        createdByName: currentUser ? currentUser.name : 'Unknown'
    };

    await savePaymentToFirestore(expense);
    paymentsHistory.unshift(expense);
    
    printExpenseReceipt(expense);
    
    document.getElementById('personalExpenseType').value = '';
    document.getElementById('personalExpenseAmount').value = '';
    document.getElementById('personalExpensePerson').value = '';
    document.getElementById('personalExpenseRemarks').value = '';
    
    renderPaymentsHistory();
    
    // Update finance overview if on Finance tab
    if (document.getElementById('financeOverviewSection') && document.getElementById('financeOverviewSection').style.display !== 'none') {
        calculateFinanceOverview();
    }
}

function printExpenseReceipt(expense) {
    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Expense Receipt</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { text-align: center; }
                .details { margin: 20px 0; }
                .details div { padding: 8px 0; border-bottom: 1px solid #eee; }
            </style>
        </head>
        <body>
            <h2>${expense.category === 'business' ? 'BUSINESS EXPENSE' : 'PERSONAL EXPENSE'}</h2>
            <div class="details">
                <div><strong>Type:</strong> ${expense.type}</div>
                <div><strong>Amount:</strong> ₹${expense.amount}</div>
                ${expense.personName ? `<div><strong>Person:</strong> ${expense.personName}</div>` : ''}
                ${expense.remarks ? `<div><strong>Remarks:</strong> ${expense.remarks}</div>` : ''}
                <div><strong>Date:</strong> ${expense.date}</div>
            </div>
        </body>
        </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printContent);
    doc.close();
    
    setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 500);
    }, 250);
}

async function savePayment() {
    const type = document.getElementById('paymentType').value.trim();
    const personName = document.getElementById('paymentPersonName').value.trim();
    const amount = Number(document.getElementById('paymentAmount').value);
    const remarks = document.getElementById('paymentRemarks').value.trim();

    if (!type) {
        showModal('Please enter payment type');
        return;
    }

    if (!amount || amount <= 0) {
        showModal('Please enter a valid amount');
        return;
    }

    // Update payment type options
    updatePaymentTypeOptions(type);

    const payment = {
        id: Date.now(),
        type,
        personName,
        amount,
        remarks,
        category: 'business',
        date: new Date().toLocaleString('en-IN'),
        createdBy: currentUser ? currentUser.uid : 'unknown',
        createdByName: currentUser ? currentUser.name : 'Unknown'
    };

    await savePaymentToFirestore(payment);
    paymentsHistory.unshift(payment);
    
    hapticFeedback('medium');
    showToast('✓ Payment saved');
    
    clearPaymentForm();
    renderPaymentsHistory();
}

async function saveAndPrintPayment() {
    const type = document.getElementById('paymentType').value.trim();
    const personName = document.getElementById('paymentPersonName').value.trim();
    const amount = Number(document.getElementById('paymentAmount').value);
    const remarks = document.getElementById('paymentRemarks').value.trim();

    if (!type) {
        await showModal('Please enter payment type');
        return;
    }

    if (!amount || amount <= 0) {
        await showModal('Please enter a valid amount');
        return;
    }

    // Update payment type options
    updatePaymentTypeOptions(type);

    const payment = {
        id: Date.now(),
        type,
        personName,
        amount,
        remarks,
        category: 'business',
        date: new Date().toLocaleString('en-IN'),
        createdBy: currentUser ? currentUser.uid : 'unknown',
        createdByName: currentUser ? currentUser.name : 'Unknown'
    };

    await savePaymentToFirestore(payment);
    paymentsHistory.unshift(payment);
    
    hapticFeedback('medium');
    
    await printPaymentReceipt(payment);
    
    clearPaymentForm();
    renderPaymentsHistory();
}

function updatePaymentTypeOptions(newType) {
    // Get unique payment types from history
    const uniqueTypes = [...new Set(paymentsHistory.map(p => p.type))];
    
    // Add new type if not exists
    if (newType && !uniqueTypes.includes(newType)) {
        uniqueTypes.unshift(newType);
    }
    
    // Update datalist
    const datalist = document.getElementById('paymentTypeOptions');
    if (datalist) {
        datalist.innerHTML = uniqueTypes.map(type => `<option value="${type}">`).join('');
    }
}

async function printPaymentReceipt(payment) {

    const printContent = `
        <html>
        <head>
            <title>Payment Receipt</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
                h2 { text-align: center; text-decoration: underline; margin-bottom: 10px; }
                .date { text-align: center; color: #666; margin-bottom: 20px; }
                .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 16px; }
                .detail-row.amount { font-size: 20px; font-weight: bold; margin-top: 10px; border-top: 2px solid #333; padding-top: 15px; }
                .signature { margin-top: 50px; border-top: 1px solid #333; padding-top: 10px; text-align: center; }
            </style>
        </head>
        <body>
            <h2>PAYMENT RECEIPT</h2>
            <h3 style="text-align: center; margin: 5px 0 20px 0;">${payment.type}</h3>
            <div class="date">${payment.date}</div>
            
            ${payment.personName ? `
            <div class="detail-row">
                <span>नाम (Name):</span>
                <strong>${payment.personName}</strong>
            </div>
            ` : ''}
            
            ${payment.remarks ? `
            <div class="detail-row">
                <span>विवरण (Details):</span>
                <span>${payment.remarks}</span>
            </div>
            ` : ''}
            
            <div class="detail-row amount">
                <span>राशि (Amount):</span>
                <span>₹${payment.amount}</span>
            </div>
            
            <div class="signature">
                <p>हस्ताक्षर / Signature</p>
                <p style="margin-top: 40px;">_________________</p>
            </div>
        </body>
        </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printContent);
    doc.close();
    
    await new Promise(resolve => {
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
                resolve();
            }, 100);
        }, 250);
    });
}

function clearPaymentForm() {
    document.getElementById('paymentType').value = '';
    document.getElementById('paymentPersonName').value = '';
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentRemarks').value = '';
}

function renderPaymentsHistory() {
    renderBusinessExpenseHistory();
    renderPersonalExpenseHistory();
}

function renderBusinessExpenseHistory() {
    const container = document.getElementById('businessExpenseHistoryList');
    const businessExpenses = paymentsHistory.filter(p => p.category === 'business');
    
    if (businessExpenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No business expenses recorded yet</p>';
        return;
    }

    container.innerHTML = businessExpenses.map((payment, index) => `
        <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div>
                    ${payment.personName ? `<div style="font-weight: 600; font-size: 16px; color: #333;">${payment.personName}</div>` : ''}
                    <div style="font-size: 13px; color: #666; margin-top: 4px;">${payment.type}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: bold; color: #2c3e50;">₹${payment.amount}</div>
                </div>
            </div>
            ${payment.remarks ? `<div style="font-size: 13px; color: #777; font-style: italic; margin-top: 8px;">📝 ${payment.remarks}</div>` : ''}
            <div style="font-size: 12px; color: #999; margin-top: 8px;">📅 ${payment.date}${payment.createdByName ? ` • By: ${payment.createdByName}` : ''}</div>
        </div>
    `).join('');
}

function renderPersonalExpenseHistory() {
    const container = document.getElementById('personalExpenseHistoryList');
    const personalExpenses = paymentsHistory.filter(p => p.category === 'personal');
    
    if (personalExpenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No personal expenses recorded yet</p>';
        return;
    }

    container.innerHTML = personalExpenses.map((payment, index) => `
        <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div>
                    ${payment.personName ? `<div style="font-weight: 600; font-size: 16px; color: #333;">${payment.personName}</div>` : ''}
                    <div style="font-size: 13px; color: #666; margin-top: 4px;">${payment.type}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: bold; color: #2c3e50;">₹${payment.amount}</div>
                </div>
            </div>
            ${payment.remarks ? `<div style="font-size: 13px; color: #777; font-style: italic; margin-top: 8px;">📝 ${payment.remarks}</div>` : ''}
            <div style="font-size: 12px; color: #999; margin-top: 8px;">📅 ${payment.date}${payment.createdByName ? ` • By: ${payment.createdByName}` : ''}</div>
        </div>
    `).join('');
}

// Store current bill/sale for editing
let currentBillForEdit = null;
let currentBillType = null;
let currentBillIndex = null;

async function reprintBill(index) {
    const bill = billHistory[index];
    if (!bill) {
        showModal('Bill not found');
        return;
    }
    
    // Store for editing
    currentBillForEdit = bill;
    currentBillType = 'purchase';
    currentBillIndex = index;
    
    // Generate bill HTML
    const itemsHTML = bill.items.map(item => {
        const weightsDisplay = item.weights ? item.weights.map(w => `${w}kg`).join(', ') : '';
        return `
            <tr>
                <td>${item.name}</td>
                <td>${item.packets || 0}</td>
                <td>${weightsDisplay}</td>
                <td>${item.qty || 0} kg</td>
                <td>₹${item.rate}</td>
                <td><strong>₹${item.total}</strong></td>
            </tr>
        `;
    }).join('');
    
    const payment = bill.payment || {};
    const paymentHTML = (payment.online > 0 || payment.cash > 0 || payment.due > 0) ? `
        <div class="bill-payment-section">
            <h4>Payment Details</h4>
            ${payment.online > 0 ? `<div class="bill-payment-row"><span>Online:</span><strong>₹${payment.online}</strong></div>` : ''}
            ${payment.cash > 0 ? `<div class="bill-payment-row"><span>Cash:</span><strong>₹${payment.cash}</strong></div>` : ''}
            ${payment.due > 0 ? `<div class="bill-payment-row" style="color: #dc3545;"><span>Due:</span><strong>₹${payment.due}</strong></div>` : ''}
        </div>
    ` : '';
    
    const content = `
        <div class="bill-info-section">
            ${bill.customerName ? `
                <div class="bill-info-row">
                    <div class="bill-info-label">Customer:</div>
                    <div class="bill-info-value"><strong>${bill.customerName}</strong></div>
                </div>
            ` : ''}
            <div class="bill-info-row">
                <div class="bill-info-label">Date:</div>
                <div class="bill-info-value">${bill.date}</div>
            </div>
            ${bill.createdByName ? `
                <div class="bill-info-row">
                    <div class="bill-info-label">Created By:</div>
                    <div class="bill-info-value">${bill.createdByName}</div>
                </div>
            ` : ''}
        </div>
        
        <table class="bill-items-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th style="text-align: center;">Packets</th>
                    <th>Weights</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHTML}
            </tbody>
        </table>
        
        <div class="bill-totals-section">
            <div class="bill-totals-row">
                <span>Bill Total:</span>
                <strong>₹${bill.total}</strong>
            </div>
            ${bill.laborCharges > 0 ? `
                <div class="bill-totals-row">
                    <span>Labor Charges:</span>
                    <strong>₹${bill.laborCharges}</strong>
                </div>
                <div class="bill-totals-row total">
                    <span>Amount Payable:</span>
                    <strong>₹${(bill.total - bill.laborCharges).toFixed(2)}</strong>
                </div>
            ` : ''}
        </div>
        
        ${paymentHTML}
    `;
    
    document.getElementById('billDetailsTitle').textContent = `Purchase Bill #${bill.id}`;
    document.getElementById('billDetailsContent').innerHTML = content;
    document.getElementById('billDetailsOverlay').classList.add('active');
}

async function reprintSale(index) {
    const sale = salesHistory[index];
    if (!sale) {
        showModal('Sale not found');
        return;
    }
    
    // Store for editing
    currentBillForEdit = sale;
    currentBillType = 'sale';
    currentBillIndex = index;
    
    // Generate sale HTML
    const itemsHTML = sale.items.map(item => {
        const qty = item.qty || item.quantity || 0;
        return `
            <tr>
                <td>${item.name}</td>
                <td>${qty} kg</td>
                <td>₹${item.rate}</td>
                <td><strong>₹${item.total}</strong></td>
            </tr>
        `;
    }).join('');
    
    const payment = sale.payment || {};
    const paymentHTML = (payment.online > 0 || payment.cash > 0 || payment.due > 0) ? `
        <div class="bill-payment-section">
            <h4>Payment Details</h4>
            ${payment.online > 0 ? `<div class="bill-payment-row"><span>Online:</span><strong>₹${payment.online}</strong></div>` : ''}
            ${payment.cash > 0 ? `<div class="bill-payment-row"><span>Cash:</span><strong>₹${payment.cash}</strong></div>` : ''}
            ${payment.due > 0 ? `<div class="bill-payment-row" style="color: #dc3545;"><span>Due:</span><strong>₹${payment.due}</strong></div>` : ''}
        </div>
    ` : '';
    
    const paymentsHistoryHTML = sale.payments && sale.payments.length > 0 ? `
        <div class="bill-payment-section" style="background: #e7f5e9;">
            <h4 style="color: #155724;">Payment History</h4>
            ${sale.payments.map(p => `
                <div class="bill-payment-row"><span>• ${p.date}${p.recordedBy ? ` by ${p.recordedBy}` : ''}</span><strong>₹${p.amount}</strong></div>
            `).join('')}
        </div>
    ` : '';
    
    const content = `
        <div class="bill-info-section">
            ${sale.customerName ? `
                <div class="bill-info-row">
                    <div class="bill-info-label">Customer:</div>
                    <div class="bill-info-value"><strong>${sale.customerName}</strong></div>
                </div>
            ` : ''}
            <div class="bill-info-row">
                <div class="bill-info-label">Date:</div>
                <div class="bill-info-value">${sale.date}</div>
            </div>
            ${sale.createdByName ? `
                <div class="bill-info-row">
                    <div class="bill-info-label">Created By:</div>
                    <div class="bill-info-value">${sale.createdByName}</div>
                </div>
            ` : ''}
        </div>
        
        <table class="bill-items-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHTML}
            </tbody>
        </table>
        
        <div class="bill-totals-section">
            <div class="bill-totals-row total">
                <span>Total:</span>
                <strong>₹${sale.total}</strong>
            </div>
        </div>
        
        ${paymentHTML}
        ${paymentsHistoryHTML}
    `;
    
    document.getElementById('billDetailsTitle').textContent = `Sale #${sale.id}`;
    document.getElementById('billDetailsContent').innerHTML = content;
    document.getElementById('billDetailsOverlay').classList.add('active');
}

function closeBillDetails() {
    document.getElementById('billDetailsOverlay').classList.remove('active');
    currentBillForEdit = null;
    currentBillType = null;
    currentBillIndex = null;
}

async function editBillDetails() {
    if (!currentBillForEdit || !currentBillType) {
        showModal('No bill selected for editing');
        return;
    }
    
    closeBillDetails();
    
    if (currentBillType === 'purchase') {
        // Switch to Billing tab (Purchase) and prefill data
        showTab('billing', null);
        
        // Set edit mode flag
        window.editingBillId = currentBillForEdit.id;
        window.editingBillDocId = currentBillForEdit.docId || String(currentBillForEdit.id);
        
        // Prefill customer name
        const customerNameEl = document.getElementById('customerName');
        if (customerNameEl) {
            customerNameEl.value = currentBillForEdit.customerName || '';
        }
        
        // Prefill labor charges
        const laborChargesEl = document.getElementById('manualLaborCharges');
        if (laborChargesEl) {
            laborChargesEl.value = currentBillForEdit.laborCharges || 0;
        }
        
        // Prefill items
        billItems = currentBillForEdit.items.map(item => ({
            name: item.name,
            packets: item.packets || 0,
            weights: item.weights || [],
            qty: item.qty || 0,
            rate: item.rate || 0,
            total: item.total || 0
        }));
        
        // Prefill payment
        const payment = currentBillForEdit.payment || {};
        const cashEl = document.getElementById('cashPayment');
        const onlineEl = document.getElementById('onlinePayment');
        const dueEl = document.getElementById('dueAmount');
        
        if (cashEl) cashEl.value = payment.cash || 0;
        if (onlineEl) onlineEl.value = payment.online || 0;
        if (dueEl) dueEl.value = payment.due || 0;
        
        // Check checkboxes for payment methods
        const cashCheckbox = document.getElementById('cashCheckbox');
        const onlineCheckbox = document.getElementById('onlineCheckbox');
        const dueCheckbox = document.getElementById('dueCheckbox');
        
        if (cashCheckbox && payment.cash > 0) cashCheckbox.checked = true;
        if (onlineCheckbox && payment.online > 0) onlineCheckbox.checked = true;
        if (dueCheckbox && payment.due > 0) dueCheckbox.checked = true;
        
        renderBill();
        updateTotals();
        
        showToast('📝 Editing mode - Make changes and save to update');
        
    } else {
        // Switch to Sales tab and prefill data
        showTab('sales', null);
        
        // Make sure we're on the sales entry section, not outstanding
        filterSalesTab('sales', null);
        
        // Set edit mode flag
        window.editingSaleId = currentBillForEdit.id;
        window.editingSaleDocId = currentBillForEdit.docId || String(currentBillForEdit.id);
        
        // Prefill customer name
        const customerNameEl = document.getElementById('wholesaleCustomerName');
        if (customerNameEl) {
            customerNameEl.value = currentBillForEdit.customerName || '';
        }
        
        // Prefill items
        saleItems = currentBillForEdit.items.map(item => ({
            name: item.name,
            qty: item.qty || item.quantity || 0,
            rate: item.rate || 0,
            total: item.total || 0
        }));
        
        // Prefill payment
        const payment = currentBillForEdit.payment || {};
        const cashEl = document.getElementById('wholesaleCash');
        const onlineEl = document.getElementById('wholesaleOnline');
        const dueEl = document.getElementById('wholesaleDue');
        
        if (cashEl) cashEl.value = payment.cash || 0;
        if (onlineEl) onlineEl.value = payment.online || 0;
        if (dueEl) dueEl.value = payment.due || 0;
        
        renderSalesBill();
        updateSalesBillPayment();
        
        showToast('📝 Editing mode - Make changes and save to update');
    }
}

async function showOutstandingDetails(transactionId, transactionType) {
    if (transactionType === 'purchase') {
        const billIndex = billHistory.findIndex(b => String(b.id) === String(transactionId));
        if (billIndex >= 0) {
            await reprintBill(billIndex);
        } else {
            showModal('Bill not found');
        }
    } else {
        const saleIndex = salesHistory.findIndex(s => String(s.id) === String(transactionId));
        if (saleIndex >= 0) {
            await reprintSale(saleIndex);
        } else {
            showModal('Sale not found');
        }
    }
}

async function notifyOwnersOfEdit(type, docId, oldData, newData) {
    try {
        // Get all owners from users collection
        const usersSnapshot = await db.collection('users').where('role', '==', 'owner').get();
        const owners = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        
        // Create notification message
        const typeName = type === 'purchase' ? 'Purchase Bill' : 'Sale';
        const changes = [];
        
        if (oldData.customerName !== newData.customerName) {
            changes.push(`Customer: ${oldData.customerName || 'N/A'} → ${newData.customerName || 'N/A'}`);
        }
        if (oldData.total !== newData.total) {
            changes.push(`Total: ₹${oldData.total} → ₹${newData.total}`);
        }
        if (oldData.items.length !== newData.items.length) {
            changes.push(`Items: ${oldData.items.length} → ${newData.items.length}`);
        }
        
        const notification = {
            type: 'history_edit',
            transactionType: type,
            transactionId: docId,
            message: `${typeName} #${docId} was edited by ${userName}`,
            changes: changes.join(', '),
            editedBy: currentUser.uid,
            editedByName: userName,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            date: new Date().toLocaleString('en-IN'),
            read: false
        };
        
        // Save notification for each owner
        for (const owner of owners) {
            if (owner.uid !== currentUser.uid) { // Don't notify the person who made the edit
                await db.collection('notifications').add({
                    ...notification,
                    recipientId: owner.uid,
                    recipientName: owner.name
                });
            }
        }
        
        console.log('✓ Notified', owners.length - 1, 'owner(s) about edit');
    } catch (error) {
        console.error('Error sending notifications:', error);
        // Don't throw - notifications are not critical
    }
}

// ========== FINANCE & ACCOUNTING FUNCTIONS ==========

function filterFinanceTab(view, evt) {
    // Update button states
    const buttons = document.querySelectorAll('#finance .filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (evt) evt.currentTarget.classList.add('active');
    
    // Show/hide sections
    document.getElementById('financeOverviewSection').style.display = view === 'overview' ? 'block' : 'none';
    document.getElementById('financeTransactionsSection').style.display = view === 'transactions' ? 'block' : 'none';
    document.getElementById('financeWithdrawalsSection').style.display = view === 'withdrawals' ? 'block' : 'none';
    
    // Render content for the selected view
    if (view === 'overview') {
        calculateFinanceOverview();
    } else if (view === 'transactions') {
        renderFinanceTransactions();
    } else if (view === 'withdrawals') {
        renderWithdrawalHistory();
    }
}

function calculateFinanceOverview() {
    // Calculate total revenue from sales
    let totalRevenue = 0;
    salesHistory.forEach(sale => {
        totalRevenue += parseFloat(sale.total) || 0;
    });
    
    // Calculate total purchases
    let totalPurchases = 0;
    billHistory.forEach(bill => {
        totalPurchases += parseFloat(bill.total) || 0;
    });
    
    // Calculate business and personal expenses
    let businessExpenses = 0;
    let personalExpenses = 0;
    paymentsHistory.forEach(payment => {
        const amount = parseFloat(payment.amount) || 0;
        if (payment.category === 'business') {
            businessExpenses += amount;
        } else if (payment.category === 'personal') {
            personalExpenses += amount;
        }
    });
    
    // Calculate total withdrawals
    let totalWithdrawals = 0;
    withdrawalsHistory.forEach(withdrawal => {
        totalWithdrawals += parseFloat(withdrawal.amount) || 0;
    });
    
    // Calculate profit and balance
    const totalExpenses = businessExpenses + personalExpenses;
    const profit = totalRevenue - totalPurchases - totalExpenses;
    const balance = profit - totalWithdrawals;
    
    // Update stats cards
    document.getElementById('currentBalance').textContent = balance.toFixed(2);
    document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(2);
    document.getElementById('totalProfit').textContent = profit.toFixed(2);
    document.getElementById('businessExpensesTotal').textContent = businessExpenses.toFixed(2);
    document.getElementById('personalExpensesTotal').textContent = personalExpenses.toFixed(2);
    document.getElementById('totalWithdrawals').textContent = totalWithdrawals.toFixed(2);
    
    // Render account breakdown
    renderAccountBreakdown(totalRevenue, totalPurchases, businessExpenses, personalExpenses, totalWithdrawals, balance);
    
    // Render monthly profit chart
    renderMonthlyProfitChart();
}

function renderAccountBreakdown(revenue, purchases, businessExp, personalExp, withdrawals, balance) {
    const tbody = document.querySelector('#accountBreakdownTable tbody');
    tbody.innerHTML = `
        <tr>
            <td>Sales Revenue</td>
            <td style="color: #10b981;">+₹${revenue.toFixed(2)}</td>
        </tr>
        <tr>
            <td>Purchase Costs</td>
            <td style="color: #ef4444;">-₹${purchases.toFixed(2)}</td>
        </tr>
        <tr>
            <td>Business Expenses</td>
            <td style="color: #ef4444;">-₹${businessExp.toFixed(2)}</td>
        </tr>
        <tr>
            <td>Personal Expenses</td>
            <td style="color: #ef4444;">-₹${personalExp.toFixed(2)}</td>
        </tr>
        <tr>
            <td>Withdrawals</td>
            <td style="color: #ef4444;">-₹${withdrawals.toFixed(2)}</td>
        </tr>
        <tr style="border-top: 2px solid #333; font-weight: bold;">
            <td>Current Balance</td>
            <td style="color: ${balance >= 0 ? '#10b981' : '#ef4444'};">₹${balance.toFixed(2)}</td>
        </tr>
    `;
}

function renderMonthlyProfitChart() {
    // Group transactions by month
    const monthlyData = {};
    
    // Process sales
    salesHistory.forEach(sale => {
        const date = new Date(sale.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { revenue: 0, costs: 0 };
        }
        monthlyData[monthKey].revenue += parseFloat(sale.total) || 0;
    });
    
    // Process purchases
    billHistory.forEach(bill => {
        const date = new Date(bill.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { revenue: 0, costs: 0 };
        }
        monthlyData[monthKey].costs += parseFloat(bill.total) || 0;
    });
    
    // Process expenses
    paymentsHistory.forEach(payment => {
        const date = new Date(payment.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { revenue: 0, costs: 0 };
        }
        monthlyData[monthKey].costs += parseFloat(payment.amount) || 0;
    });
    
    // Sort by month and get last 6 months
    const sortedMonths = Object.keys(monthlyData).sort().slice(-6);
    
    // Create simple bar chart HTML
    const chartContainer = document.getElementById('monthlyProfitChart');
    let chartHTML = '<div style="display: flex; align-items: flex-end; justify-content: space-around; height: 200px; padding: 10px;">';
    
    sortedMonths.forEach(month => {
        const data = monthlyData[month];
        const profit = data.revenue - data.costs;
        const maxProfit = Math.max(...sortedMonths.map(m => monthlyData[m].revenue - monthlyData[m].costs));
        const height = maxProfit > 0 ? Math.max(10, (profit / maxProfit) * 180) : 10;
        const color = profit >= 0 ? '#10b981' : '#ef4444';
        const [year, monthNum] = month.split('-');
        const monthName = new Date(year, parseInt(monthNum) - 1).toLocaleString('en', { month: 'short' });
        
        chartHTML += `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="background: ${color}; width: 40px; height: ${height}px; border-radius: 4px 4px 0 0;"></div>
                <div style="font-size: 10px; margin-top: 5px;">${monthName}</div>
                <div style="font-size: 9px; color: #888;">₹${(profit / 1000).toFixed(1)}k</div>
            </div>
        `;
    });
    
    chartHTML += '</div>';
    chartContainer.innerHTML = chartHTML;
}

function renderFinanceTransactions() {
    const container = document.getElementById('allTransactionsList');
    
    // Combine all transactions
    const allTransactions = [];
    
    salesHistory.forEach(sale => {
        allTransactions.push({
            date: new Date(sale.date),
            type: 'Sale',
            description: `Sale to ${sale.customerName}`,
            amount: parseFloat(sale.total),
            isIncome: true,
            id: sale.id
        });
    });
    
    billHistory.forEach(bill => {
        allTransactions.push({
            date: new Date(bill.date),
            type: 'Purchase',
            description: `Purchase from ${bill.customerName}`,
            amount: parseFloat(bill.total),
            isIncome: false,
            id: bill.id
        });
    });
    
    paymentsHistory.forEach(payment => {
        allTransactions.push({
            date: new Date(payment.date),
            type: payment.category === 'business' ? 'Business Expense' : 'Personal Expense',
            description: payment.purpose,
            amount: parseFloat(payment.amount),
            isIncome: false,
            id: payment.id
        });
    });
    
    withdrawalsHistory.forEach(withdrawal => {
        allTransactions.push({
            date: new Date(withdrawal.date),
            type: 'Withdrawal',
            description: `${withdrawal.purpose} (${withdrawal.person})`,
            amount: parseFloat(withdrawal.amount),
            isIncome: false,
            id: withdrawal.id
        });
    });
    
    // Sort by date descending
    allTransactions.sort((a, b) => b.date - a.date);
    
    // Render transactions
    let html = '<div class="history-list">';
    allTransactions.forEach(txn => {
        const dateStr = txn.date.toLocaleDateString('en-IN');
        const amountColor = txn.isIncome ? '#10b981' : '#ef4444';
        const amountSign = txn.isIncome ? '+' : '-';
        
        html += `
            <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #333;">
                <div>
                    <div style="font-weight: 500;">${txn.type}</div>
                    <div style="font-size: 12px; color: #888;">${txn.description}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 2px;">${dateStr}</div>
                </div>
                <div style="font-weight: 600; color: ${amountColor}; font-size: 14px;">
                    ${amountSign}₹${txn.amount.toFixed(2)}
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html || '<p style="color: #888; text-align: center; padding: 20px;">No transactions yet</p>';
}

async function recordWithdrawal() {
    const amount = parseFloat(document.getElementById('withdrawalAmount').value);
    const person = document.getElementById('withdrawalPerson').value.trim();
    const purpose = document.getElementById('withdrawalPurpose').value.trim();
    const date = document.getElementById('withdrawalDate').value;
    
    if (!amount || amount <= 0) {
        showModal('Please enter a valid withdrawal amount');
        return;
    }
    
    if (!person) {
        showModal('Please enter the person name');
        return;
    }
    
    if (!purpose) {
        showModal('Please enter the withdrawal purpose');
        return;
    }
    
    if (!date) {
        showModal('Please select a date');
        return;
    }
    
    try {
        const withdrawal = {
            amount: amount,
            person: person,
            purpose: purpose,
            date: date,
            withdrawnBy: currentUser ? currentUser.uid : 'unknown',
            withdrawnByName: currentUser ? currentUser.name : 'Unknown',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: new Date().toLocaleString('en-IN')
        };
        
        const docRef = await db.collection('withdrawals').add(withdrawal);
        withdrawal.id = docRef.id;
        withdrawal.docId = docRef.id;
        
        withdrawalsHistory.push(withdrawal);
        
        // Clear form
        document.getElementById('withdrawalAmount').value = '';
        document.getElementById('withdrawalPerson').value = '';
        document.getElementById('withdrawalPurpose').value = '';
        document.getElementById('withdrawalDate').value = new Date().toISOString().split('T')[0];
        
        showModal('✓ Withdrawal recorded successfully');
        
        // Update displays
        renderWithdrawalHistory();
        if (document.getElementById('financeOverview').style.display !== 'none') {
            calculateFinanceOverview();
        }
        
        console.log('✓ Withdrawal saved:', withdrawal);
    } catch (error) {
        console.error('Error recording withdrawal:', error);
        showModal('Error recording withdrawal: ' + error.message);
    }
}

function renderWithdrawalHistory() {
    const container = document.getElementById('withdrawalHistoryList');
    
    if (withdrawalsHistory.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No withdrawals recorded yet</p>';
        return;
    }
    
    // Sort by date descending
    const sorted = [...withdrawalsHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let html = '<div class="history-list">';
    sorted.forEach(withdrawal => {
        const date = new Date(withdrawal.date).toLocaleDateString('en-IN');
        
        html += `
            <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #333;">
                <div>
                    <div style="font-weight: 500;">${withdrawal.person}</div>
                    <div style="font-size: 12px; color: #888;">${withdrawal.purpose}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 2px;">${date} • ${withdrawal.withdrawnByName || 'Unknown'}</div>
                </div>
                <div style="font-weight: 600; color: #ef4444; font-size: 14px;">
                    -₹${withdrawal.amount.toFixed(2)}
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

async function loadWithdrawalsFromFirestore() {
    try {
        const snapshot = await db.collection('withdrawals').orderBy('timestamp', 'desc').get();
        withdrawalsHistory = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            withdrawalsHistory.push({
                id: doc.id,
                docId: doc.id,
                ...data
            });
        });
        
        console.log('✓ Loaded', withdrawalsHistory.length, 'withdrawals');
    } catch (error) {
        console.error('Error loading withdrawals:', error);
    }
}

function updateWithdrawalPersonOptions() {
    const datalist = document.getElementById('withdrawalPersonOptions');
    if (!datalist) return;
    
    const people = new Set();
    
    // Add from sales
    salesHistory.forEach(sale => {
        if (sale.customerName) people.add(sale.customerName);
    });
    
    // Add from purchases
    billHistory.forEach(bill => {
        if (bill.customerName) people.add(bill.customerName);
    });
    
    // Add from expenses
    paymentsHistory.forEach(payment => {
        if (payment.person) people.add(payment.person);
    });
    
    // Add from previous withdrawals
    withdrawalsHistory.forEach(withdrawal => {
        if (withdrawal.person) people.add(withdrawal.person);
    });
    
    datalist.innerHTML = Array.from(people).sort().map(name => `<option value="${name}">`).join('');
}

// ========== CONTACT & WHATSAPP FUNCTIONS ==========

async function pickContactNumber() {
    try {
        if (!('contacts' in navigator && 'ContactsManager' in window)) {
            showModal('Contact Picker API is not supported on this device/browser. Please enter the phone number manually.');
            return;
        }
        
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        
        const contacts = await navigator.contacts.select(props, opts);
        
        if (contacts && contacts.length > 0) {
            const contact = contacts[0];
            
            // Set name if available
            if (contact.name && contact.name.length > 0) {
                document.getElementById('customerName').value = contact.name[0];
            }
            
            // Store phone if available
            if (contact.tel && contact.tel.length > 0) {
                customerPhoneNumber = contact.tel[0].replace(/\s+/g, '').replace(/[^\d+]/g, '');
            }
            
            saveBillDraft();
            showToast('✓ Contact selected');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error picking contact:', error);
            showModal('Failed to pick contact: ' + error.message);
        }
    }
}

function shareOnWhatsApp() {
    if (billItems.length === 0) {
        showModal('No items in bill to share');
        return;
    }
    
    const customerName = document.getElementById('customerName').value.trim();
    const comments = document.getElementById('billComments').value.trim();
    
    if (!customerPhoneNumber) {
        showModal('Please select a contact first using the Pick Contact button');
        return;
    }
    
    // Clean phone number
    let phone = customerPhoneNumber.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (phone.startsWith('0')) {
        phone = '91' + phone.substring(1);
    } else if (!phone.startsWith('+') && !phone.startsWith('91')) {
        phone = '91' + phone;
    }
    phone = phone.replace('+', '');
    
    // Build bill message
    const isPurchase = billItems[0].mode === 'purchase';
    const billTotal = Number(document.getElementById('billTotal').textContent);
    const laborCharges = isPurchase ? Number(document.getElementById('manualLaborCharges').value) || 0 : 0;
    const amountPayable = isPurchase ? billTotal - laborCharges : billTotal;
    const onlinePayment = Number(document.getElementById('onlinePayment').value) || 0;
    const cashPayment = Number(document.getElementById('cashPayment').value) || 0;
    const duePayment = Number(document.getElementById('dueAmount').value) || 0;
    
    let message = `*${isPurchase ? 'PURCHASE BILL' : 'SALE BILL'}*\n`;
    if (customerName) {
        message += `Customer: ${customerName}\n`;
    }
    message += `Date: ${new Date().toLocaleString('en-IN')}\n`;
    message += `\n*Items:*\n`;
    
    billItems.forEach((item, index) => {
        const itemObj = items.find(i => i.name === item.name);
        const displayName = (itemObj && itemObj.hindiName) ? itemObj.hindiName : item.name;
        message += `${index + 1}. ${displayName}\n`;
        message += `   Rate: ₹${item.rate}/kg | Qty: ${item.qty}kg | Total: ₹${item.total}\n`;
    });
    
    message += `\n*Bill Total:* ₹${billTotal}\n`;
    
    if (isPurchase && laborCharges > 0) {
        message += `*Labor Charges:* -₹${laborCharges}\n`;
    }
    
    message += `*Amount Payable:* ₹${amountPayable}\n`;
    message += `\n*Payment Details:*\n`;
    
    if (onlinePayment > 0) message += `Online: ₹${onlinePayment}\n`;
    if (cashPayment > 0) message += `Cash: ₹${cashPayment}\n`;
    if (duePayment > 0) message += `Due: ₹${duePayment}\n`;
    
    if (comments) {
        message += `\n*Comments:* ${comments}\n`;
    }
    
    message += `\n_Thank you for your business!_ 🙏`;
    
    // Encode message for URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappURL = `https://wa.me/${phone}?text=${encodedMessage}`;
    
    // Open WhatsApp
    window.open(whatsappURL, '_blank');
    
    hapticFeedback('medium');
    showToast('📱 Opening WhatsApp...');
}

// ========== ANALYTICS FUNCTIONS ==========

let analyticsPeriod = '30days';

function filterAnalyticsTab(view, evt) {
    // Update button states
    const buttons = document.querySelectorAll('#analytics .filter-buttons button');
    buttons.forEach(btn => {
        if (!btn.onclick.toString().includes('setAnalyticsPeriod')) {
            btn.classList.remove('active');
        }
    });
    if (evt) evt.currentTarget.classList.add('active');
    
    // Show/hide sections
    document.getElementById('analyticsOverviewSection').style.display = view === 'overview' ? 'block' : 'none';
    document.getElementById('analyticsSalesSection').style.display = view === 'sales' ? 'block' : 'none';
    document.getElementById('analyticsItemsSection').style.display = view === 'items' ? 'block' : 'none';
    document.getElementById('analyticsCustomersSection').style.display = view === 'customers' ? 'block' : 'none';
    
    // Render content for the selected view
    if (view === 'overview') {
        renderAnalyticsOverview();
    } else if (view === 'sales') {
        renderSalesAnalytics();
    } else if (view === 'items') {
        renderItemsAnalytics();
    } else if (view === 'customers') {
        renderCustomersAnalytics();
    }
}

function setAnalyticsPeriod(period, evt) {
    analyticsPeriod = period;
    
    // Update period button states
    const periodButtons = document.querySelectorAll('#analytics .settings-card:first-child button');
    periodButtons.forEach(btn => btn.classList.remove('active'));
    if (evt) evt.currentTarget.classList.add('active');
    
    // Re-render current view
    const activeSection = document.querySelector('#analytics > div[id$="Section"]:not([style*="display: none"])');
    if (activeSection) {
        const sectionId = activeSection.id;
        if (sectionId === 'analyticsOverviewSection') {
            renderAnalyticsOverview();
        } else if (sectionId === 'analyticsSalesSection') {
            renderSalesAnalytics();
        } else if (sectionId === 'analyticsItemsSection') {
            renderItemsAnalytics();
        } else if (sectionId === 'analyticsCustomersSection') {
            renderCustomersAnalytics();
        }
    }
}

function getFilteredData() {
    let startDate = new Date(0); // Beginning of time
    const now = new Date();
    
    if (analyticsPeriod === '7days') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (analyticsPeriod === '30days') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (analyticsPeriod === '90days') {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }
    
    return {
        sales: salesHistory.filter(s => new Date(s.date) >= startDate),
        bills: billHistory.filter(b => new Date(b.date) >= startDate),
        payments: paymentsHistory.filter(p => new Date(p.date) >= startDate)
    };
}

function renderAnalyticsOverview() {
    const data = getFilteredData();
    
    // Calculate key metrics
    const totalSales = data.sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const totalPurchases = data.bills.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
    const totalExpenses = data.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalProfit = totalSales - totalPurchases - totalExpenses;
    const transactionCount = data.sales.length + data.bills.length;
    const avgTransaction = transactionCount > 0 ? (totalSales + totalPurchases) / transactionCount : 0;
    const profitMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100) : 0;
    
    // Update stats cards
    document.getElementById('analyticsTransactionCount').textContent = transactionCount;
    document.getElementById('analyticsAvgTransaction').textContent = avgTransaction.toFixed(0);
    document.getElementById('analyticsTotalProfit').textContent = totalProfit.toFixed(0);
    document.getElementById('analyticsProfitMargin').textContent = profitMargin.toFixed(1);
    
    // Render daily trends chart
    renderDailyTrendChart(data);
    
    // Render business health scorecard
    renderHealthScorecard(data);
}

function renderDailyTrendChart(data) {
    const dailyData = {};
    
    // Group sales by date
    data.sales.forEach(sale => {
        const date = new Date(sale.date).toLocaleDateString('en-IN');
        if (!dailyData[date]) {
            dailyData[date] = { revenue: 0, costs: 0 };
        }
        dailyData[date].revenue += parseFloat(sale.total) || 0;
    });
    
    // Group purchases by date
    data.bills.forEach(bill => {
        const date = new Date(bill.date).toLocaleDateString('en-IN');
        if (!dailyData[date]) {
            dailyData[date] = { revenue: 0, costs: 0 };
        }
        dailyData[date].costs += parseFloat(bill.total) || 0;
    });
    
    // Group expenses by date
    data.payments.forEach(payment => {
        const date = new Date(payment.date).toLocaleDateString('en-IN');
        if (!dailyData[date]) {
            dailyData[date] = { revenue: 0, costs: 0 };
        }
        dailyData[date].costs += parseFloat(payment.amount) || 0;
    });
    
    // Sort dates
    const sortedDates = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b));
    const displayDates = sortedDates.slice(-14); // Last 14 days
    
    // Find max value for scaling
    const maxValue = Math.max(...displayDates.map(date => Math.max(dailyData[date].revenue, dailyData[date].costs)));
    
    // Render chart
    const chartContainer = document.getElementById('dailyTrendChart');
    let chartHTML = '<div style="display: flex; align-items: flex-end; justify-content: space-around; height: 220px; padding: 10px; gap: 8px; overflow-x: auto;">';
    
    displayDates.forEach(date => {
        const data = dailyData[date];
        const profit = data.revenue - data.costs;
        const revenueHeight = maxValue > 0 ? Math.max(10, (data.revenue / maxValue) * 180) : 10;
        const costsHeight = maxValue > 0 ? Math.max(10, (data.costs / maxValue) * 180) : 10;
        const [day, month] = date.split('/');
        
        chartHTML += `
            <div style="display: flex; flex-direction: column; align-items: center; min-width: 60px;">
                <div style="display: flex; gap: 4px; align-items: flex-end;">
                    <div style="background: #10b981; width: 20px; height: ${revenueHeight}px; border-radius: 4px 4px 0 0;" title="Revenue: ₹${data.revenue.toFixed(0)}"></div>
                    <div style="background: #ef4444; width: 20px; height: ${costsHeight}px; border-radius: 4px 4px 0 0;" title="Costs: ₹${data.costs.toFixed(0)}"></div>
                </div>
                <div style="font-size: 9px; margin-top: 5px; text-align: center;">${day}/${month}</div>
                <div style="font-size: 8px; color: ${profit >= 0 ? '#10b981' : '#ef4444'};">₹${(profit / 1000).toFixed(1)}k</div>
            </div>
        `;
    });
    
    chartHTML += '</div>';
    chartHTML += '<div style="display: flex; gap: 16px; justify-content: center; margin-top: 12px; font-size: 12px;"><span>🟢 Revenue</span><span>🔴 Costs</span></div>';
    chartContainer.innerHTML = chartHTML;
}

function renderHealthScorecard(data) {
    const totalSales = data.sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const totalPurchases = data.bills.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
    const totalExpenses = data.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalProfit = totalSales - totalPurchases - totalExpenses;
    
    // Calculate outstanding amounts
    const outstandingSales = data.sales.filter(s => !s.cleared && s.payment && s.payment.due > 0)
        .reduce((sum, s) => sum + (parseFloat(s.payment.due) || 0), 0);
    const outstandingPurchases = data.bills.filter(b => !b.cleared && b.payment && b.payment.due > 0)
        .reduce((sum, b) => sum + (parseFloat(b.payment.due) || 0), 0);
    
    // Calculate metrics
    const profitMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100) : 0;
    const cashFlow = totalSales - totalPurchases - totalExpenses - withdrawalsHistory.reduce((sum, w) => sum + (parseFloat(w.amount) || 0), 0);
    const uniqueCustomers = new Set(data.sales.filter(s => s.customerName).map(s => s.customerName)).size;
    
    const container = document.getElementById('healthScorecard');
    container.innerHTML = `
        <div style="padding: 16px; background: ${profitMargin > 20 ? '#dcfce7' : profitMargin > 10 ? '#fef3c7' : '#fee2e2'}; border-radius: 8px;">
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Profit Margin</div>
            <div style="font-size: 24px; font-weight: 700; color: ${profitMargin > 20 ? '#16a34a' : profitMargin > 10 ? '#ca8a04' : '#dc2626'};">${profitMargin.toFixed(1)}%</div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">${profitMargin > 20 ? 'Excellent' : profitMargin > 10 ? 'Good' : 'Needs Improvement'}</div>
        </div>
        <div style="padding: 16px; background: ${cashFlow > 0 ? '#dcfce7' : '#fee2e2'}; border-radius: 8px;">
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Cash Flow</div>
            <div style="font-size: 24px; font-weight: 700; color: ${cashFlow > 0 ? '#16a34a' : '#dc2626'};">₹${(cashFlow / 1000).toFixed(1)}k</div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">${cashFlow > 0 ? 'Positive' : 'Negative'}</div>
        </div>
        <div style="padding: 16px; background: #dbeafe; border-radius: 8px;">
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Receivables</div>
            <div style="font-size: 24px; font-weight: 700; color: #2563eb;">₹${(outstandingSales / 1000).toFixed(1)}k</div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">To Collect</div>
        </div>
        <div style="padding: 16px; background: #fce7f3; border-radius: 8px;">
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Payables</div>
            <div style="font-size: 24px; font-weight: 700; color: #db2777;">₹${(outstandingPurchases / 1000).toFixed(1)}k</div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">To Pay</div>
        </div>
        <div style="padding: 16px; background: #e0e7ff; border-radius: 8px;">
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Active Customers</div>
            <div style="font-size: 24px; font-weight: 700; color: #4f46e5;">${uniqueCustomers}</div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">This Period</div>
        </div>
    `;
}

function renderSalesAnalytics() {
    const data = getFilteredData();
    
    const totalSales = data.sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const totalPurchases = data.bills.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
    
    document.getElementById('analyticsTotalSales').textContent = totalSales.toFixed(0);
    document.getElementById('analyticsTotalPurchases').textContent = totalPurchases.toFixed(0);
    document.getElementById('analyticsSalesCount').textContent = data.sales.length;
    document.getElementById('analyticsPurchaseCount').textContent = data.bills.length;
    
    // Render sales vs purchases timeline
    renderSalesPurchasesChart(data);
    
    // Render payment methods breakdown
    renderPaymentMethodsChart(data);
}

function renderSalesPurchasesChart(data) {
    const chartData = {};
    
    data.sales.forEach(sale => {
        const date = new Date(sale.date).toLocaleDateString('en-IN');
        if (!chartData[date]) chartData[date] = { sales: 0, purchases: 0 };
        chartData[date].sales += parseFloat(sale.total) || 0;
    });
    
    data.bills.forEach(bill => {
        const date = new Date(bill.date).toLocaleDateString('en-IN');
        if (!chartData[date]) chartData[date] = { sales: 0, purchases: 0 };
        chartData[date].purchases += parseFloat(bill.total) || 0;
    });
    
    const sortedDates = Object.keys(chartData).sort((a, b) => new Date(a) - new Date(b)).slice(-14);
    const maxValue = Math.max(...sortedDates.map(date => Math.max(chartData[date].sales, chartData[date].purchases)));
    
    const container = document.getElementById('salesPurchasesChart');
    let html = '<div style="display: flex; align-items: flex-end; justify-content: space-around; height: 220px; padding: 10px; gap: 8px; overflow-x: auto;">';
    
    sortedDates.forEach(date => {
        const d = chartData[date];
        const salesHeight = maxValue > 0 ? Math.max(10, (d.sales / maxValue) * 180) : 10;
        const purchasesHeight = maxValue > 0 ? Math.max(10, (d.purchases / maxValue) * 180) : 10;
        const [day, month] = date.split('/');
        
        html += `
            <div style="display: flex; flex-direction: column; align-items: center; min-width: 60px;">
                <div style="display: flex; gap: 4px; align-items: flex-end;">
                    <div style="background: #10b981; width: 20px; height: ${salesHeight}px; border-radius: 4px 4px 0 0;" title="Sales: ₹${d.sales.toFixed(0)}"></div>
                    <div style="background: #f59e0b; width: 20px; height: ${purchasesHeight}px; border-radius: 4px 4px 0 0;" title="Purchases: ₹${d.purchases.toFixed(0)}"></div>
                </div>
                <div style="font-size: 9px; margin-top: 5px;">${day}/${month}</div>
            </div>
        `;
    });
    
    html += '</div>';
    html += '<div style="display: flex; gap: 16px; justify-content: center; margin-top: 12px; font-size: 12px;"><span>🟢 Sales</span><span>🟠 Purchases</span></div>';
    container.innerHTML = html;
}

function renderPaymentMethodsChart(data) {
    let cash = 0, online = 0, due = 0;
    
    data.sales.forEach(sale => {
        if (sale.payment) {
            cash += parseFloat(sale.payment.cash) || 0;
            online += parseFloat(sale.payment.online) || 0;
            due += parseFloat(sale.payment.due) || 0;
        }
    });
    
    data.bills.forEach(bill => {
        if (bill.payment) {
            cash += parseFloat(bill.payment.cash) || 0;
            online += parseFloat(bill.payment.online) || 0;
            due += parseFloat(bill.payment.due) || 0;
        }
    });
    
    const total = cash + online + due;
    const cashPercent = total > 0 ? (cash / total * 100) : 0;
    const onlinePercent = total > 0 ? (online / total * 100) : 0;
    const duePercent = total > 0 ? (due / total * 100) : 0;
    
    const container = document.getElementById('paymentMethodsChart');
    container.innerHTML = `
        <div style="display: flex; gap: 40px; align-items: center; flex-wrap: wrap; justify-content: center;">
            <div style="text-align: center;">
                <div style="width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(
                    #10b981 0deg ${cashPercent * 3.6}deg,
                    #3b82f6 ${cashPercent * 3.6}deg ${(cashPercent + onlinePercent) * 3.6}deg,
                    #ef4444 ${(cashPercent + onlinePercent) * 3.6}deg 360deg
                ); display: flex; align-items: center; justify-content: center; position: relative;">
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: #1a1a1a; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700;">₹${(total / 1000).toFixed(1)}k</div>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 16px; height: 16px; background: #10b981; border-radius: 4px;"></div>
                    <div>
                        <div style="font-size: 12px; color: #888;">Cash</div>
                        <div style="font-size: 16px; font-weight: 600;">₹${(cash / 1000).toFixed(1)}k (${cashPercent.toFixed(1)}%)</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 16px; height: 16px; background: #3b82f6; border-radius: 4px;"></div>
                    <div>
                        <div style="font-size: 12px; color: #888;">Online</div>
                        <div style="font-size: 16px; font-weight: 600;">₹${(online / 1000).toFixed(1)}k (${onlinePercent.toFixed(1)}%)</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 16px; height: 16px; background: #ef4444; border-radius: 4px;"></div>
                    <div>
                        <div style="font-size: 12px; color: #888;">Due</div>
                        <div style="font-size: 16px; font-weight: 600;">₹${(due / 1000).toFixed(1)}k (${duePercent.toFixed(1)}%)</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderItemsAnalytics() {
    const data = getFilteredData();
    
    // Analyze items from sales
    const itemStats = {};
    
    data.sales.forEach(sale => {
        sale.items.forEach(item => {
            if (!itemStats[item.name]) {
                itemStats[item.name] = { 
                    name: item.name, 
                    soldQty: 0, 
                    soldRevenue: 0, 
                    purchasedQty: 0, 
                    purchasedCost: 0 
                };
            }
            itemStats[item.name].soldQty += parseFloat(item.qty) || 0;
            itemStats[item.name].soldRevenue += parseFloat(item.total) || 0;
        });
    });
    
    data.bills.forEach(bill => {
        bill.items.forEach(item => {
            if (!itemStats[item.name]) {
                itemStats[item.name] = { 
                    name: item.name, 
                    soldQty: 0, 
                    soldRevenue: 0, 
                    purchasedQty: 0, 
                    purchasedCost: 0 
                };
            }
            itemStats[item.name].purchasedQty += parseFloat(item.qty) || 0;
            itemStats[item.name].purchasedCost += parseFloat(item.total) || 0;
        });
    });
    
    const itemsArray = Object.values(itemStats);
    
    // Top by revenue
    const topByRevenue = [...itemsArray].sort((a, b) => b.soldRevenue - a.soldRevenue).slice(0, 10);
    renderTopItemsList('topSellingItemsRevenue', topByRevenue, 'revenue');
    
    // Top by quantity
    const topByQty = [...itemsArray].sort((a, b) => b.soldQty - a.soldQty).slice(0, 10);
    renderTopItemsList('topSellingItemsQuantity', topByQty, 'quantity');
    
    // Top purchased
    const topPurchased = [...itemsArray].sort((a, b) => b.purchasedQty - a.purchasedQty).slice(0, 10);
    renderTopItemsList('topPurchasedItems', topPurchased, 'purchased');
    
    // Profitability
    renderItemProfitability(itemsArray);
}

function renderTopItemsList(containerId, items, type) {
    const container = document.getElementById(containerId);
    
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No data available</p>';
        return;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    
    items.forEach((item, index) => {
        const value = type === 'revenue' ? item.soldRevenue : 
                     type === 'quantity' ? item.soldQty : 
                     item.purchasedQty;
        const label = type === 'revenue' ? `₹${value.toFixed(0)}` : 
                     `${value.toFixed(1)}kg`;
        const maxValue = items[0] ? (type === 'revenue' ? items[0].soldRevenue : 
                                     type === 'quantity' ? items[0].soldQty : 
                                     items[0].purchasedQty) : 1;
        const percentage = maxValue > 0 ? (value / maxValue * 100) : 0;
        
        html += `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="min-width: 24px; font-weight: 700; color: ${index < 3 ? '#f59e0b' : '#666'};">${index + 1}</div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 500;">${item.name}</span>
                        <span style="font-weight: 600; color: #10b981;">${label}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function renderItemProfitability(items) {
    const profitableItems = items
        .filter(item => item.soldRevenue > 0 && item.purchasedCost > 0)
        .map(item => ({
            ...item,
            profit: item.soldRevenue - item.purchasedCost,
            margin: ((item.soldRevenue - item.purchasedCost) / item.soldRevenue * 100)
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);
    
    const container = document.getElementById('itemProfitability');
    
    if (profitableItems.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No data available</p>';
        return;
    }
    
    let html = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #2a2a2a; border-bottom: 2px solid #444;">
                    <th style="padding: 12px; text-align: left;">Item</th>
                    <th style="padding: 12px; text-align: right;">Revenue</th>
                    <th style="padding: 12px; text-align: right;">Cost</th>
                    <th style="padding: 12px; text-align: right;">Profit</th>
                    <th style="padding: 12px; text-align: right;">Margin</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    profitableItems.forEach(item => {
        html += `
            <tr style="border-bottom: 1px solid #333;">
                <td style="padding: 12px; font-weight: 500;">${item.name}</td>
                <td style="padding: 12px; text-align: right;">₹${item.soldRevenue.toFixed(0)}</td>
                <td style="padding: 12px; text-align: right;">₹${item.purchasedCost.toFixed(0)}</td>
                <td style="padding: 12px; text-align: right; color: ${item.profit > 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">₹${item.profit.toFixed(0)}</td>
                <td style="padding: 12px; text-align: right; color: ${item.margin > 20 ? '#10b981' : item.margin > 10 ? '#f59e0b' : '#ef4444'}; font-weight: 600;">${item.margin.toFixed(1)}%</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderCustomersAnalytics() {
    const data = getFilteredData();
    
    // Analyze customers
    const customerStats = {};
    
    data.sales.forEach(sale => {
        if (!sale.customerName) return;
        if (!customerStats[sale.customerName]) {
            customerStats[sale.customerName] = {
                name: sale.customerName,
                revenue: 0,
                transactions: 0,
                totalDue: 0,
                clearedTransactions: 0
            };
        }
        customerStats[sale.customerName].revenue += parseFloat(sale.total) || 0;
        customerStats[sale.customerName].transactions++;
        if (sale.payment && sale.payment.due) {
            customerStats[sale.customerName].totalDue += parseFloat(sale.payment.due) || 0;
        }
        if (sale.cleared) {
            customerStats[sale.customerName].clearedTransactions++;
        }
    });
    
    const customersArray = Object.values(customerStats);
    const topCustomers = [...customersArray].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    
    // Render top customers
    renderTopCustomers(topCustomers);
    
    // Analyze suppliers
    const supplierStats = {};
    data.bills.forEach(bill => {
        if (!bill.customerName) return;
        if (!supplierStats[bill.customerName]) {
            supplierStats[bill.customerName] = {
                name: bill.customerName,
                volume: 0,
                transactions: 0
            };
        }
        supplierStats[bill.customerName].volume += parseFloat(bill.total) || 0;
        supplierStats[bill.customerName].transactions++;
    });
    
    const suppliersArray = Object.values(supplierStats);
    const topSuppliers = [...suppliersArray].sort((a, b) => b.volume - a.volume).slice(0, 10);
    renderTopSuppliers(topSuppliers);
    
    // Payment behavior
    renderPaymentBehavior(customersArray);
    
    // Customer activity
    renderCustomerActivity(data, customersArray);
}

function renderTopCustomers(customers) {
    const container = document.getElementById('topCustomersByRevenue');
    
    if (customers.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No customer data available</p>';
        return;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    
    customers.forEach((customer, index) => {
        const maxRevenue = customers[0].revenue;
        const percentage = (customer.revenue / maxRevenue * 100);
        
        html += `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="min-width: 24px; font-weight: 700; color: ${index < 3 ? '#f59e0b' : '#666'};">${index + 1}</div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 500;">${customer.name}</span>
                        <span style="font-weight: 600; color: #10b981;">₹${customer.revenue.toFixed(0)} (${customer.transactions} txns)</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #1d4ed8);"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function renderTopSuppliers(suppliers) {
    const container = document.getElementById('topSuppliersByVolume');
    
    if (suppliers.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No supplier data available</p>';
        return;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    
    suppliers.forEach((supplier, index) => {
        const maxVolume = suppliers[0].volume;
        const percentage = (supplier.volume / maxVolume * 100);
        
        html += `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="min-width: 24px; font-weight: 700; color: ${index < 3 ? '#f59e0b' : '#666'};">${index + 1}</div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 500;">${supplier.name}</span>
                        <span style="font-weight: 600; color: #f59e0b;">₹${supplier.volume.toFixed(0)} (${supplier.transactions} txns)</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #d97706);"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function renderPaymentBehavior(customers) {
    const container = document.getElementById('customerPaymentBehavior');
    
    const onTime = customers.filter(c => c.totalDue === 0).length;
    const pending = customers.filter(c => c.totalDue > 0).length;
    const totalDue = customers.reduce((sum, c) => sum + c.totalDue, 0);
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div style="padding: 20px; background: #dcfce7; border-radius: 8px; text-align: center;">
                <div style="font-size: 32px; font-weight: 700; color: #16a34a;">${onTime}</div>
                <div style="font-size: 14px; color: #15803d; margin-top: 4px;">Cleared Customers</div>
            </div>
            <div style="padding: 20px; background: #fee2e2; border-radius: 8px; text-align: center;">
                <div style="font-size: 32px; font-weight: 700; color: #dc2626;">${pending}</div>
                <div style="font-size: 14px; color: #991b1b; margin-top: 4px;">Pending Payments</div>
            </div>
            <div style="padding: 20px; background: #fef3c7; border-radius: 8px; text-align: center;">
                <div style="font-size: 32px; font-weight: 700; color: #ca8a04;">₹${(totalDue / 1000).toFixed(1)}k</div>
                <div style="font-size: 14px; color: #a16207; margin-top: 4px;">Total Outstanding</div>
            </div>
        </div>
    `;
}

function renderCustomerActivity(data, customers) {
    const container = document.getElementById('customerActivity');
    
    const totalCustomers = customers.length;
    const avgTransactions = totalCustomers > 0 ? (data.sales.length / totalCustomers) : 0;
    const avgRevenue = totalCustomers > 0 ? (customers.reduce((sum, c) => sum + c.revenue, 0) / totalCustomers) : 0;
    
    container.innerHTML = `
        <div style="padding: 16px; background: #1e293b; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">${totalCustomers}</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">Total Customers</div>
        </div>
        <div style="padding: 16px; background: #1e293b; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">${avgTransactions.toFixed(1)}</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">Avg Transactions</div>
        </div>
        <div style="padding: 16px; background: #1e293b; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">₹${(avgRevenue / 1000).toFixed(1)}k</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">Avg Revenue/Customer</div>
        </div>
    `;
}

async function markOutstandingAsCleared(transactionId, transactionType) {
    try {
        const collection = transactionType === 'purchase' ? 'bills' : 'sales';
        
        await db.collection(collection).doc(String(transactionId)).update({
            cleared: true,
            clearedAt: new Date().toLocaleString('en-IN'),
            clearedBy: currentUser ? currentUser.uid : 'unknown',
            clearedByName: currentUser ? currentUser.name : 'Unknown'
        });
        
        // Update local data
        if (transactionType === 'purchase') {
            const bill = billHistory.find(b => String(b.id) === String(transactionId));
            if (bill) {
                bill.cleared = true;
            }
        } else {
            const sale = salesHistory.find(s => String(s.id) === String(transactionId));
            if (sale) {
                sale.cleared = true;
            }
        }
        
        hapticFeedback('light');
        showToast('✓ Outstanding marked as cleared');
        renderDue();
    } catch (error) {
        console.error('Error marking outstanding as cleared:', error);
        showModal('Error: ' + error.message);
    }
}

async function reprintPayment(index) {
    const payment = paymentsHistory[index];
    await printPaymentReceipt(payment);
    showToast('✓ Receipt printed');
}

// Global error handlers for debugging
window.addEventListener('error', function(event) {
    console.error('[GLOBAL ERROR]', event.error);
    console.error('[GLOBAL ERROR] Message:', event.message);
    console.error('[GLOBAL ERROR] Stack:', event.error?.stack);
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
    console.error('[UNHANDLED PROMISE] Stack:', event.reason?.stack);
});

document.addEventListener('DOMContentLoaded', function() {
    console.log('[DEBUG] DOM Content Loaded');
    // Wait for Firebase auth to initialize
    hideLoading();
    
    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
        console.log('=== AUTH STATE CHANGED ===');
        console.log('User:', user ? user.uid : 'null');
        
        if (user) {
            currentUser = user;
            console.log('Calling loadUserDataAndInitialize...');
            loadUserDataAndInitialize();
        } else {
            console.log('No user, showing auth screen');
            // Show auth screen
            document.getElementById('authScreen')?.classList.remove('hidden');
            document.getElementById('appContent')?.classList.add('hidden');
            hideLoading();
        }
    });
    
});

async function loadUserDataAndInitialize() {
    console.log('=== LOAD USER DATA AND INITIALIZE ===');
    showLoading();
    
    try {
        console.log('Loading user document...');
        // Load user role
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        console.log('User doc exists:', userDoc.exists);
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData.role || 'staff';
            userName = userData.name || currentUser.email.split('@')[0];
            console.log('User role:', userRole);
            console.log('User name:', userName);
        } else {
            console.log('Creating new user document...');
            // First time user - create default user document
            userName = currentUser.email.split('@')[0];
            await db.collection('users').doc(currentUser.uid).set({
                email: currentUser.email,
                role: 'owner', // First user is owner
                name: userName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            userRole = 'owner';
            console.log('Created new user with owner role');
        }
        
        console.log('Setting up real-time listeners...');
        // Set up real-time listeners for live sync
        setupRealtimeListeners();
        
        // Initial load of data
        await loadItemsFromFirestore();
        await loadBillsFromFirestore();
        await loadSalesFromFirestore();
        await loadPaymentsFromFirestore();
        await loadStockAdjustmentsFromFirestore();
        await loadWithdrawalsFromFirestore();
        
        // Initialize UI
        renderItems();
        loadItemsDropdown();
        loadSettings();
        updateModeUI();
        renderPaymentsHistory();
        renderSalesHistory();
        renderDue();
        updateCustomerOptions();
        updateExpensePersonOptions();
        updateWithdrawalPersonOptions();
        updateUserDisplay();
        applyRoleBasedRestrictions();
        
        // Restore draft bill if exists
        const draftRestored = restoreBillDraft();
        if (draftRestored) {
            showToast('📋 Draft bill restored');
        }
        
        // Initialize dark mode if enabled
        const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
        if (darkModeEnabled) {
            document.body.classList.add('dark-mode');
        }
        
        // Set today's date as default for custom filter and withdrawal date
        const today = new Date().toISOString().split('T')[0];
        if (document.getElementById('dateTo')) {
            document.getElementById('dateTo').value = today;
        }
        if (document.getElementById('withdrawalDate')) {
            document.getElementById('withdrawalDate').value = today;
        }
        
        // Set billing as default active nav item
        const billingNavLink = document.querySelector('.nav-menu a[onclick*="billing"]');
        if (billingNavLink) {
            billingNavLink.classList.add("active");
        }
        
        console.log('Hiding auth screen and showing app content...');
        // Show app content
        const authScreen = document.getElementById('authScreen');
        const appContent = document.getElementById('appContent');
        
        console.log('Auth screen element:', !!authScreen);
        console.log('App content element:', !!appContent);
        
        if (authScreen) {
            authScreen.classList.add('hidden');
            console.log('Auth screen hidden');
        }
        
        if (appContent) {
            appContent.classList.remove('hidden');
            console.log('App content shown');
        }
        
        hideLoading();
        console.log('=== INITIALIZATION COMPLETE ===');
    } catch (error) {
        console.error('=== ERROR LOADING DATA ===');
        console.error('Error loading data:', error);
        hideLoading();
        await showModal('Failed to load data. Please try again.');
    }
}

// Warn before leaving page with unsaved bill
window.addEventListener('beforeunload', function(e) {
    if (billItems.length > 0 || currentWeights.length > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved items in your bill. Are you sure you want to leave?';
        return e.returnValue;
    }
});

// -------------------- USER MANAGEMENT --------------------

// Load and display users
async function loadUsers() {
    if (userRole !== 'owner') return;
    
    try {
        const usersSnapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        
        const pendingUsers = [];
        const activeUsers = [];
        
        usersSnapshot.forEach(doc => {
            const userData = { id: doc.id, ...doc.data() };
            if (userData.status === 'pending' || !userData.role) {
                pendingUsers.push(userData);
            } else {
                activeUsers.push(userData);
            }
        });
        
        renderPendingUsers(pendingUsers);
        renderActiveUsers(activeUsers);
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Failed to load users');
    }
}

function renderPendingUsers(users) {
    const container = document.getElementById('pendingUsersList');
    if (!container) return;
    
    if (users.length === 0) {
        container.innerHTML = '<p style="color: #666; padding: 16px; text-align: center;">No pending registrations</p>';
        return;
    }
    
    container.innerHTML = users.map(user => `
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
            <div style="margin-bottom: 12px;">
                <strong style="font-size: 16px;">${escapeHtml(user.name)}</strong>
                <p style="color: #666; margin: 4px 0;">${escapeHtml(user.email)}</p>
                <p style="color: #999; font-size: 12px;">Registered: ${user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString() : 'Recently'}</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button onclick="approveUser('${user.id}', 'owner')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    👑 Owner
                </button>
                <button onclick="approveUser('${user.id}', 'manager')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #764ba2; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    👔 Manager
                </button>
                <button onclick="approveUser('${user.id}', 'staff')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #48bb78; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    👤 Staff
                </button>
                <button onclick="rejectUser('${user.id}')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #f56565; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    ❌ Reject
                </button>
            </div>
        </div>
    `).join('');
}

function renderActiveUsers(users) {
    const container = document.getElementById('activeUsersList');
    if (!container) return;
    
    container.innerHTML = users.map(user => {
        const roleColors = {
            owner: '#667eea',
            manager: '#764ba2',
            staff: '#48bb78'
        };
        const roleIcons = {
            owner: '👑',
            manager: '👔',
            staff: '👤'
        };
        
        return `
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <strong style="font-size: 16px;">${escapeHtml(user.name)}</strong>
                        <p style="color: #666; margin: 4px 0;">${escapeHtml(user.email)}</p>
                        <span style="display: inline-block; padding: 4px 12px; background: ${roleColors[user.role]}; color: white; border-radius: 12px; font-size: 12px; margin-top: 4px;">
                            ${roleIcons[user.role]} ${user.role.toUpperCase()}
                        </span>
                    </div>
                    ${user.id !== currentUser.uid ? `
                        <button onclick="showChangeRoleDialog('${user.id}', '${user.name}', '${user.role}')" style="padding: 6px 12px; background: #f7fafc; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer;">
                            Edit
                        </button>
                    ` : '<span style="color: #999; font-size: 12px; padding: 8px;">(You)</span>'}
                </div>
            </div>
        `;
    }).join('');
}

window.approveUser = async function(userId, role) {
    try {
        await db.collection('users').doc(userId).update({
            role: role,
            status: 'active',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hapticFeedback('medium');
        showToast(`User approved as ${role}`);
        loadUsers();
    } catch (error) {
        console.error('Error approving user:', error);
        showModal('Failed to approve user');
    }
};

window.rejectUser = async function(userId) {
    const confirmed = await showConfirmModal('Are you sure you want to reject this registration?');
    if (!confirmed) return;
    
    try {
        await db.collection('users').doc(userId).delete();
        
        hapticFeedback('light');
        showToast('Registration rejected');
        loadUsers();
    } catch (error) {
        console.error('Error rejecting user:', error);
        showModal('Failed to reject user');
    }
};

window.showChangeRoleDialog = async function(userId, userName, currentRole) {
    const roles = ['owner', 'manager', 'staff'];
    const roleOptions = roles.map(r => 
        `<option value="${r}" ${r === currentRole ? 'selected' : ''}>${r.toUpperCase()}</option>`
    ).join('');
    
    const html = `
        <div style="text-align: left;">
            <p style="margin-bottom: 16px;">Change role for <strong>${escapeHtml(userName)}</strong></p>
            <select id="newRoleSelect" style="width: 100%; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 16px;">
                ${roleOptions}
            </select>
        </div>
    `;
    
    const result = await showCustomModal(html, [
        { text: 'Cancel', value: null },
        { text: 'Change Role', value: 'change', primary: true }
    ]);
    
    if (result && result.selectedRole) {
        const newRole = result.selectedRole;
        if (newRole !== currentRole) {
            await changeUserRole(userId, newRole);
        }
    }
};

async function changeUserRole(userId, newRole) {
    try {
        await db.collection('users').doc(userId).update({
            role: newRole,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hapticFeedback('medium');
        showToast(`Role updated to ${newRole}`);
        loadUsers();
    } catch (error) {
        console.error('Error changing role:', error);
        showModal('Failed to change role');
    }
}

// Show custom modal with buttons
function showCustomModal(html, buttons) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        
        const content = document.createElement('div');
        content.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2);';
        content.innerHTML = html;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 12px; margin-top: 20px;';
        
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.text;
            button.style.cssText = `flex: 1; padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; ${
                btn.primary ? 'background: #667eea; color: white;' : 'background: #f7fafc; color: #333;'
            }`;
            button.onclick = () => {
                // Capture select value before removing modal
                const selectElement = document.getElementById('newRoleSelect');
                const selectedRole = selectElement ? selectElement.value : null;
                
                document.body.removeChild(modal);
                
                // Return object with both the button value and selected role
                if (btn.value === 'change' && selectedRole) {
                    resolve({ ...btn, selectedRole });
                } else {
                    resolve(btn.value);
                }
            };
            buttonContainer.appendChild(button);
        });
        
        content.appendChild(buttonContainer);
        modal.appendChild(content);
        document.body.appendChild(modal);
    });
}

// Load users when Users tab is shown
const originalShowTabFromNav = showTabFromNav;
window.showTabFromNav = function(tabId, event) {
    originalShowTabFromNav(tabId, event);
    if (tabId === 'users' && userRole === 'owner') {
        loadUsers();
    } else if (tabId === 'due') {
        renderDue();
    }
};

window.filterDue = filterDue;
window.filterSalesTab = filterSalesTab;
window.markSaleAsCleared = markSaleAsCleared;
window.recordPayment = recordPayment;
window.filterExpenseTab = filterExpenseTab;
window.saveBusinessExpense = saveBusinessExpense;
window.savePersonalExpense = savePersonalExpense;
window.saveAndPrintBusinessExpense = saveAndPrintBusinessExpense;
window.saveAndPrintPersonalExpense = saveAndPrintPersonalExpense;
window.markOutstandingAsCleared = markOutstandingAsCleared;
window.showOutstandingDetails = showOutstandingDetails;
window.reprintBill = reprintBill;
window.reprintSale = reprintSale;
window.closeBillDetails = closeBillDetails;
window.editBillDetails = editBillDetails;
window.filterFinanceTab = filterFinanceTab;
window.recordWithdrawal = recordWithdrawal;
window.filterAnalyticsTab = filterAnalyticsTab;
window.setAnalyticsPeriod = setAnalyticsPeriod;
window.pickContactNumber = pickContactNumber;
window.shareOnWhatsApp = shareOnWhatsApp;

function filterStockTab(view, evt) {
    // Update button states
    const buttons = document.querySelectorAll('#stock .filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (evt) evt.target.classList.add('active');
    
    // Show/hide sections
    const currentSection = document.getElementById('currentStockSection');
    const adjustmentSection = document.getElementById('stockAdjustmentSection');
    
    if (view === 'current') {
        currentSection.style.display = 'block';
        adjustmentSection.style.display = 'none';
    } else {
        currentSection.style.display = 'none';
        adjustmentSection.style.display = 'block';
    }
}

window.filterStockTab = filterStockTab;

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// -------------------- EXCEL IMPORT/EXPORT FOR ITEMS --------------------

window.exportItemsToExcel = async function() {
    try {
        if (items.length === 0) {
            await showModal('No items to export');
            return;
        }
        
        console.log('Exporting items:', items.length);
        
        // Prepare data for export
        const exportData = items.map(item => {
            // Handle multiple rates as comma-separated values
            const purchaseRates = (item.rates && item.rates.length > 0) 
                ? item.rates.join(', ') 
                : '';
            const saleRates = (item.saleRates && item.saleRates.length > 0) 
                ? item.saleRates.join(', ') 
                : '';
            
            console.log('Item:', item.name, 'Purchase Rates:', purchaseRates, 'Sale Rates:', saleRates);
            
            return {
                'Item Name': item.name || '',
                'Hindi Name': item.hindiName || '',
                'Purchase Rates': purchaseRates,
                'Sale Rates': saleRates
            };
        });
        
        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Set column widths
        ws['!cols'] = [
            { wch: 25 }, // Item Name
            { wch: 25 }, // Hindi Name
            { wch: 20 }, // Purchase Rates (wider for comma-separated)
            { wch: 20 }  // Sale Rates (wider for comma-separated)
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Items');
        
        // Generate filename with current date
        const date = new Date().toISOString().split('T')[0];
        const filename = `Items_${date}.xlsx`;
        
        // Download file
        XLSX.writeFile(wb, filename);
        
        hapticFeedback('medium');
        showToast(`✓ Exported ${items.length} items to ${filename}`);
        console.log('Export completed:', filename);
    } catch (error) {
        console.error('Error exporting items:', error);
        await showModal('Failed to export items to Excel');
    }
};

window.importItemsFromExcel = async function(event) {
    console.log('=== IMPORT STARTED ===');
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    
    console.log('File:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    try {
        showLoading();
        
        console.log('Reading file...');
        const data = await file.arrayBuffer();
        console.log('File read, size:', data.byteLength);
        
        console.log('Parsing Excel...');
        const workbook = XLSX.read(data);
        console.log('Sheets found:', workbook.SheetNames);
        
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        console.log('Rows found:', jsonData.length);
        console.log('First row:', jsonData[0]);
        
        if (jsonData.length === 0) {
            hideLoading();
            await showModal('No data found in Excel file');
            event.target.value = ''; // Reset file input
            return;
        }
        
        // Validate and prepare items
        const newItems = [];
        const errors = [];
        const seenNames = new Set(); // Track seen item names to prevent duplicates
        
        jsonData.forEach((row, index) => {
            const rowNum = index + 2; // Excel row number (1-indexed + header)
            
            console.log(`Row ${rowNum}:`, row);
            
            // Check required fields
            const itemName = row['Item Name'] || row['item name'] || row['Name'] || row['name'];
            
            if (!itemName || itemName.toString().trim() === '') {
                console.log(`Row ${rowNum}: Missing or empty item name, skipping`);
                return; // Skip empty rows
            }
            
            const trimmedName = itemName.toString().trim();
            const nameLower = trimmedName.toLowerCase();
            
            // Check for duplicates in the Excel file
            if (seenNames.has(nameLower)) {
                console.log(`Row ${rowNum}: Duplicate item "${trimmedName}", skipping`);
                errors.push(`Row ${rowNum}: Duplicate item "${trimmedName}" - only first occurrence will be imported`);
                return;
            }
            seenNames.add(nameLower);
            
            const hindiName = (row['Hindi Name'] || row['hindi name'] || row['HindiName'] || '').toString().trim();
            
            // Parse purchase rates (comma-separated or single value)
            const purchaseRatesStr = (row['Purchase Rates'] || row['purchase rates'] || row['Purchase Rate'] || row['purchase rate'] || row['Rate'] || row['rate'] || '').toString().trim();
            let purchaseRates = [];
            if (purchaseRatesStr) {
                purchaseRates = purchaseRatesStr
                    .split(',')
                    .map(r => parseFloat(r.trim()))
                    .filter(r => !isNaN(r) && r > 0);
            }
            
            // Parse sale rates (comma-separated or single value)
            const saleRatesStr = (row['Sale Rates'] || row['sale rates'] || row['Sale Rate'] || row['sale rate'] || row['SaleRate'] || '').toString().trim();
            let saleRates = [];
            if (saleRatesStr) {
                saleRates = saleRatesStr
                    .split(',')
                    .map(r => parseFloat(r.trim()))
                    .filter(r => !isNaN(r) && r > 0);
            }
            
            console.log(`  Item: ${trimmedName}, Hindi: ${hindiName}, Purchase Rates:`, purchaseRates, 'Sale Rates:', saleRates);
            
            // Add item to import list
            newItems.push({
                name: trimmedName,
                hindiName: hindiName,
                rates: purchaseRates,
                saleRates: saleRates
            });
        });
        
        if (newItems.length === 0) {
            hideLoading();
            await showModal('No valid items found in Excel file');
            event.target.value = '';
            return;
        }
        
        if (errors.length > 0) {
            console.warn('Import warnings:', errors);
            // Show warnings but continue with import
        }
        
        // Confirm import - this will replace all existing items
        console.log('Prepared items:', newItems.length);
        
        // Hide loading before showing modal so user can see it
        hideLoading();
        
        const confirmed = await showModal(
            `Replace all existing items with ${newItems.length} items from Excel?\n\n` +
            `⚠️ This will delete all current items!\n\n` +
            `Continue?`,
            'Confirm Import',
            true
        );
        
        console.log('User confirmed:', confirmed);
        
        // Show loading again for the import process
        if (confirmed) {
            showLoading();
        }
        
        if (!confirmed) {
            hideLoading();
            event.target.value = '';
            return;
        }
        
        console.log('Starting Firestore import...');
        console.log('Deleting existing items...');
        
        // Delete all existing items
        const existingItemsSnapshot = await db.collection('items').get();
        const deletePromises = existingItemsSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deletePromises);
        console.log('Deleted', existingItemsSnapshot.size, 'existing items');
        
        // Import new items
        let imported = 0;
        
        for (const item of newItems) {
            console.log('Adding item:', item.name, 'rates:', item.rates, 'saleRates:', item.saleRates);
            // Add new item with proper structure (rates and saleRates as arrays)
            await db.collection('items').add({
                name: item.name,
                hindiName: item.hindiName,
                rates: item.rates || [],
                saleRates: item.saleRates || [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            imported++;
            console.log('Added:', item.name);
        }
        
        console.log('Reloading items from Firestore...');
        // Reload items from Firestore
        await loadItemsFromFirestore();
        renderItems();
        loadItemsDropdown();
        
        hideLoading();
        hapticFeedback('heavy');
        showToast(`✓ Replaced all items with ${imported} items from Excel`);
        console.log('=== IMPORT COMPLETED ===');
        
    } catch (error) {
        hideLoading();
        console.error('=== IMPORT ERROR ===');
        console.error('Error:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        await showModal(`Failed to import items:\n${error.message}`);
    }
    
    // Reset file input
    event.target.value = '';
    console.log('=== IMPORT ENDED ===');
};
