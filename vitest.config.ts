import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/**/*.spec.ts', 'apps/**/*.e2e-spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['apps/**/*.ts'],
      exclude: ['apps/**/*.spec.ts', 'apps/**/*.e2e-spec.ts'],
    },
  },
});
