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
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        await showModal('Please enter both email and password');
        return;
    }
    
    showLoading();
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        hapticFeedback('medium');
        showToast('Login successful!');
    } catch (error) {
        hideLoading();
        let message = 'Login failed. Please try again.';
        if (error.code === 'auth/user-not-found') {
            message = 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            message = 'Incorrect password.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email address.';
        }
        await showModal(message);
    }
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
        
        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            role: 'owner', // First user is owner, subsequent users can be assigned roles
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
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
        document.getElementById('userEmail').textContent = currentUser.email;
        document.getElementById('userRoleDisplay').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }
}

// Apply role-based UI restrictions
function applyRoleBasedRestrictions() {
    console.log('Applying role-based restrictions for:', userRole);
    
    // Staff role restrictions
    if (userRole === 'staff') {
        // Hide Items tab
        const itemsNav = document.querySelector('.nav-menu a[onclick*="items"]');
        if (itemsNav) itemsNav.style.display = 'none';
        
        // Hide Configure tab
        const configNav = document.querySelector('.nav-menu a[onclick*="configure"]');
        if (configNav) configNav.style.display = 'none';
    }
    
    // Manager and Staff: Hide clear data button
    if (userRole !== 'owner') {
        const clearDataBtn = document.querySelector('button[onclick*="clearAllData"]');
        if (clearDataBtn) clearDataBtn.style.display = 'none';
    }
    
    console.log('Role restrictions applied');
}

// AI Chatbot Integration
function initChatbot() {
    // Add chatbot button
    const chatbotBtn = document.createElement('button');
    chatbotBtn.id = 'chatbot-btn';
    chatbotBtn.innerHTML = '💬';
    chatbotBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        font-size: 28px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        z-index: 9999;
        transition: all 0.3s;
    `;
    chatbotBtn.onmouseover = () => chatbotBtn.style.transform = 'scale(1.1)';
    chatbotBtn.onmouseout = () => chatbotBtn.style.transform = 'scale(1)';
    chatbotBtn.onclick = toggleChatbot;
    document.body.appendChild(chatbotBtn);
    
    // Add chatbot window
    const chatWindow = document.createElement('div');
    chatWindow.id = 'chatbot-window';
    chatWindow.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 350px;
        height: 500px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        z-index: 9998;
    `;
    
    chatWindow.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white;">
            <h3 style="margin: 0; font-size: 18px;">🤖 Aadhat Assistant</h3>
            <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;">Ask me anything about your business</p>
        </div>
        <div id="chatbot-messages" style="flex: 1; overflow-y: auto; padding: 16px; background: #f8f9fa;">
            <div class="bot-message" style="background: white; padding: 10px 14px; border-radius: 18px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                👋 Hi! I'm your Aadhat Assistant. I can help you with:
                <br>• Checking stock levels
                <br>• Viewing sales reports
                <br>• Finding customer information
                <br>• Billing questions
                <br><br>What would you like to know?
            </div>
        </div>
        <div style="padding: 12px; border-top: 1px solid #dee2e6; background: white;">
            <div style="display: flex; gap: 8px;">
                <input type="text" id="chatbot-input" placeholder="Type your question..." 
                    style="flex: 1; padding: 10px; border: 2px solid #dee2e6; border-radius: 20px; font-size: 14px;"
                    onkeypress="if(event.key==='Enter') sendChatMessage()">
                <button onclick="sendChatMessage()" 
                    style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: 600;">Send</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(chatWindow);
}

