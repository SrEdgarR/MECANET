import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Private L1 entry: never load legacy .env, public files or test setup.
export default defineConfig({
  root,
  envDir: false,
  publicDir: false,
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  build: {
    outDir: 'dist-saas',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: fileURLToPath(new URL('./saas.html', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/saas/**/*.test.{js,jsx}'],
    setupFiles: ['./src/saas/test-setup.js'],
    clearMocks: true,
  },
});
