import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    outDir: 'build/client',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        engineTests: fileURLToPath(new URL('./tests.html', import.meta.url)),
        interfaceTests: fileURLToPath(new URL('./ui-tests.html', import.meta.url)),
        multiplayerTests: fileURLToPath(new URL('./multiplayer-tests.html', import.meta.url)),
      },
    },
  },
});
