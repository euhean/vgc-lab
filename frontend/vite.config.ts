/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // The bundled Pokédex and learnset data are large by nature; learnsets load lazily.
    chunkSizeWarningLimit: 3500,
  },
  test: {
    // Unit tests only; the Playwright end-to-end tests in e2e/ run separately.
    include: ['src/**/*.test.ts'],
  },
});
