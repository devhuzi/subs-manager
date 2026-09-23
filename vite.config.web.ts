import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// Web (PWA) build. Reuses the same React renderer + shared code as the Electron
// app, but drops vite-plugin-electron entirely — the platform seam (window.api)
// is provided by a Supabase-backed adapter installed in src/web/main.tsx.
// vite-plugin-pwa adds the install manifest and a custom service worker
// (src/web/pwa/sw.ts) that handles Web Push.
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  // .env lives at the project root, not the Vite root (src/web).
  envDir: __dirname,
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    // Never ship source maps to production — they reconstruct original source.
    sourcemap: false,
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'pwa',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Tools & Subs Manager',
        short_name: 'Subs',
        description: 'Track your subscriptions, tools, and one-time purchases.',
        theme_color: '#6366F1',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        // `any` icons (1024² source, browsers downscale) + a padded 512²
        // maskable for Android adaptive icons.
        icons: [
          { src: 'pwa-icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // The app bundle is large; allow it to be precached.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
});
