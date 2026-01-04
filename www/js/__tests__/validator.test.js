/**
 * @fileoverview Unit tests for the Validator module
 * Tests input validation functions for forms
 * @module __tests__/validator.test
 */

import { Validator } from '../utils/validator.js';

describe('Validator', () => {
    describe('required validation', () => {
        test('should pass for non-empty string', () => {
            const result = Validator.required('Test Item', 'Name');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should fail for empty string', () => {
            const result = Validator.required('', 'Name');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Name is required');
        });

        test('should fail for whitespace-only string', () => {
            const result = Validator.required('   ', 'Name');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Name is required');
        });

        test('should fail for null', () => {
            const result = Validator.required(null, 'Field');
            expect(result.valid).toBe(false);
        });

        test('should fail for undefined', () => {
            const result = Validator.required(undefined, 'Field');
            expect(result.valid).toBe(false);
        });
    });

    describe('positiveNumber validation', () => {
        test('should pass for positive number', () => {
            const result = Validator.positiveNumber(10, 'Quantity');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should fail for zero', () => {
            const result = Validator.positiveNumber(0, 'Quantity');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Quantity must be a positive number');
        });

        test('should fail for negative number', () => {
            const result = Validator.positiveNumber(-5, 'Amount');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Amount must be a positive number');
        });

        test('should fail for NaN', () => {
            const result = Validator.positiveNumber(NaN, 'Rate');
            expect(result.valid).toBe(false);
        });
    });

    describe('nonNegativeNumber validation', () => {
        test('should pass for positive number', () => {
            const result = Validator.nonNegativeNumber(50.5, 'Weight');
            expect(result.valid).toBe(true);
        });

        test('should pass for zero', () => {
            const result = Validator.nonNegativeNumber(0, 'Balance');
            expect(result.valid).toBe(true);
        });

        test('should fail for negative number', () => {
            const result = Validator.nonNegativeNumber(-10, 'Stock');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Stock must be zero or positive');
        });

        test('should fail for NaN', () => {
            const result = Validator.nonNegativeNumber(NaN, 'Value');
            expect(result.valid).toBe(false);
        });
    });

    describe('phoneNumber validation', () => {
        test('should pass for valid 10-digit phone starting with 9', () => {
            const result = Validator.phoneNumber('9876543210');
            expect(result.valid).toBe(true);
        });

        test('should pass for valid 10-digit phone starting with 7', () => {
            const result = Validator.phoneNumber('7123456789');
            expect(result.valid).toBe(true);
        });

        test('should pass for empty phone (optional)', () => {
            const result = Validator.phoneNumber('');
            expect(result.valid).toBe(true);
        });

        test('should fail for invalid phone format', () => {
            const result = Validator.phoneNumber('12345');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Please enter a valid 10-digit phone number');
        });

        test('should fail for phone starting with invalid digit', () => {
            const result = Validator.phoneNumber('1234567890');
            expect(result.valid).toBe(false);
        });
    });

    describe('email validation', () => {
        test('should pass for valid email', () => {
            const result = Validator.email('test@example.com');
            expect(result.valid).toBe(true);
        });

        test('should fail for invalid email', () => {
            const result = Validator.email('invalid-email');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Please enter a valid email address');
        });

        test('should fail for email without domain', () => {
            const result = Validator.email('test@');
            expect(result.valid).toBe(false);
        });
    });

    describe('password validation', () => {
        test('should pass for password meeting length requirement', () => {
            const result = Validator.password('password123', 6);
            expect(result.valid).toBe(true);
        });

        test('should fail for password too short', () => {
            const result = Validator.password('pass', 6);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Password must be at least 6 characters');
        });

        test('should fail for empty password', () => {
            const result = Validator.password('');
            expect(result.valid).toBe(false);
        });
    });

    describe('stockAvailable validation', () => {
        test('should pass when quantity is less than available', () => {
            const result = Validator.stockAvailable(10, 50, 'Rice');
            expect(result.valid).toBe(true);
        });

        test('should pass when quantity equals available', () => {
            const result = Validator.stockAvailable(50, 50, 'Rice');
            expect(result.valid).toBe(true);
        });

        test('should fail when quantity exceeds available', () => {
            const result = Validator.stockAvailable(100, 50, 'Rice');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Insufficient stock');
            expect(result.errors[0]).toContain('Rice');
        });
    });

    describe('combine validation', () => {
        test('should combine valid results', () => {
            const result1 = { valid: true, errors: [] };
            const result2 = { valid: true, errors: [] };
            const combined = Validator.combine(result1, result2);
            expect(combined.valid).toBe(true);
            expect(combined.errors).toHaveLength(0);
        });

        test('should combine and collect all errors', () => {
            const result1 = { valid: false, errors: ['Error 1'] };
            const result2 = { valid: false, errors: ['Error 2'] };
            const combined = Validator.combine(result1, result2);
            expect(combined.valid).toBe(false);
            expect(combined.errors).toHaveLength(2);
            expect(combined.errors).toContain('Error 1');
            expect(combined.errors).toContain('Error 2');
        });

        test('should be invalid if any result is invalid', () => {
            const result1 = { valid: true, errors: [] };
            const result2 = { valid: false, errors: ['Error'] };
            const combined = Validator.combine(result1, result2);
            expect(combined.valid).toBe(false);
        });
    });

    describe('validateBill', () => {
        test('should pass for valid bill', () => {
            const billData = {
                sellerName: 'Test Seller',
                items: [
                    { name: 'Rice', rate: 50, weight: 10 }
                ]
            };
            const result = Validator.validateBill(billData);
            expect(result.valid).toBe(true);
        });

        test('should fail for missing seller name', () => {
            const billData = {
                sellerName: '',
                items: [{ name: 'Rice', rate: 50, weight: 10 }]
            };
            const result = Validator.validateBill(billData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Seller name is required');
        });

        test('should fail for empty items', () => {
            const billData = {
                sellerName: 'Test Seller',
                items: []
            };
            const result = Validator.validateBill(billData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Please add at least one item to the bill');
        });
    });

    describe('validateSale', () => {
        test('should pass for valid sale', () => {
            const saleData = {
                items: [
                    { name: 'Rice', rate: 50, qty: 10 }
                ]
            };
            const result = Validator.validateSale(saleData);
            expect(result.valid).toBe(true);
        });

        test('should fail for empty items', () => {
            const saleData = { items: [] };
            const result = Validator.validateSale(saleData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Please add at least one item to the sale');
        });
    });

    describe('validateExpense', () => {
        test('should pass for valid expense', () => {
            const expenseData = { type: 'Transport', amount: 500 };
            const result = Validator.validateExpense(expenseData);
            expect(result.valid).toBe(true);
        });

        test('should fail for missing type', () => {
            const expenseData = { type: '', amount: 500 };
            const result = Validator.validateExpense(expenseData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Expense type is required');
        });

        test('should fail for zero amount', () => {
            const expenseData = { type: 'Transport', amount: 0 };
            const result = Validator.validateExpense(expenseData);
            expect(result.valid).toBe(false);
        });
    });

    describe('validateItem', () => {
        test('should pass for valid item', () => {
            const itemData = { name: 'Rice', rates: [50, 55] };
            const result = Validator.validateItem(itemData);
            expect(result.valid).toBe(true);
        });

        test('should fail for missing name', () => {
            const itemData = { name: '', rates: [50] };
            const result = Validator.validateItem(itemData);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Item name is required');
        });

        test('should fail for empty rates', () => {
            const itemData = { name: 'Rice', rates: [] };
            const result = Validator.validateItem(itemData);
            expect(result.valid).toBe(false);
        });
    });

    describe('validateWithdrawal', () => {
        test('should pass for valid withdrawal', () => {
            const data = { personName: 'John', amount: 1000 };
            const result = Validator.validateWithdrawal(data);
            expect(result.valid).toBe(true);
        });

        test('should fail for missing person name', () => {
            const data = { personName: '', amount: 1000 };
            const result = Validator.validateWithdrawal(data);
            expect(result.valid).toBe(false);
        });

        test('should fail for zero amount', () => {
            const data = { personName: 'John', amount: 0 };
            const result = Validator.validateWithdrawal(data);
            expect(result.valid).toBe(false);
        });
    });
});
