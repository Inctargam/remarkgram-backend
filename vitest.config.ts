import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  resolve: {
    alias: [
      {
        find: '@app/config',
        replacement: resolve(import.meta.dirname, 'libs/config/src/index.ts'),
      },
      {
        find: '@app/files-grpc',
        replacement: resolve(import.meta.dirname, 'libs/contracts/files-grpc/src/index.ts'),
      },
      {
        find: '@app/user-accounts-grpc',
        replacement: resolve(import.meta.dirname, 'libs/contracts/user-accounts-grpc/src/index.ts'),
      },
      {
        find: /^@libs\/(.+)\.js$/,
        replacement: `${resolve(import.meta.dirname, 'libs')}/$1.ts`,
      },
      {
        find: '@libs',
        replacement: resolve(import.meta.dirname, 'libs'),
      },
    ],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/**/*.spec.ts', 'apps/**/*.e2e-spec.ts', 'libs/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['apps/**/*.ts', 'libs/**/*.ts'],
      exclude: ['apps/**/*.spec.ts', 'apps/**/*.e2e-spec.ts', 'libs/**/*.spec.ts'],
    },
  },
});
