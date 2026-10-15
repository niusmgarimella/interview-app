import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Dev: Vite on :5173 proxies /api to the Express backend on :3000 (cookies work via the proxy).
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } } });
