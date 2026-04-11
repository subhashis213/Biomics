import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('stream-chat') || id.includes('stream-chat-react')) return 'vendor-stream-chat';
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
    proxy: {
      '/auth': 'http://localhost:5002',
      '/videos': 'http://localhost:5002',
      '/uploads': 'http://localhost:5002',
      '/quizzes': 'http://localhost:5002',
      '/feedback': 'http://localhost:5002'
    }
  }
});