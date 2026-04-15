'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'sms-ui-theme';
const THEME_VERSION_KEY = 'sms-ui-theme-version';
const THEME_VERSION = '3';
const LOCKED_THEME = 'light';

const ThemeContext = createContext(null);

const applyThemeToDom = () => {
  if (typeof document === 'undefined') {
    return;
  }

  const html = document.documentElement;
  html.dataset.theme = LOCKED_THEME;
  html.classList.remove('dark');
  html.style.colorScheme = LOCKED_THEME;
};

export function ThemeProvider({ children }) {
  const [mounted, setMounted] = useState(false);

  const enforceLightTheme = useCallback(() => {
    applyThemeToDom();

    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, LOCKED_THEME);
      window.localStorage.setItem(THEME_VERSION_KEY, THEME_VERSION);
    } catch (_error) {
      // Ignore local storage write failures.
    }
  }, []);

  useEffect(() => {
    enforceLightTheme();
    setMounted(true);
  }, [enforceLightTheme]);

  const setTheme = useCallback(() => {
    enforceLightTheme();
  }, [enforceLightTheme]);

  const toggleTheme = useCallback(() => {
    enforceLightTheme();
  }, [enforceLightTheme]);

  const value = useMemo(
    () => ({
      theme: LOCKED_THEME,
      setTheme,
      toggleTheme,
      mounted
    }),
    [mounted, setTheme, toggleTheme]
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
