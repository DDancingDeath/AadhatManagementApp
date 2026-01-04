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
    
    // Coverage configuration - only collect from testable utility files
    collectCoverageFrom: [
        'www/js/utils/helpers.js',
        'www/js/utils/validator.js',
        // Exclude files that require Firebase, DOM, or Capacitor
        '!www/js/__tests__/**',
        '!www/js/main.js',
        '!www/js/auth/**',
        '!www/js/firebase/**',
        '!www/js/modules/**',
        '!www/js/services/**',
        '!www/js/ui/**',
        '!www/js/utils/state.js',
        '!www/js/utils/constants.js',
        '!www/js/utils/template-loader.js'
    ],
    
    // Coverage thresholds - only for files we can unit test
    coverageThreshold: {
        'www/js/utils/helpers.js': {
            branches: 35,
            functions: 70,
            lines: 60,
            statements: 60
        },
        'www/js/utils/validator.js': {
            branches: 90,
            functions: 85,
            lines: 95,
            statements: 95
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
