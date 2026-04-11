import { memo } from 'react';

function InfoCard({ title, children }) {
  return (
    <section className="rounded-3xl border border-red-100/85 bg-white/85 p-5 shadow-[0_24px_52px_-36px_rgba(153,27,27,0.72)] backdrop-blur-xl md:p-6 dark:border-red-400/20 dark:bg-slate-900/75">
      <div className="mb-3 h-1.5 w-16 rounded-full bg-gradient-to-r from-red-800 via-red-600 to-red-300" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-red-50">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default memo(InfoCard);