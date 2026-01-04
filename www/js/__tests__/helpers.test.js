/**
 * @fileoverview Unit tests for the helper utility functions
 * @module __tests__/helpers.test
 */

import { Helpers } from '../utils/helpers.js';

describe('Helpers.escapeHtml', () => {
    test('should escape HTML special characters', () => {
        const input = '<script>alert("XSS")</script>';
        const result = Helpers.escapeHtml(input);
        expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    test('should escape ampersand', () => {
        expect(Helpers.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    test('should escape single quotes', () => {
        expect(Helpers.escapeHtml("It's fine")).toBe("It&#039;s fine");
    });

    test('should handle empty string', () => {
        expect(Helpers.escapeHtml('')).toBe('');
    });

    test('should handle string with no special characters', () => {
        expect(Helpers.escapeHtml('Hello World')).toBe('Hello World');
    });
});

describe('Helpers.formatDate', () => {
    test('should format date correctly', () => {
        const result = Helpers.formatDate('2024-01-15');
        expect(result).toContain('15');
        expect(result).toContain('Jan');
        expect(result).toContain('2024');
    });

    test('should handle Date object', () => {
        const date = new Date('2024-06-20');
        const result = Helpers.formatDate(date);
        expect(result).toContain('20');
        expect(result).toContain('Jun');
        expect(result).toContain('2024');
    });

    test('should handle empty/null date', () => {
        expect(Helpers.formatDate('')).toBe('');
        expect(Helpers.formatDate(null)).toBe('');
    });
});

describe('Helpers.formatDateTime', () => {
    test('should format datetime with time', () => {
        const date = new Date('2024-01-15T14:30:00');
        const result = Helpers.formatDateTime(date);
        expect(result).toContain('15');
        expect(result).toContain('2024');
        // Time component should be present
        expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
});

describe('Helpers.formatCurrency', () => {
    test('should format positive number as currency', () => {
        const result = Helpers.formatCurrency(1234.56);
        expect(result).toContain('₹');
    });

    test('should format zero', () => {
        const result = Helpers.formatCurrency(0);
        expect(result).toContain('0');
    });

    test('should format negative number', () => {
        const result = Helpers.formatCurrency(-500);
        expect(result).toContain('500');
    });

    test('should contain rupee symbol', () => {
        const result = Helpers.formatCurrency(1234567.89);
        expect(result).toContain('₹');
    });
});

describe('Helpers.generateId', () => {
    test('should generate unique IDs', () => {
        const id1 = Helpers.generateId();
        const id2 = Helpers.generateId();
        expect(id1).not.toBe(id2);
    });

    test('should return a string', () => {
        const id = Helpers.generateId();
        expect(typeof id).toBe('string');
    });

    test('should have reasonable length', () => {
        const id = Helpers.generateId();
        expect(id.length).toBeGreaterThan(5);
    });
});

describe('Helpers.debounce', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should debounce function calls', () => {
        const mockFn = jest.fn();
        const debouncedFn = Helpers.debounce(mockFn, 300);

        debouncedFn();
        debouncedFn();
        debouncedFn();

        expect(mockFn).not.toHaveBeenCalled();

        jest.advanceTimersByTime(300);

        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should call function with correct arguments', () => {
        const mockFn = jest.fn();
        const debouncedFn = Helpers.debounce(mockFn, 100);

        debouncedFn('arg1', 'arg2');
        jest.advanceTimersByTime(100);

        expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
});

describe('Helpers.getInputNumber', () => {
    test('should parse valid number from input value', () => {
        document.body.innerHTML = '<input id="testInput" value="123.45">';
        const result = Helpers.getInputNumber('testInput');
        expect(result).toBe(123.45);
    });

    test('should return 0 for empty input', () => {
        document.body.innerHTML = '<input id="testInput" value="">';
        const result = Helpers.getInputNumber('testInput');
        expect(result).toBe(0);
    });

    test('should return 0 for non-existent input', () => {
        document.body.innerHTML = '';
        const result = Helpers.getInputNumber('nonExistent');
        expect(result).toBe(0);
    });
});

describe('Helpers.getInputInt', () => {
    test('should parse valid integer from input value', () => {
        document.body.innerHTML = '<input id="testInput" value="42">';
        const result = Helpers.getInputInt('testInput');
        expect(result).toBe(42);
    });

    test('should floor decimal values', () => {
        document.body.innerHTML = '<input id="testInput" value="42.9">';
        const result = Helpers.getInputInt('testInput');
        expect(result).toBe(42);
    });

    test('should return 0 for empty input', () => {
        document.body.innerHTML = '<input id="testInput" value="">';
        const result = Helpers.getInputInt('testInput');
        expect(result).toBe(0);
    });
});

describe('Helpers.getInputText', () => {
    test('should get text from input', () => {
        document.body.innerHTML = '<input id="testInput" value="Hello World">';
        const result = Helpers.getInputText('testInput');
        expect(result).toBe('Hello World');
    });

    test('should trim whitespace', () => {
        document.body.innerHTML = '<input id="testInput" value="  Hello  ">';
        const result = Helpers.getInputText('testInput');
        expect(result).toBe('Hello');
    });

    test('should return empty string for non-existent input', () => {
        document.body.innerHTML = '';
        const result = Helpers.getInputText('nonExistent');
        expect(result).toBe('');
    });
});
