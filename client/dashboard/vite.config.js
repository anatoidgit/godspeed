import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'], // Added to ensure proper module resolution
  },
  build: {
    outDir: path.resolve(__dirname, '../../server/static'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/godspeed': 'http://localhost:4000',
    },
  },
});