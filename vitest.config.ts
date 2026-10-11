import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: {
    '@ui': fileURLToPath(new URL('./ui', import.meta.url)),
    '@catalog': fileURLToPath(new URL('./src/overrideCatalog.ts', import.meta.url)),
  } },
  test: {
    include: ['tests/**/*.test.ts', 'ui/**/*.test.tsx'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