function toggleChatbot() {
    const chatWindow = document.getElementById('chatbot-window');
    if (chatWindow.style.display === 'none' || !chatWindow.style.display) {
        chatWindow.style.display = 'flex';
    } else {
        chatWindow.style.display = 'none';
    }
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();
    if (!message) return;
    
    const messagesDiv = document.getElementById('chatbot-messages');
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.textContent = message;
    userMsg.style.cssText = 'background: #667eea; color: white; padding: 10px 14px; border-radius: 18px; margin-bottom: 10px; max-width: 70%; margin-left: auto; text-align: right;';
    messagesDiv.appendChild(userMsg);
    
    input.value = '';
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Process message
    const response = await processChatMessage(message.toLowerCase());
    
    // Add bot response
    setTimeout(() => {
        const botMsg = document.createElement('div');
        botMsg.innerHTML = response;
        botMsg.style.cssText = 'background: white; padding: 10px 14px; border-radius: 18px; margin-bottom: 10px; max-width: 70%; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
        messagesDiv.appendChild(botMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 500);
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
    const docRef = await db.collection('bills').add({
        ...bill,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid,
        createdByName: userName
    });
    bill.id = docRef.id;
    return bill;
}

// Load sales from Firestore
async function loadSalesFromFirestore() {
    const snapshot = await db.collection('sales').orderBy('date', 'desc').get();
    salesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Save sale to Firestore
async function saveSaleToFirestore(sale) {
    const docRef = await db.collection('sales').add({
        ...sale,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid,
        createdByName: userName
    });
    sale.id = docRef.id;
    return sale;
}

// Load payments from Firestore
async function loadPaymentsFromFirestore() {
    const snapshot = await db.collection('payments').orderBy('date', 'desc').get();
    paymentsHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
                stock[item.name].quantity -= item.qty;
            }
        });
    });
    
    // Apply adjustments
    stockAdjustments.forEach(adj => {
        if (stock[adj.itemName]) {
            stock[adj.itemName].quantity = adj.newQuantity;
        }
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
let currentDateFilter = 'today';
let customDateRange = { from: null, to: null };
let transactionMode = 'purchase'; // 'purchase' or 'sale'
let reportFilters = { transaction: 'all', item: 'all', customer: 'all' };

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
        this.characteristic = null;
    }

    async scanDevices() {
        try {
            if (!window.Capacitor || !window.Capacitor.Plugins.BluetoothLe) {
                throw new Error('Bluetooth plugin not available');
            }

            const { BluetoothLe } = window.Capacitor.Plugins;
            
            // Request location permission (required for Bluetooth on Android)
            await BluetoothLe.initialize();
            
            showLoading();
            const devices = await BluetoothLe.requestDevice({
                services: [], // Empty to see all devices
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // Common printer service
            });
            
            hideLoading();
            return devices;
        } catch (error) {
            hideLoading();
            console.error('Bluetooth scan error:', error);
            throw error;
        }
    }

    async connect(deviceId) {
        try {
            if (!window.Capacitor || !window.Capacitor.Plugins.BluetoothLe) {
                throw new Error('Bluetooth plugin not available');
            }

            const { BluetoothLe } = window.Capacitor.Plugins;
            
            showLoading();
            await BluetoothLe.connect({ deviceId });
            
            // Discover services
            const services = await BluetoothLe.getServices({ deviceId });
            
            // Find printer service and characteristic
            // Common UUIDs for thermal printers
            const printerServiceUUIDs = [
                '000018f0-0000-1000-8000-00805f9b34fb',
                '49535343-fe7d-4ae5-8fa9-9fafd205e455'
            ];
            
            const printerCharacteristicUUIDs = [
                '00002af1-0000-1000-8000-00805f9b34fb',
                '49535343-8841-43f4-a8d4-ecbe34729bb3'
            ];

            let foundService = null;
            let foundCharacteristic = null;

            for (const service of services.services) {
                if (printerServiceUUIDs.includes(service.uuid.toLowerCase())) {
                    foundService = service;
                    const characteristics = await BluetoothLe.getCharacteristics({
                        deviceId,
                        service: service.uuid
                    });
                    
                    for (const char of characteristics.characteristics) {
                        if (printerCharacteristicUUIDs.includes(char.uuid.toLowerCase()) ||
                            char.properties.write || char.properties.writeWithoutResponse) {
                            foundCharacteristic = char;
                            break;
                        }
                    }
                    break;
                }
            }

            if (!foundCharacteristic) {
                // Try to find any writable characteristic
                for (const service of services.services) {
                    const characteristics = await BluetoothLe.getCharacteristics({
                        deviceId,
                        service: service.uuid
                    });
                    
                    for (const char of characteristics.characteristics) {
                        if (char.properties.write || char.properties.writeWithoutResponse) {
                            foundService = service;
                            foundCharacteristic = char;
                            break;
                        }
                    }
                    if (foundCharacteristic) break;
                }
            }

            if (!foundCharacteristic) {
                throw new Error('No writable characteristic found on printer');
            }

            this.device = deviceId;
            this.characteristic = {
                service: foundService.uuid,
                characteristic: foundCharacteristic.uuid
            };
            
            connectedPrinter = this;
            hideLoading();
            return true;
        } catch (error) {
            hideLoading();
            console.error('Bluetooth connect error:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.device && window.Capacitor && window.Capacitor.Plugins.BluetoothLe) {
            try {
                const { BluetoothLe } = window.Capacitor.Plugins;
                await BluetoothLe.disconnect({ deviceId: this.device });
                this.device = null;
                this.characteristic = null;
                connectedPrinter = null;
            } catch (error) {
                console.error('Disconnect error:', error);
            }
        }
    }

    async write(data) {
        if (!this.device || !this.characteristic) {
            throw new Error('Printer not connected');
        }

        try {
            const { BluetoothLe } = window.Capacitor.Plugins;
            
            // Convert string to byte array
            const bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                bytes[i] = data.charCodeAt(i);
            }
            
            // Convert to base64 for transmission
            const base64 = btoa(String.fromCharCode.apply(null, bytes));
            
            await BluetoothLe.write({
                deviceId: this.device,
                service: this.characteristic.service,
                characteristic: this.characteristic.characteristic,
                value: base64
            });
            
            return true;
        } catch (error) {
            console.error('Write error:', error);
            throw error;
        }
    }
}

