import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const apiBaseUrl = loadEnv(mode, '.', 'VITE_').VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['.manus.computer'],
      proxy: apiBaseUrl ? { '/api/v1': { target: apiBaseUrl, changeOrigin: true } } : undefined,
    },
  };
});
