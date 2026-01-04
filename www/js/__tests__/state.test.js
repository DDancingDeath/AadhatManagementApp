/**
 * @fileoverview Tests for AppState module
 * Tests state management and default values
 */

import { AppState } from '../utils/state.js';

describe('AppState', () => {
    describe('default values', () => {
        it('should have currentUser as null by default', () => {
            expect(AppState.currentUser).toBeNull();
        });

        it('should have userName with default value', () => {
            expect(AppState.userName).toBe('User');
        });

        it('should have userRole with default staff', () => {
            expect(AppState.userRole).toBe('staff');
        });

        it('should have empty items array', () => {
            expect(AppState.items).toEqual([]);
        });

        it('should have empty billItems array', () => {
            expect(AppState.billItems).toEqual([]);
        });

        it('should have empty billHistory array', () => {
            expect(AppState.billHistory).toEqual([]);
        });

        it('should have empty salesHistory array', () => {
            expect(AppState.salesHistory).toEqual([]);
        });

        it('should have empty expensesHistory array', () => {
            expect(AppState.expensesHistory).toEqual([]);
        });

        it('should have empty stockAdjustments array', () => {
            expect(AppState.stockAdjustments).toEqual([]);
        });

        it('should have empty withdrawalsHistory array', () => {
            expect(AppState.withdrawalsHistory).toEqual([]);
        });

        it('should have empty stock object', () => {
            expect(AppState.stock).toEqual({});
        });

        it('should have transactionMode as purchase', () => {
            expect(AppState.transactionMode).toBe('purchase');
        });

        it('should have currentDueFilter as purchase', () => {
            expect(AppState.currentDueFilter).toBe('purchase');
        });
        
        it('should have currentDateFilter as today', () => {
            expect(AppState.currentDateFilter).toBe('today');
        });
        
        it('should have analyticsPeriod as 30days', () => {
            expect(AppState.analyticsPeriod).toBe('30days');
        });
    });

    describe('settings default values', () => {
        it('should have settings object', () => {
            expect(AppState.settings).toBeDefined();
        });

        it('should have heavyWeightThreshold setting', () => {
            expect(AppState.settings.heavyWeightThreshold).toBe(30);
        });

        it('should have laborRate setting', () => {
            expect(AppState.settings.laborRate).toBe(6);
        });

        it('should have autoLaborEnabled setting as true', () => {
            expect(AppState.settings.autoLaborEnabled).toBe(true);
        });

        it('should have showHindi setting as false', () => {
            expect(AppState.settings.showHindi).toBe(false);
        });
    });

    describe('printerSettings default values', () => {
        it('should have printerSettings object', () => {
            expect(AppState.printerSettings).toBeDefined();
        });

        it('should have enabled as false', () => {
            expect(AppState.printerSettings.enabled).toBe(false);
        });

        it('should have deviceId as null', () => {
            expect(AppState.printerSettings.deviceId).toBeNull();
        });

        it('should have deviceName as null', () => {
            expect(AppState.printerSettings.deviceName).toBeNull();
        });
        
        it('should have paperWidth defined', () => {
            expect(AppState.printerSettings.paperWidth).toBeDefined();
        });
    });

    describe('custom date range default values', () => {
        it('should have customDateRange object', () => {
            expect(AppState.customDateRange).toBeDefined();
        });

        it('should have from as null', () => {
            expect(AppState.customDateRange.from).toBeNull();
        });

        it('should have to as null', () => {
            expect(AppState.customDateRange.to).toBeNull();
        });
    });

    describe('state mutability', () => {
        // Store original values
        let originalBillItems;
        
        beforeEach(() => {
            originalBillItems = [...AppState.billItems];
        });

        afterEach(() => {
            // Restore original state
            AppState.billItems = originalBillItems;
        });

        it('should allow adding items to billItems', () => {
            const testItem = { name: 'Test', qty: 1, rate: 100 };
            AppState.billItems.push(testItem);
            expect(AppState.billItems).toContainEqual(testItem);
        });

        it('should allow setting currentUser', () => {
            const originalUser = AppState.currentUser;
            AppState.currentUser = { uid: 'test-123' };
            expect(AppState.currentUser).toEqual({ uid: 'test-123' });
            AppState.currentUser = originalUser;
        });

        it('should allow updating settings', () => {
            const originalLaborRate = AppState.settings.laborRate;
            AppState.settings.laborRate = 10;
            expect(AppState.settings.laborRate).toBe(10);
            AppState.settings.laborRate = originalLaborRate;
        });
    });
});
