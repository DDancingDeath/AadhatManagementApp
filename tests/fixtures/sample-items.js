/**
 * Shared catalogue fixture for module tests (#96). Hindi names are real
 * Devanagari so bilingual search is exercised.
 */
export const SAMPLE_ITEMS = [
    { id: 'item-rice', name: 'Rice', hindiName: 'चावल', rates: [30], saleRates: [36], wholesaleRates: [34] },
    { id: 'item-wheat', name: 'Wheat', hindiName: 'गेहूं', rates: [24], saleRates: [28], wholesaleRates: [27] },
    { id: 'item-maize', name: 'Maize', hindiName: 'मक्का', rates: [20], saleRates: [25], wholesaleRates: [23] },
    { id: 'item-mustard', name: 'Mustard', hindiName: 'सरसों', rates: [55], saleRates: [62], wholesaleRates: [60] }
];

/** Fresh deep copy so tests can mutate freely. */
export const sampleItems = () => SAMPLE_ITEMS.map(i => ({
    ...i, rates: [...i.rates], saleRates: [...i.saleRates], wholesaleRates: [...i.wholesaleRates]
}));
