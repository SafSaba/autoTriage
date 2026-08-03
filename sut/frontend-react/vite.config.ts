import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const target = process.env.VITE_API_TARGET || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/link': path.resolve(__dirname, './src/shims/next-link.tsx'),
      'next/image': path.resolve(__dirname, './src/shims/next-image.tsx'),
      'next/navigation': path.resolve(__dirname, './src/shims/next-navigation.ts'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target, changeOrigin: true },
      '/actuator': { target, changeOrigin: true },
      '/swagger-ui': { target, changeOrigin: true },
      '/swagger-ui.html': { target, changeOrigin: true },
      '/v3/api-docs': { target, changeOrigin: true },
    },
  },
  preview: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target, changeOrigin: true },
      '/actuator': { target, changeOrigin: true },
      '/swagger-ui': { target, changeOrigin: true },
      '/swagger-ui.html': { target, changeOrigin: true },
      '/v3/api-docs': { target, changeOrigin: true },
    },
  },
});
