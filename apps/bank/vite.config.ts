import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3002',
      '/automation-api': { target: 'http://127.0.0.1:3001', rewrite: path => path.replace(/^\/automation-api/, '') },
    } },
  build: { outDir: '../../dist/bank', emptyOutDir: true },
});
