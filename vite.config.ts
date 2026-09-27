import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// VITE_BASE_PATH: en GitHub Pages debe ser "/<nombre-del-repositorio>/".
// El workflow de despliegue lo rellena automáticamente.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'] } } },
  },
  server: { port: 5173, host: true },
});
