import { readLineItem, perUnitRate } from '../utils/money.js';
import { aggregateLineItems, itemFilterOptions, chartScaleMax, formatPerUnitRate } from '../modules/reports.js';

describe('Reports line items and guards (#73)', () => {
    test('legacy item/quantity/amount fields are counted in item breakdowns', () => {
        const bills = [
            { items: [{ name: 'Wheat', qty: 10, rate: 20, total: 200 }] },
            { items: [{ item: 'Wheat', quantity: 5, rate: 20, amount: 100 }] },
            { items: [{ name: 'Rice', quantity: '4', rate: 50 }] }
        ];
        expect(aggregateLineItems(bills)).toEqual({
            Wheat: { count: 2, qty: 15, value: 300 },
            Rice: { count: 1, qty: 4, value: 200 }
        });
    });

    test('one row per item: a Hindi-named legacy line and an English line with the same itemId (#143)', () => {
        const items = [{ id: 'item-rice', name: 'Rice', hindiName: 'चावल' }];
        const bills = [
            { items: [{ itemId: 'item-rice', name: 'चावल', qty: 10, rate: 30, total: 300 }] },
            { items: [{ itemId: 'item-rice', name: 'Rice', qty: 5, rate: 30, total: 150 }] },
            { items: [{ name: 'चावल', qty: 1, rate: 30, total: 30 }] } // older line without itemId
        ];
        expect(aggregateLineItems(bills, items, false)).toEqual({ Rice: { count: 3, qty: 16, value: 480 } });
        expect(aggregateLineItems(bills, items, true)).toEqual({ 'चावल': { count: 3, qty: 16, value: 480 } });
        expect(itemFilterOptions(bills, items, false)).toEqual([{ value: 'id:item-rice', label: 'Rice' }]);
    });

    test('readLineItem prefers current fields and keeps an explicit 0', () => {
        expect(readLineItem({ name: 'A', qty: 0, quantity: 9, total: 0, amount: 50 }))
            .toEqual({ name: 'A', qty: 0, rate: 0, total: 0 });
        expect(readLineItem(null)).toEqual({ name: '', qty: 0, rate: 0, total: 0 });
    });

    test('qty 0 shows "—" instead of Infinity/NaN', () => {
        expect(perUnitRate(100, 0)).toBeNull();
        expect(perUnitRate(0, 0)).toBeNull();
        expect(formatPerUnitRate(100, 0, '/kg')).toBe('—');
        expect(formatPerUnitRate(250, 10, '/kg')).toBe('₹25.00/kg');
    });

    test('all-zero chart ranges get a non-zero scale (no NaN bar heights)', () => {
        const max = chartScaleMax([0, 0, 0]);
        expect(max).toBe(1);
        expect(Number.isFinite((0 / max) * 200)).toBe(true);
        expect(chartScaleMax([])).toBe(1);
        expect(chartScaleMax([5, 12, 3])).toBe(12);
    });
});
