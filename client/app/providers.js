'use client';

import { SWRConfig } from 'swr';
import { LanguageProvider } from '@/lib/language-context';
import { ToastProvider } from '@/lib/toast-context';
import { ThemeProvider } from '@/lib/theme-context';
import PageTransitionLoader from '@/components/animations/PageTransitionLoader';

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <SWRConfig
            value={{
              revalidateOnFocus: true,
              revalidateOnReconnect: true,
              dedupingInterval: 8000,
              focusThrottleInterval: 5000,
              shouldRetryOnError: true,
              errorRetryCount: 2,
              errorRetryInterval: 1000
            }}
          >
            <PageTransitionLoader />
            {children}
          </SWRConfig>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
