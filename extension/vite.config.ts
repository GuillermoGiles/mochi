import { defineConfig } from 'vite';

// Arma la ventanita de la extensión en dist/ (se carga en Chrome con "Cargar descomprimida").
export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: { popup: 'popup.html', background: 'src/background.ts' },
      // El proceso de fondo tiene que tener un nombre fijo (lo nombra el manifest).
      output: { entryFileNames: (c) => (c.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js') },
    },
  },
});
