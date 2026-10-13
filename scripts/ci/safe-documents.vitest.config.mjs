import { fileURLToPath } from 'node:url';

// Focused legacy sanitizer regression after the reviewed DOMPurify update.
// No legacy .env, public assets, global setup or PostCSS configuration is loaded.
export default {
  root: fileURLToPath(new URL('../../client/', import.meta.url)),
  envDir: false,
  publicDir: false,
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/unit/safeDocuments.test.js'],
    clearMocks: true,
  },
};
