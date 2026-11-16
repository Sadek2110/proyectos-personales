import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173, open: false },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // rolldown wants a function here, not a map
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'gsap';
          return null;
        },
      },
    },
  },
});
