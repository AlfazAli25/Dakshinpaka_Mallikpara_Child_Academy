'use client';

import { LanguageProvider } from '@/lib/language-context';

export default function Providers({ children }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
