'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'sms-ui-theme';
const THEME_VERSION_KEY = 'sms-ui-theme-version';
const THEME_VERSION = '2';

const ThemeContext = createContext(null);

const resolveTheme = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const storedVersion = String(window.localStorage.getItem(THEME_VERSION_KEY) || '').trim();
  if (storedVersion !== THEME_VERSION) {
    return 'light';
  }

  const stored = String(window.localStorage.getItem(THEME_STORAGE_KEY) || '').trim();
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }

  return 'light';
};

const applyThemeToDom = (theme) => {
  if (typeof document === 'undefined') {
    return;
  }

  const html = document.documentElement;
  html.dataset.theme = theme;
  html.classList.toggle('dark', theme === 'dark');
  html.style.colorScheme = theme;
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initialTheme = resolveTheme();
    setTheme(initialTheme);
    applyThemeToDom(initialTheme);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    applyThemeToDom(theme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      window.localStorage.setItem(THEME_VERSION_KEY, THEME_VERSION);
    } catch (_error) {
      // Ignore local storage write failures.
    }
  }, [mounted, theme]);

  const toggleTheme = () => {
    setTheme((previousTheme) => (previousTheme === 'dark' ? 'light' : 'dark'));
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      mounted
    }),
    [mounted, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
};
