'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const saved = localStorage.getItem('sms_lang');
    if (saved === 'bn' || saved === 'en') {
      setLanguage(saved);
    }
  }, []);

  const updateLanguage = (value) => {
    setLanguage(value);
    localStorage.setItem('sms_lang', value);
  };

  const value = useMemo(() => ({ language, setLanguage: updateLanguage }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return context;
}
