import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  // Dev/preview only: local proxy for multiplayer testing.
  // Production connectivity still depends on runtime server URL / reverse proxy.
  server: {
    proxy: {
      '/api/socket.io': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api/socket.io': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom')) return 'react-dom-vendor'
            if (id.includes('react')) return 'react-vendor'
            return 'vendor'
          }
        },
      },
    },
  },
})
