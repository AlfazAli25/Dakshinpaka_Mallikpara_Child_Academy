'use client';

import { SCHOOL_NAME } from '@/lib/school-config';

export default function SchoolBrandPanel({ subtitle = 'Building a stronger school community every day.' }) {
  return (
    <section className="rounded-3xl border border-red-100/80 bg-gradient-to-r from-white via-red-50/80 to-white p-4 shadow-[0_26px_52px_-36px_rgba(153,27,27,0.6)] backdrop-blur-xl md:p-6 dark:border-red-400/20 dark:from-slate-900/80 dark:via-red-950/30 dark:to-slate-900/80">
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
        <div className="grid place-items-center rounded-2xl border border-red-100 bg-white p-4 shadow-sm dark:border-red-400/20 dark:bg-slate-900/70">
          <img
            src="/School_Logo.png"
            alt={`${SCHOOL_NAME} Logo`}
            className="h-28 w-28 object-contain md:h-44 md:w-44"
          />
        </div>

        <div className="text-center md:max-w-2xl md:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600 dark:text-red-200">Official School Identity</p>
          <h3 className="mt-2 text-xl font-bold text-red-900 md:text-2xl dark:text-red-50">{SCHOOL_NAME}</h3>
          <p className="mt-2 text-sm text-slate-700 md:text-base dark:text-red-100/85">{subtitle}</p>
        </div>
      </div>
    </section>
  );
}