import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  resolve: {
    alias: [
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
