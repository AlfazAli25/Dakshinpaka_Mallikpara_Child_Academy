'use client';

import { SCHOOL_NAME } from '@/lib/school-config';

export default function SchoolBrandPanel({ subtitle = 'Building a stronger school community every day.' }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-gradient-to-r from-white via-red-50 to-white p-4 shadow-sm md:p-6">
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
        <div className="grid place-items-center rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <img
            src="/School_Logo.png"
            alt={`${SCHOOL_NAME} Logo`}
            className="h-28 w-28 object-contain md:h-44 md:w-44"
          />
        </div>

        <div className="text-center md:max-w-2xl md:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600">Official School Identity</p>
          <h3 className="mt-2 text-xl font-bold text-red-900 md:text-2xl">{SCHOOL_NAME}</h3>
          <p className="mt-2 text-sm text-slate-700 md:text-base">{subtitle}</p>
        </div>
      </div>
    </section>
  );
}