import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(),
    VitePWA({
      registerType: 'autoUpdate' ,
      strategies: 'generateSW',
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api/]
      },
      devOptions: {
        enabled: true
      }
  }),
  tsconfigPaths()],
  server: {
    watch: {
      usePolling: true
    }
  }
})