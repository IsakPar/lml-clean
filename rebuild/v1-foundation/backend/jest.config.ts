import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^(.*)\\.js$': '$1',
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  maxWorkers: 2,
};

export default config;


