'use client';

import { motion } from 'framer-motion';
import { CalendarDays, GraduationCap, Sparkles, UserRoundCog } from 'lucide-react';

const formatToday = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

const resolveRoleIcon = (role = '') => {
  const value = String(role || '').trim().toLowerCase();
  if (value.includes('teacher')) {
    return UserRoundCog;
  }

  return GraduationCap;
};

export default function PortalTopSection({
  role = 'Student',
  heading,
  subheading,
  metricLabel = 'Highlights',
  metricValue = '0'
}) {
  const RoleIcon = resolveRoleIcon(role);

  return (
    <motion.section
      className="grid gap-4 rounded-3xl border border-red-100/80 bg-white/85 p-5 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.7)] backdrop-blur-xl md:grid-cols-[1.35fr,1fr] dark:border-red-400/20 dark:bg-slate-900/75"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-red-700 dark:border-red-400/30 dark:bg-red-900/25 dark:text-red-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {role} Workspace
        </p>

        <h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-red-50 md:text-3xl">{heading}</h2>
        {subheading ? <p className="mt-2 text-sm text-slate-600 dark:text-red-100/80">{subheading}</p> : null}

        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-red-100/80">
          <CalendarDays className="h-4 w-4 text-red-600" aria-hidden="true" />
          {formatToday()}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-4 dark:border-red-400/20 dark:from-red-900/30 dark:to-slate-900/35">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">{metricLabel}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-red-50">{metricValue}</p>
        </div>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-700 text-white shadow-lg">
          <RoleIcon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </motion.section>
  );
}
