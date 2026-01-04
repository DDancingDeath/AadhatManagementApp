/**
 * Jest Configuration for Aadhat Management App
 * @type {import('jest').Config}
 */
module.exports = {
    // Use jsdom environment for DOM testing
    testEnvironment: 'jsdom',
    
    // Test file patterns
    testMatch: [
        '**/www/js/__tests__/**/*.test.js',
        '**/www/js/**/*.spec.js'
    ],
    
    // Module file extensions
    moduleFileExtensions: ['js', 'json'],
    
    // Transform ES modules with Babel
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    
    // Module name mapper for path aliases
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/www/js/$1'
    },
    
    // Coverage configuration
    collectCoverageFrom: [
        'www/js/**/*.js',
        '!www/js/__tests__/**',
        '!www/js/main.js'
    ],
    
    // Coverage thresholds (optional, can be adjusted)
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        }
    },
    
    // Setup files
    setupFilesAfterEnv: [],
    
    // Verbose output
    verbose: true,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Restore mocks between tests
    restoreMocks: true
};
