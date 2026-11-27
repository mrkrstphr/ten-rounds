import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        engineTests: fileURLToPath(new URL('./tests.html', import.meta.url)),
        interfaceTests: fileURLToPath(new URL('./ui-tests.html', import.meta.url)),
      },
    },
  },
});
