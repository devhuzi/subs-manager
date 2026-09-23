import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite config for the browser-test harness (e2e/harness). Renders the real
// renderer <App/> against the in-memory mock seam (e2e/mock-api.ts): no
// Supabase, no Electron, no auth. Used by Playwright to screenshot and drive
// the actual UI.
export default defineConfig({
  root: resolve(__dirname, 'e2e/harness'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  // Tailwind/PostCSS config lives at the project root.
  css: { postcss: __dirname },
  server: { port: 5199, strictPort: true },
  plugins: [react()],
});
