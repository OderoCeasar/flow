/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Flow – Report a water leak',
        short_name: 'Flow',
        description: 'Report water leaks in Nairobi and follow them until they are fixed.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0b5cad',
        categories: ['utilities', 'government'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Report a leak', short_name: 'Report', url: '/report', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'My reports', short_name: 'My reports', url: '/my-reports', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Precache only the citizen shell; staff screens load on demand.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/Dashboard-*', '**/Admin-*', '**/Jobs-*', '**/StaffShell-*', '**/StaffLogin-*', '**/ReportsMap-*', '**/AreaEditor-*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/flow-photos\//, /^\/healthz/],
        runtimeCaching: [
          {
            // Map tiles: keep a small cache so the location step works on a flaky connection.
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 } },
          },
          {
            // Public status pages work offline with the last known status.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/reports/') && !url.pathname.endsWith('/nearby'),
            handler: 'NetworkFirst',
            options: { cacheName: 'report-status', networkTimeoutSeconds: 5, expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8081',
      '/flow-photos': 'http://localhost:9000',
    },
  },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
