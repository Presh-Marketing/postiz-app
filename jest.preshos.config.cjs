module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/preshos/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          ...require('./tsconfig.base.json').compilerOptions,
          module: 'commonjs',
          types: ['jest', 'node'],
          resolveJsonModule: true,
        },
        diagnostics: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
  },
};
