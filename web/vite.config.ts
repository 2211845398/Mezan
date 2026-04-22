import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep heavy leaves in their own chunks so the initial shell stays
        // slim; Plan §8.6 sets a 250 KB gz budget on the main chunk and
        // 150 KB gz on any feature chunk.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'tanstack-table': ['@tanstack/react-table', '@tanstack/react-virtual'],
          'date-fns': ['date-fns', 'date-fns/locale'],
          decimal: ['decimal.js'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 300,
    },
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
