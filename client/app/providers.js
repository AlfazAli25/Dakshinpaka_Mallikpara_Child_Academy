'use client';

import { SWRConfig } from 'swr';
import { LanguageProvider } from '@/lib/language-context';

export default function Providers({ children }) {
  return (
    <LanguageProvider>
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
    </LanguageProvider>
  );
}
