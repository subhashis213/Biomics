import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('node_modules/react-player/')
            || id.includes('node_modules/react-image-gallery/')
          ) {
            return 'vendor-chat-media';
          }

          if (
            id.includes('node_modules/react-markdown/')
            || id.includes('node_modules/remark-gfm/')
            || id.includes('node_modules/hast-util-find-and-replace/')
            || id.includes('node_modules/unist-builder/')
            || id.includes('node_modules/unist-util-visit/')
            || id.includes('node_modules/linkifyjs/')
          ) {
            return 'vendor-chat-markdown';
          }

          if (id.includes('node_modules/stream-chat/')) {
            return 'vendor-stream-chat-core';
          }

          if (id.includes('node_modules/livekit-client/')) {
            return 'vendor-livekit';
          }

          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }

          if (
            id.includes('node_modules/react/')
            || id.includes('node_modules/react-dom/')
            || id.includes('node_modules/react-router-dom/')
            || id.includes('node_modules/zustand/')
            || id.includes('node_modules/@tanstack/')
          ) {
            return 'vendor-react';
          }

          return;
        }
      }
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './src/test/setup.js',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  server: {
    port: 5173,
  }
});