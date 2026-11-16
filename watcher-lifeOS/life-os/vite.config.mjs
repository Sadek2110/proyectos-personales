import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_LOCAL = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    // npm run demo:api en otra terminal; la contraseña de demo es "demo".
    proxy: { '/api': API_LOCAL, '^/login$': API_LOCAL, '/logout': API_LOCAL },
  },
});
