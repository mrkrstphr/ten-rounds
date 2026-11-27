import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  environments: {
    ssr: { build: { rollupOptions: { input: './server/app.js' } } },
  },
});
