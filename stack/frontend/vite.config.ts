/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// The shared typing engine (stack/engine), consumed as source through the aliases below.
const engineSrc = fileURLToPath(new URL('../engine/src', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'logo.jpeg'],
      manifest: {
        name: 'ParroType',
        short_name: 'ParroType',
        description: 'A minimal typing test with time, words, quote, zen, pangram and custom modes.',
        theme_color: '#1d2119',
        background_color: '#1d2119',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // The app shell (JS, CSS, HTML, icons) and the self-hosted fonts.
        globPatterns: ['**/*.{js,css,html,svg,png,jpeg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    // Order matters: the engine aliases come before the generic '@'. The shared engine lives in
    // stack/engine and is consumed as TypeScript source (the same files the backend builds).
    alias: [
      { find: /^@\/lib\/engine$/, replacement: `${engineSrc}/index.ts` },
      { find: /^@\/lib\/engine\/(.*)$/, replacement: `${engineSrc}/engine/$1` },
      { find: /^@\/lib\/text\/(.*)$/, replacement: `${engineSrc}/text/$1` },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
