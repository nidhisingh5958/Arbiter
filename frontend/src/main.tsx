import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/space-grotesk';
import 'lenis/dist/lenis.css';
import './styles/index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { ApiError } from './lib/api';
import { SessionProvider } from './providers/SessionProvider';
import { SmoothScroll } from './providers/SmoothScroll';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 4_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => (err instanceof ApiError && err.status >= 400 && err.status < 500 ? false : count < 2),
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <SmoothScroll>
            <App />
          </SmoothScroll>
        </SessionProvider>
        <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: 'Inter Variable, sans-serif' } }} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
