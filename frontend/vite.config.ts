import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { mockApiPlugin } from './mock-plugin';

const useMock = process.env.MOCK === 'true';

export default defineConfig({
  plugins: [vue(), ...(useMock ? [mockApiPlugin()] : [])],
  server: {
    // Proxy is skipped when the mock plugin handles /api/* directly.
    ...(useMock
      ? {}
      : {
          proxy: {
            '/api': {
              target: 'http://localhost:3000',
              changeOrigin: true,
            },
          },
        }),
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/__tests__/**', 'src/mocks/**'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
