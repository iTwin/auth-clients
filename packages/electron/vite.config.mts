
import { defineConfig } from 'vite';

export default defineConfig({
  root: './src/integration-test/test-app',
  build: {
    outDir: './dist/integration-test/test-app',
    emptyOutDir: true,
  },
});