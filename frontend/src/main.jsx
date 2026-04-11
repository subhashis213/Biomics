import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './App.css';

const CHUNK_RELOAD_GUARD_KEY = 'biomicshub:chunk-reload-once';

function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(message);
}

function recoverFromChunkError() {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1') return;
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
  } catch {
    // If storage is unavailable, still attempt a reload.
  }
  window.location.reload();
}

window.addEventListener('vite:preloadError', () => {
  recoverFromChunkError();
});

window.addEventListener('unhandledrejection', (event) => {
  if (!isChunkLoadError(event.reason)) return;
  event.preventDefault();
  recoverFromChunkError();
});

window.addEventListener('load', () => {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}, { once: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silent fail: PWA support is progressive enhancement.
      });
    });
  } else {
    // Keep local development deterministic by removing old SW + caches.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });

    if (window.caches?.keys) {
      window.caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key.startsWith('biomicshub-')) {
            window.caches.delete(key);
          }
        });
      });
    }
  }
}