import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Dev: Vite on :5173 proxies /api to the Express backend on 127.0.0.1:3000 (explicit IPv4 to avoid Windows ::1 drops).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
