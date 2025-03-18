
import { defineConfig, loadEnv } from 'vite';
const env = loadEnv("", process.cwd(), '');

export default defineConfig({
  root: './src/integration-test/test-app',
  build: {
    outDir: '../../../dist/integration-test/test-app',
    emptyOutDir: true,
  },
  base: "./",
  define: {
    'process.env': env,
  },
});