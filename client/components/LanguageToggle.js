'use client';

import { useLanguage } from '@/lib/language-context';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex rounded-xl border border-red-100/90 bg-white/85 p-1 shadow-[0_14px_30px_-24px_rgba(153,27,27,0.85)] backdrop-blur dark:border-red-400/25 dark:bg-slate-900/75">
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
          language === 'en'
            ? 'bg-red-700 text-white'
            : 'text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-red-100/80 dark:hover:bg-red-900/25 dark:hover:text-red-100'
        }`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLanguage('bn')}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
          language === 'bn'
            ? 'bg-red-700 text-white'
            : 'text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-red-100/80 dark:hover:bg-red-900/25 dark:hover:text-red-100'
        }`}
      >
        বাংলা
      </button>
    </div>
  );
}
