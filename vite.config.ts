import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import viteCompression from 'vite-plugin-compression'
import { appConfig } from './config/app'

export default defineConfig({
  base: appConfig.basePath,
  build: {
    modulePreload: {
      polyfill: false,
    },
  },
  plugins: [
    react(),
    ...(process.env.ENABLE_PWA === 'true'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: null,
            devOptions: { enabled: false },
            includeAssets: ['favicon.ico', 'avatars/*.svg'],
            manifest: {
              name: 'Agri Cloud System',
              short_name: 'AgriCloud',
              description: 'Agricultural Management and Satellite Analysis System',
              theme_color: '#ffffff',
              icons: [
                {
                  src: 'avatars/emirati-farmer.svg',
                  sizes: '192x192',
                  type: 'image/svg+xml'
                },
                {
                  src: 'avatars/emirati-farmer.svg',
                  sizes: '512x512',
                  type: 'image/svg+xml'
                }
              ]
            }
          })
        ]
      : []),
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 10240
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 10240
    })
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.{js,ts}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**']
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true
      }
    }
  },
  preview: {
    port: 5173,
    host: true,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  }
})
