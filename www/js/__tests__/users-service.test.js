/**
 * @fileoverview User-profile access for admin.js / users.js goes through
 * FirebaseService (#123): env prefix, client-side createdAt ordering, and the
 * exact fields the approve / role-change flows write.
 */
import fs from 'fs';
import path from 'path';
import { FirebaseService } from '../firebase/firestore-service.js';
import { AdminManager } from '../modules/admin.js';
import { UsersManager } from '../modules/users.js';
import { AppState } from '../utils/state.js';
import { createFakeFirestore } from './__mocks__/fake-firestore.js';

let fake;

beforeEach(() => {
    fake = createFakeFirestore();
    global.firebase = fake.firebase;
    window.COLLECTION_PREFIX = 'dev_';
    fake.seed('dev_users', [
        { id: 'old', name: 'Old', role: 'staff', status: 'active', createdAt: { toMillis: () => 1000 } },
        { id: 'legacy', name: 'Legacy', role: 'owner' },
        { id: 'new', name: 'New', status: 'pending', createdAt: { toMillis: () => 5000 } },
    ]);
    fake.seed('users', [{ id: 'prod', name: 'Prod user', role: 'owner' }]);
    AppState.currentUser = { uid: 'owner-1' };
    AppState.userRole = 'owner';
});

afterEach(() => {
    delete window.COLLECTION_PREFIX;
});

const userDoc = (id) => fake.raw('dev_users').get(id);

describe('FirebaseService user methods', () => {
    test('loadUsers reads the prefixed collection, newest first, legacy (no createdAt) last', async () => {
        const users = await FirebaseService.loadUsers();
        expect(users.map(u => u.id)).toEqual(['new', 'old', 'legacy']);
        expect(users[0]).toMatchObject({ id: 'new', name: 'New', status: 'pending' });
    });

    test('updateUser / deleteUserProfile touch only the prefixed profile', async () => {
        await FirebaseService.updateUser('old', { role: 'manager' });
        expect(userDoc('old')).toMatchObject({ role: 'manager', status: 'active', name: 'Old' });
        await FirebaseService.deleteUserProfile('legacy');
        expect(userDoc('legacy')).toBeUndefined();
        expect(fake.raw('users').get('prod')).toBeDefined();
    });

    test('countDocuments and clearCollection use the prefix and report counts', async () => {
        expect(await FirebaseService.countDocuments('users')).toBe(3);
        expect(await FirebaseService.clearCollection('users')).toBe(3);
        expect(fake.raw('dev_users').size).toBe(0);
        expect(fake.raw('users').size).toBe(1);
        expect(await FirebaseService.clearCollection('empty')).toBe(0);
    });
});

describe('admin flows write the same fields as before', () => {
    test('AdminManager.approveUser sets status, chosen role, approvedAt, approvedBy', async () => {
        document.body.innerHTML = '<select id="role-new"><option value="manager" selected>m</option></select>';
        await AdminManager.approveUser('new');
        expect(userDoc('new')).toMatchObject({ status: 'active', role: 'manager', approvedBy: 'owner-1' });
        expect(typeof userDoc('new').approvedAt).toBe('number');
    });

    test('UsersManager.approveUser / changeUserRole keep their field sets', async () => {
        await UsersManager.approveUser('new', 'staff');
        expect(userDoc('new')).toMatchObject({ status: 'active', role: 'staff' });
        expect(userDoc('new').approvedBy).toBeUndefined();
        await UsersManager.changeUserRole('old', 'manager');
        expect(userDoc('old')).toMatchObject({ role: 'manager' });
        expect(typeof userDoc('old').updatedAt).toBe('number');
    });

    test('admin.js and users.js no longer open Firestore directly', () => {
        for (const file of ['admin.js', 'users.js']) {
            const src = fs.readFileSync(path.join(__dirname, '..', 'modules', file), 'utf8');
            expect(src).not.toMatch(/firebase\.firestore\(\)|\.collection\(/);
        }
    });
});
