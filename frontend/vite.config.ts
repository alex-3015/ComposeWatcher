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
  },
});
