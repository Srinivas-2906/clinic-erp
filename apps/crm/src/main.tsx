import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { applyDenseMode } from './lib/denseMode';
import App from './App';
import { PlatformAdminApp } from './platform/PlatformAdminApp';

const isPlatformAdminRoute = window.location.pathname.startsWith('/platform');

applyDenseMode();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isPlatformAdminRoute ? <PlatformAdminApp /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
);
