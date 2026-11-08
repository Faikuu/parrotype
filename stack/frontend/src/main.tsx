import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './i18n';
import './themes/fonts';
import App from './App';
import { useSettings } from './store/settings';
import { applyTestFont, applyTheme } from './themes/themes';

// Apply the stored appearance before the first render so there's no flash of the default theme.
const initial = useSettings.getState();
applyTheme(initial.theme);
applyTestFont(initial.font, initial.fontSize);
document.documentElement.lang = initial.uiLanguage;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
