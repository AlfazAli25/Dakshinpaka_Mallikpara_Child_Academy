'use client';

import { motion } from 'framer-motion';

export default function DashboardHero3D({ className = '', backgroundMode = false }) {
  const containerClassName = backgroundMode
    ? `pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()
    : `relative h-[240px] w-full overflow-hidden rounded-3xl border border-red-200/80 bg-gradient-to-br from-white via-red-50/65 to-red-100/80 shadow-[0_30px_70px_-40px_rgba(153,27,27,0.7)] dark:border-red-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-red-950/40 ${className}`.trim();

  return (
    <div className={containerClassName}>
      <motion.div
        className="absolute -top-10 left-8 h-40 w-40 rounded-3xl bg-red-400/35"
        animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-16 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full border-8 border-red-600/45 bg-red-100/60"
        animate={{ y: [0, 10, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-10 bottom-4 h-44 w-44 rounded-3xl bg-red-200/70"
        animate={{ y: [0, -14, 0], rotate: [0, -10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div
        className={`absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t to-transparent ${
          backgroundMode ? 'from-white/60 dark:from-slate-900/55' : 'from-white/75 dark:from-slate-900/70'
        }`}
      />

      {!backgroundMode ? (
        <div className="absolute inset-0 flex items-end justify-between p-5">
          <div className="rounded-2xl border border-red-200/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur dark:border-red-400/20 dark:bg-slate-900/80">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-200">Performance Scene</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-red-100/85">Interactive analytics layer running in stable mode.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
