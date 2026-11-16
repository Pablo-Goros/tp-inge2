/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    // TODO(equipo): proxy a la API real cuando se integre (ver docs/frontend-api.md).
    proxy: { '/api': { target: loadEnv(mode, '.', '').VITE_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 15000, // la suite corre en paralelo y los tests del editor son pesados
  },
}));