const printerManager = new BluetoothPrinterManager();

// ESC/POS Print Commands Generator
function generateESCPOS(billData) {
    let commands = '';
    
    // Initialize printer
    commands += ESC + '@'; // Initialize
    commands += ESC + 'a' + '\x01'; // Center align
    
    // Title - Large and bold
    commands += ESC + '!' + '\x30'; // Double height + double width
    commands += billData.isPurchase ? 'PURCHASE RECEIPT\n' : 'SALE RECEIPT\n';
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

// Pull to refresh
let pullStartY = 0;
let isPulling = false;

function initPullToRefresh() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('touchstart', (e) => {
            if (tab.scrollTop === 0) {
                pullStartY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });
        
        tab.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            
            const pullDistance = e.touches[0].clientY - pullStartY;
            
            if (pullDistance > 80 && tab.scrollTop === 0) {
                hapticFeedback('medium');
                isPulling = false;
                refreshCurrentTab();
            }
        }, { passive: true });
        
        tab.addEventListener('touchend', () => {
            isPulling = false;
        }, { passive: true });
    });
}

function refreshCurrentTab() {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;
    
    showLoading();
    
    setTimeout(() => {
        const tabId = activeTab.id;
        
        if (tabId === 'history') renderHistory();
        else if (tabId === 'reports') renderReports();
        else if (tabId === 'stock') renderStock();
        else if (tabId === 'items') renderItems();
        else if (tabId === 'sales') renderSalesBill();
        else if (tabId === 'payments') renderPaymentsHistory();
        
        hideLoading();
        hapticFeedback('light');
    }, 500);
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
    const totalPayment = onlinePayment + cashPayment;
    const customerName = document.getElementById("customerName").value.trim();

    // Update customer options
    if (customerName) {
        updateCustomerOptions(customerName);
    }

    const bill = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        customerName: customerName,
        items: [...billItems], // Full item details with weights
        laborCharges: laborCharges,
        billTotal: billTotal,
        total: amountPayable,
        payment: {
            online: onlinePayment,
            cash: cashPayment,
            total: totalPayment
        },
        type: 'purchase'
    };

    await saveBillToFirestore(bill);
    billHistory.unshift(bill);
    await calculateStockFromBills();
    
    // Clear current bill - set payment fields to empty
    billItems = [];
    document.getElementById("manualLaborCharges").value = 0;
    document.getElementById("onlinePayment").value = "";
    document.getElementById("cashPayment").value = "";
    document.getElementById("onlineCheckbox").checked = false;
    document.getElementById("cashCheckbox").checked = false;
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
    
    // Clear customer name
    document.getElementById("customerName").value = "";
    
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

