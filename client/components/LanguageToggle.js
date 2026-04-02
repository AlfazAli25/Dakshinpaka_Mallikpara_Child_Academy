'use client';

import { useLanguage } from '@/lib/language-context';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex rounded-lg border border-red-100 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
          language === 'en' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-red-50 hover:text-red-700'
        }`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLanguage('bn')}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
          language === 'bn' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-red-50 hover:text-red-700'
        }`}
      >
        বাংলা
      </button>
    </div>
  );
}
