'use client';

import { SWRConfig } from 'swr';
import { LanguageProvider } from '@/lib/language-context';
import { ToastProvider } from '@/lib/toast-context';

export default function Providers({ children }) {
  return (
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
          {children}
        </SWRConfig>
      </ToastProvider>
    </LanguageProvider>
  );
}
