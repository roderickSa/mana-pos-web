import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Tests de lógica pura (rutas, guardado, borradores). Lo visual se verifica
  // con scripts/probar-recarga.mjs sobre el navegador de verdad.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    globals: true,
  },
  server: {
    port: 5173,
    // Permite acceder al dev server a través de túneles ngrok (demos remotas).
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app'],
    proxy: {
      '/catalog': 'http://localhost:3210',
      '/inventory': 'http://localhost:3210',
      '/suppliers': 'http://localhost:3210',
      '/purchases': 'http://localhost:3210',
      '/sales': 'http://localhost:3210',
      '/devices': 'http://localhost:3210',
      '/customers': 'http://localhost:3210',
      '/cash': 'http://localhost:3210',
      '/users': 'http://localhost:3210',
      '/settings': 'http://localhost:3210',
      '/backups': 'http://localhost:3210',
      '/images': 'http://localhost:3210',
      '/health': 'http://localhost:3210',
    },
  },
})
