
import { defineConfig, loadEnv } from 'vite';
const env = loadEnv("", process.cwd(), '');

export default defineConfig({
  root: './src/integration-tests/test-app',
  build: {
    outDir: '../../../dist/integration-tests/test-app',
    emptyOutDir: true,
  },
  define: {
    'process.env': env,
  },
});