import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Coolify deployment on agents.zentacode.com serves this app at the
    // domain root, so the base must be '/' (upstream used '/the-delegation/'
    // for its GitHub Pages site). Without this, assets and GLB models would
    // be requested under /the-delegation/ and 404 at the root domain.
    base: '/',
    plugins: [react(), tailwindcss()],
    // VIEW-ONLY: no Gemini key is defined into the client build. The old
    // process.env.GEMINI_API_KEY define was removed with the Gemini
    // provider; defining a key here would have baked it into client JS.
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
