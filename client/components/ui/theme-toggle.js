'use client';

import { motion } from 'framer-motion';
import { MoonStar, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <button
        type="button"
        className={`h-10 w-10 rounded-xl border border-red-200/60 bg-white/60 ${className}`.trim()}
        aria-label="Toggle theme"
      />
    );
  }

  const isDark = theme === 'dark';

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileTap={{ scale: 0.94 }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.16 }}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white/80 text-red-700 shadow-sm backdrop-blur hover:bg-red-50 dark:border-red-400/40 dark:bg-slate-900/70 dark:text-red-100 dark:hover:bg-slate-800 ${className}`.trim()}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <MoonStar className="h-4 w-4" aria-hidden="true" />}
    </motion.button>
  );
}
