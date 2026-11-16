export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  globals: {
    importMeta: {
      env: {
        VITE_APP_NAME: 'test-app',
        VITE_AUTH0_DOMAIN: 'test.auth0.com',
        VITE_AUTH0_CLIENT_ID: 'test-client-id',
        VITE_AUTH0_CALLBACK_URL: 'http://localhost:3000/callback',
        VITE_AUTH0_AUDIENCE: 'test-audience',
        VITE_PROD_OR_DEV: 'development',
        VITE_API_BASE_DOMAIN: 'http://localhost:8000',
        VITE_API_BASE_DOMAIN_DEV: 'http://localhost:8000',
      }
    }
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^Components/(.*)$': '<rootDir>/src/Components/$1',
    '^Components$': '<rootDir>/src/Components/index.js',
    '^contexts/(.*)$': '<rootDir>/src/contexts/$1',
    '^contexts$': '<rootDir>/src/contexts/index.js',
    '^hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^hooks$': '<rootDir>/src/hooks/index.js',
    '^services/(.*)$': '<rootDir>/src/services/$1',
    '^services$': '<rootDir>/src/services/index.js',
    '^hocs/(.*)$': '<rootDir>/src/hocs/$1',
    '^hocs$': '<rootDir>/src/hocs/index.js',
    '^layouts/(.*)$': '<rootDir>/src/layouts/$1',
    '^layouts$': '<rootDir>/src/layouts/index.js',
    '^reducers/(.*)$': '<rootDir>/src/reducers/$1',
    '^reducers$': '<rootDir>/src/reducers/index.js',
    '^utils/(.*)$': '<rootDir>/src/utils/$1',
    '^utils$': '<rootDir>/src/utils/index.js',
    '^enums/(.*)$': '<rootDir>/src/enums/$1',
    '^enums$': '<rootDir>/src/enums/index.js',
    '^defaults$': '<rootDir>/src/defaults.js',
    '^testing/(.*)$': '<rootDir>/src/testing/$1',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@turf|kdbush|geokdbush|tinyqueue|mapbox-gl|@mapbox/*|nanoid)/)',
  ],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/testing/**',
  ],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  resetMocks: true,
  restoreMocks: true,
  clearMocks: true,
};