function renderHistory() {
    const container = document.getElementById("historyList");
    
    if (billHistory.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No billing history yet</p>';
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
        const paymentHTML = bill.payment ? `
            <div class="history-payment">
                ${bill.payment.online > 0 ? `Online: ₹${bill.payment.online}` : ''}
                ${bill.payment.online > 0 && bill.payment.cash > 0 ? ' | ' : ''}
                ${bill.payment.cash > 0 ? `Cash: ₹${bill.payment.cash}` : ''}
                ${bill.payment.total > 0 ? ` = Total Payment: ₹${bill.payment.total}` : ''}
            </div>
        ` : '';
        
        div.innerHTML = `
            <div class="history-header">
                <span>Bill #${bill.id}</span>
                <span style="color: #28a745; font-weight: 700;">₹ ${bill.total}</span>
            </div>
            <div class="history-date">${bill.date}</div>
            <div class="history-summary">
                ${bill.items.length} items • ${totalPackets} packets • ${totalWeight}kg
            </div>
            ${bill.laborCharges > 0 ? `<div class="history-labor">Labor Charges: ₹${bill.laborCharges}</div>` : ''}
            ${paymentHTML}
            <div class="history-items-detail">
                ${itemsDetailHTML}
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

    // Load items that have stock
    Object.keys(stock).forEach(itemName => {
        if (stock[itemName].quantity > 0) {
            const opt = document.createElement("option");
            opt.value = itemName;
            opt.textContent = itemName;
            select.appendChild(opt);
        }
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
    
    // Reduce stock for each item
    const saleRecord = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        items: [...salesItems],
        total: Number(document.getElementById("salesTotalAmount").textContent)
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
    await saveSaleToFirestore(saleRecord);
    salesHistory.unshift(saleRecord);
    await calculateStockFromBills();
    
    // Clear sales bill
    salesItems = [];
    renderSalesBill();
    renderStock();
    loadSellItemDropdown();
    
    await showModal(`Sale completed! Total: ₹${saleRecord.total}`, "Success");
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
    
    return bills.filter(bill => {
        const billDate = new Date(bill.date);
        
        switch(currentDateFilter) {
            case 'today':
                return billDate.toDateString() === now.toDateString();
            
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
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

    document.getElementById("totalSales").textContent = totalSales;
    document.getElementById("totalBills").textContent = totalBills;
    document.getElementById("totalLabour").textContent = totalLabour;
    document.getElementById("totalCash").textContent = totalCash;
    document.getElementById("totalOnline").textContent = totalOnline;
    document.getElementById("totalPaymentReport").textContent = totalPayment;

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
        const saleRatesHTML = (item.saleRates || []).map((rate, rIndex) => `
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

// Load sale items dropdown (items with stock)
function loadSaleItemsDropdown() {
    const select = document.getElementById("billItem");
    if (!select) return;
    
    select.innerHTML = '';

    // Load items that have stock
    const stockItems = Object.keys(stock).filter(itemName => stock[itemName].quantity > 0);
    
    stockItems.forEach(itemName => {
        const opt = document.createElement("option");
        opt.value = itemName;
        const item = items.find(i => i.name === itemName);
        const displayName = (settings.showHindi && item && item.hindiName) ? item.hindiName : itemName;
        opt.textContent = displayName;
        select.appendChild(opt);
    });
    
    // Select most frequent sold item by default
    if (stockItems.length > 0) {
        const mostFrequent = getMostFrequentItem('sale');
        if (mostFrequent && stock[mostFrequent] && stock[mostFrequent].quantity > 0) {
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
    showToast(`Added ${weight}kg`);
    weightInput.value = "";
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
async function addToBill() {
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

        billItems.push({
            name: itemName,
            rate,
            qty: totalQty,
            weights: [...currentWeights],
            packets: currentWeights.length,
            total: Math.round(rate * totalQty),
            mode: 'sale'
        });
    } else {
        // Purchase mode
        let item = items[itemIndex];
        const heavyPackets = currentWeights.filter(w => w > settings.heavyWeightThreshold).length;

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

    hapticFeedback('medium');
    renderBill();
    clearWeights();
    updateTotals();
    
    const itemName = transactionMode === 'sale' ? itemIndex : items[itemIndex].name;
    showToast(`Added ${itemName} to bill`);
    
    // Reset selection
    document.getElementById("billItem").value = "";
    document.getElementById("billRate").value = "";
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

        // Format weights display - show formula for multiple weights, just total for single weight
        let weightsDisplay = '';
        if (b.weights) {
            if (b.weights.length === 1) {
                weightsDisplay = `<strong>${b.qty}kg</strong>`;
            } else {
                weightsDisplay = b.weights.join('+') + ` = <strong>${b.qty}kg</strong>`;
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
    const onlinePayment = document.getElementById('onlinePayment');
    const cashPayment = document.getElementById('cashPayment');
    const amountPayable = Number(document.getElementById('amountPayable').textContent) || 0;

    if (type === 'online') {
        if (onlineCheckbox.checked) {
            cashCheckbox.checked = false;
            onlinePayment.value = amountPayable;
            cashPayment.value = '';
        } else {
            onlinePayment.value = '';
        }
    } else if (type === 'cash') {
        if (cashCheckbox.checked) {
            onlineCheckbox.checked = false;
            cashPayment.value = amountPayable;
            onlinePayment.value = '';
        } else {
            cashPayment.value = '';
        }
    }

    updatePaymentTotal();
}

// -------------------- PRINT BILL --------------------
async function printBill() {
    if (billItems.length === 0) {
        await showModal("No items in bill");
        return;
    }
    
    hapticFeedback('medium');

    // Get payment details - treat empty as 0
    const amountPayable = Number(document.getElementById("amountPayable").textContent) || 0;
    const onlinePayment = Number(document.getElementById("onlinePayment").value) || 0;
    const cashPayment = Number(document.getElementById("cashPayment").value) || 0;
    const totalPayment = onlinePayment + cashPayment;
    
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

    const isPurchase = billItems[0].mode === 'purchase';
    
    // Get values before clearing
    const billTotal = Number(document.getElementById("billTotal").textContent);
    const laborCharges = isPurchase ? Number(document.getElementById("manualLaborCharges").value) || 0 : 0;
    const amountPayableFinal = isPurchase ? billTotal - laborCharges : billTotal;

    // Calculate totals before clearing
    const totalHeavyPackets = billItems.reduce((sum, b) => sum + (b.heavyPackets || 0), 0);
    const totalPackets = billItems.reduce((sum, b) => sum + (b.packets || 0), 0);
    const isAutoLabor = isPurchase && document.getElementById("autoLaborCharge").checked;
    const customerName = document.getElementById("customerName").value.trim();

    // Prepare bill data
    const billData = {
        isPurchase,
        customerName,
        billTotal,
        laborCharges,
        amountPayable: amountPayableFinal,
        totalPackets,
        onlinePayment,
        cashPayment,
        isAutoLabor: isAutoLabor,
        laborCalc: totalHeavyPackets > 0 ? `${settings.laborRate} × ${totalHeavyPackets}` : '',
        items: billItems.map(b => {
            const item = items.find(i => i.name === b.name);
            const printName = (item && item.hindiName) ? item.hindiName : b.name;
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
    if (printerSettings.enabled && connectedPrinter) {
        try {
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
}

async function printViaBluetooth(billData) {
    if (!connectedPrinter) {
        throw new Error('Printer not connected');
    }
    
    const escposCommands = generateESCPOS(billData);
    await connectedPrinter.write(escposCommands);
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
            <h2>${billData.isPurchase ? 'PURCHASE RECEIPT' : 'SALE RECEIPT'}</h2>
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
    const totalPayment = onlinePayment + cashPayment;

    // Reduce stock for each item
    billItems.forEach(item => {
        reduceStock(item.name, item.qty);
    });

    const sale = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        items: [...billItems],
        total: billTotal,
        payment: {
            online: onlinePayment,
            cash: cashPayment,
            total: totalPayment
        },
        type: 'sale'
    };

    await saveSaleToFirestore(sale);
    salesHistory.unshift(sale);
    await calculateStockFromBills();
    
    // Clear current bill - set payment fields to empty
    billItems = [];
    document.getElementById("onlinePayment").value = "";
    document.getElementById("cashPayment").value = "";
    document.getElementById("onlineCheckbox").checked = false;
    document.getElementById("cashCheckbox").checked = false;
    document.getElementById("totalPayment").textContent = 0;
    
    const totalPacketsElement = document.getElementById("totalPacketsInBill");
    if (totalPacketsElement) {
        totalPacketsElement.textContent = 0;
    }
    
    renderBill();
    updateTotals();
    
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
            printBtn.textContent = 'Print Sale';
            printBtn.classList.remove('print-purchase-btn');
            printBtn.classList.add('print-sale-btn');
        }
        if (saveBtn) {
            saveBtn.textContent = 'Save Sale';
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
            printBtn.textContent = 'Print Purchase';
            printBtn.classList.remove('print-sale-btn');
            printBtn.classList.add('print-purchase-btn');
        }
        if (saveBtn) {
            saveBtn.textContent = 'Save Purchase';
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
        
        if (!window.Capacitor || !window.Capacitor.Plugins.BluetoothLe) {
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
        deviceCard.innerHTML = `
            <div>
                <strong>${device.name || 'Unknown Device'}</strong><br>
                <small style="color: #666;">${device.deviceId}</small>
            </div>
            <button class="add-item-btn" onclick="connectToPrinter('${device.deviceId}', '${device.name || 'Printer'}')">Connect</button>
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
        date: new Date().toLocaleString('en-IN')
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
        date: new Date().toLocaleString('en-IN')
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
    const container = document.getElementById('paymentsHistoryList');
    
    if (paymentsHistory.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #888; margin-top: 40px;">No expenses recorded yet</p>';
        return;
    }

    // Update payment type options from history
    updatePaymentTypeOptions();

    container.innerHTML = paymentsHistory.map((payment, index) => `
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
            <div style="font-size: 12px; color: #999; margin-top: 8px;">📅 ${payment.date}</div>
        </div>
    `).join('');
}

async function reprintPayment(index) {
    const payment = paymentsHistory[index];
    await printPaymentReceipt(payment);
    showToast('✓ Receipt printed');
}

document.addEventListener('DOMContentLoaded', function() {
    // Wait for Firebase auth to initialize
    hideLoading();
    
    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            loadUserDataAndInitialize();
        } else {
            // Show auth screen
            document.getElementById('authScreen')?.classList.remove('hidden');
            document.getElementById('appContent')?.classList.add('hidden');
            hideLoading();
        }
    });
    
    // Initialize mobile UI enhancements
    initPullToRefresh();
});

async function loadUserDataAndInitialize() {
    showLoading();
    
    try {
        // Load user role
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData.role || 'staff';
            userName = userData.name || currentUser.email.split('@')[0];
        } else {
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
        
        // Set up real-time listeners for live sync
        setupRealtimeListeners();
        
        // Initial load of data
        await loadItemsFromFirestore();
        await loadBillsFromFirestore();
        await loadSalesFromFirestore();
        await loadPaymentsFromFirestore();
        await loadStockAdjustmentsFromFirestore();
        
        // Initialize UI
        renderItems();
        loadItemsDropdown();
        loadSettings();
        updateModeUI();
        renderPaymentsHistory();
        updateCustomerOptions();
        updateUserDisplay();
        applyRoleBasedRestrictions();
        initChatbot();
        applyRoleBasedRestrictions();
        
        // Initialize dark mode if enabled
        const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
        if (darkModeEnabled) {
            document.body.classList.add('dark-mode');
        }
        
        // Set today's date as default for custom filter
        const today = new Date().toISOString().split('T')[0];
        if (document.getElementById('dateTo')) {
            document.getElementById('dateTo').value = today;
        }
        
        // Set billing as default active nav item
        const billingNavLink = document.querySelector('.nav-menu a[onclick*="billing"]');
        if (billingNavLink) {
            billingNavLink.classList.add("active");
        }
        
        // Show app content
        document.getElementById('authScreen')?.classList.add('hidden');
        document.getElementById('appContent')?.classList.remove('hidden');
        
        hideLoading();
    } catch (error) {
        console.error('Error loading data:', error);
        hideLoading();
        await showModal('Failed to load data. Please try again.');
    }
}
