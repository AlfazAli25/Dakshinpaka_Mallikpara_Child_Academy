'use client';

import { Bell, CalendarDays, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const formatToday = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

const getInitials = (name = '') => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'AD';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export default function DashboardTopSection({ name = 'Administrator', unreadNotifications = 0 }) {
  return (
    <motion.section
      className="grid gap-4 rounded-3xl border border-red-100/70 bg-white/80 p-5 shadow-[0_24px_52px_-34px_rgba(153,27,27,0.65)] backdrop-blur-xl md:grid-cols-[1.4fr,1fr] dark:border-red-400/20 dark:bg-slate-900/70"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-red-700 dark:border-red-400/30 dark:bg-red-900/25 dark:text-red-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          School Performance Center
        </p>
        <h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-red-50 md:text-3xl">Good to see you, {name}</h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-600 dark:text-red-100/80">
          <CalendarDays className="h-4 w-4 text-red-600" aria-hidden="true" />
          {formatToday()}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-4 dark:border-red-400/20 dark:from-red-900/30 dark:to-slate-900/40">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">Notifications</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-red-50">{unreadNotifications}</p>
        </div>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-700 text-white shadow-lg">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </motion.section>
  );
}
