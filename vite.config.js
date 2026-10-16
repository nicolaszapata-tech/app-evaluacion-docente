import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Solo en `npm run dev`: las llamadas a /api van a la función ya desplegada
  // en Vercel (`vercel dev` deja la página en blanco porque el rewrite SPA de
  // vercel.json también captura /src y /@vite). No afecta el build.
  server: {
    proxy: {
      '/api': {
        target: 'https://app-evaluacion-docente.vercel.app',
        changeOrigin: true,
      },
    },
  },
});
