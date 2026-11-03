import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  optimizeDeps: {
    noDiscovery: true,
    include: ['react', 'react-dom/client', 'react-router-dom', 'axios', 'lucide-react'],
  },
});
