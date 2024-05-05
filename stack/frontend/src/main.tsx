import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'; 
import { AppRouter } from './router';
import './index.css'
import './i18n.ts'


const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                <AppRouter />
                {/* <ReactQueryDevtools initialIsOpen={false}/> */}
            </QueryClientProvider>
        </React.StrictMode>
    </BrowserRouter>
);