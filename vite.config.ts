import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
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
