import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  server: { port: 3000, host: '127.0.0.1' },
  preview: { port: 3000 },
  build: { outDir: 'build' },
});
