/**
 * Babel Configuration for Jest
 * Enables ES6 module transformation for testing
 */
module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    node: 'current'
                }
            }
        ]
    ]
};
