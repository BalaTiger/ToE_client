import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function h5ClassicScriptPlugin() {
  return {
    name: 'toe-h5-classic-script',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin/g, '<script defer');
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const isH5 = mode === 'h5';
  const runtimeTarget = command === 'serve' ? 'dev' : isH5 ? 'h5' : 'web';
  const h5ServerUrl = process.env.VITE_H5_SERVER_URL || 'https://toegame.online';
  const h5SocketPath = process.env.VITE_H5_SOCKET_PATH || '/socket.io';
  const webServerUrl = process.env.VITE_WEB_SERVER_URL || '';
  const webSocketPath = process.env.VITE_WEB_SOCKET_PATH || '/socket.io';
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:3002';
  const devSocketPath = process.env.VITE_DEV_SOCKET_PATH || '/socket.io';
  return {
    plugins: [react(), ...(isH5 ? [h5ClassicScriptPlugin()] : [])],
    base: isH5 ? './' : '/',
    define: {
      __TOE_PUBLIC_BASE__: JSON.stringify(isH5 ? './' : '/'),
      __TOE_H5_BUILD__: JSON.stringify(isH5),
      __TOE_RUNTIME_TARGET__: JSON.stringify(runtimeTarget),
      __TOE_H5_SERVER_URL__: JSON.stringify(h5ServerUrl),
      __TOE_H5_SOCKET_PATH__: JSON.stringify(h5SocketPath),
      __TOE_WEB_SERVER_URL__: JSON.stringify(webServerUrl),
      __TOE_WEB_SOCKET_PATH__: JSON.stringify(webSocketPath),
      __TOE_DEV_SERVER_URL__: JSON.stringify(devServerUrl),
      __TOE_DEV_SOCKET_PATH__: JSON.stringify(devSocketPath),
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.{test,spec}.{js,jsx}'],
    },
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
      cssCodeSplit: !isH5,
      modulePreload: !isH5,
      rollupOptions: {
        output: isH5
          ? {
              format: 'iife',
              inlineDynamicImports: true,
              entryFileNames: 'assets/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash][extname]',
            }
          : {
              manualChunks(id) {
                if (id.includes('node_modules')) {
                  if (id.includes('react-dom')) return 'react-dom-vendor'
                  if (id.includes('react')) return 'react-vendor'
                  return 'vendor'
                }
                if (id.includes('/src/game/')) return 'game-logic'
                if (id.includes('/src/components/')) return 'components'
                if (id.includes('/src/constants/')) return 'constants'
              },
            },
      },
    },
  };
})
