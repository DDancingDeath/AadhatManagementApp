/**
 * @fileoverview User Management Module
 * Handles user registration, approval, role management, and access control
 * Owner-only functionality for managing staff and managers
 * @module modules/users
 */

import { AppState } from '../utils/state.js';
import { UIManager } from '../ui/ui-manager.js';
import { Helpers } from '../utils/helpers.js';

/**
 * Users Manager - Manages user operations
 * @class UsersManager
 */
export class UsersManager {
    /**
     * Load all users from Firebase
     * Separates into pending and active users
     * @async
     * @returns {Promise<void>}
     */
    static async loadUsers() {
        const userRole = AppState.userRole;
        if (userRole !== 'owner') return;
        
        try {
            const db = firebase.firestore();
            const usersSnapshot = await db.collection(window.getCollection ? window.getCollection('users') : 'users').orderBy('createdAt', 'desc').get();
            
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
            
            this.renderPendingUsers(pendingUsers);
            this.renderActiveUsers(activeUsers);
        } catch (error) {
            console.error('Error loading users:', error);
            UIManager.showToast('Failed to load users');
        }
    }

    /**
     * Render list of pending user registrations
     * @param {Array<Object>} users - Array of pending user objects
     */
    static renderPendingUsers(users) {
        const container = document.getElementById('pendingUsersList');
        if (!container) return;
        
        if (users.length === 0) {
            container.innerHTML = '<p style="color: #666; padding: 16px; text-align: center;">No pending registrations</p>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 16px;">${Helpers.escapeHtml(user.name)}</strong>
                    <p style="color: #666; margin: 4px 0;">${Helpers.escapeHtml(user.email)}</p>
                    <p style="color: #999; font-size: 12px;">Registered: ${user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString() : 'Recently'}</p>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button onclick="window.app.users.approveUser('${user.id}', 'owner')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        👑 Owner
                    </button>
                    <button onclick="window.app.users.approveUser('${user.id}', 'manager')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #764ba2; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        👔 Manager
                    </button>
                    <button onclick="window.app.users.approveUser('${user.id}', 'staff')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #48bb78; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        👤 Staff
                    </button>
                    <button onclick="window.app.users.rejectUser('${user.id}')" style="flex: 1; min-width: 100px; padding: 8px 16px; background: #f56565; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        ❌ Reject
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render list of active approved users
     * @param {Array<Object>} users - Array of active user objects
     */
    static renderActiveUsers(users) {
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
                            <strong style="font-size: 16px;">${Helpers.escapeHtml(user.name)}</strong>
                            <p style="color: #666; margin: 4px 0;">${Helpers.escapeHtml(user.email)}</p>
                            <span style="display: inline-block; padding: 4px 12px; background: ${roleColors[user.role]}; color: white; border-radius: 12px; font-size: 12px; margin-top: 4px;">
                                ${roleIcons[user.role]} ${user.role.toUpperCase()}
                            </span>
                        </div>
                        ${user.id !== (AppState.currentUser ? AppState.currentUser.uid : null) ? `
                            <button onclick="window.app.users.showChangeRoleDialog('${user.id}', '${user.name}', '${user.role}')" style="padding: 6px 12px; background: #f7fafc; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer;">
                                Edit
                            </button>
                        ` : '<span style="color: #999; font-size: 12px; padding: 8px;">(You)</span>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    static async approveUser(userId, role) {
        try {
            const db = firebase.firestore();
            await db.collection(window.getCollection ? window.getCollection('users') : 'users').doc(userId).update({
                role: role,
                status: 'active',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            UIManager.hapticFeedback('medium');
            UIManager.showToast(`User approved as ${role}`);
            this.loadUsers();
        } catch (error) {
            console.error('Error approving user:', error);
            UIManager.showModal('Failed to approve user');
        }
    }

    static async rejectUser(userId) {
        const confirmed = await UIManager.showModal('Are you sure you want to reject this registration?', 'Confirm', true);
        if (!confirmed) return;
        
        try {
            const db = firebase.firestore();
            await db.collection(window.getCollection ? window.getCollection('users') : 'users').doc(userId).delete();
            
            UIManager.hapticFeedback('light');
            UIManager.showToast('Registration rejected');
            this.loadUsers();
        } catch (error) {
            console.error('Error rejecting user:', error);
            UIManager.showModal('Failed to reject user');
        }
    }

    static async showChangeRoleDialog(userId, userName, currentRole) {
        const roles = ['owner', 'manager', 'staff'];
        const roleOptions = roles.map(r => 
            `<option value="${r}" ${r === currentRole ? 'selected' : ''}>${r.toUpperCase()}</option>`
        ).join('');
        
        const html = `
            <div style="text-align: left;">
                <p style="margin-bottom: 16px;">Change role for <strong>${Helpers.escapeHtml(userName)}</strong></p>
                <select id="newRoleSelect" style="width: 100%; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 16px;">
                    ${roleOptions}
                </select>
            </div>
        `;
        
        const result = await this.showCustomModal(html, [
            { text: 'Cancel', value: null },
            { text: 'Change Role', value: 'change', primary: true }
        ]);
        
        if (result && result.selectedRole) {
            const newRole = result.selectedRole;
            if (newRole !== currentRole) {
                await this.changeUserRole(userId, newRole);
            }
        }
    }

    static async changeUserRole(userId, newRole) {
        try {
            const db = firebase.firestore();
            await db.collection(window.getCollection ? window.getCollection('users') : 'users').doc(userId).update({
                role: newRole,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            UIManager.hapticFeedback('medium');
            UIManager.showToast(`Role updated to ${newRole}`);
            this.loadUsers();
        } catch (error) {
            console.error('Error changing role:', error);
            UIManager.showModal('Failed to change role');
        }
    }

    static showCustomModal(html, buttons) {
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
                    const selectElement = document.getElementById('newRoleSelect');
                    const selectedRole = selectElement ? selectElement.value : null;
                    
                    document.body.removeChild(modal);
                    
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

}
