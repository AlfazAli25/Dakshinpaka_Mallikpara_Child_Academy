'use client';

import Link from 'next/link';
import { memo } from 'react';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpen,
  CalendarCheck2,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  Receipt,
  School,
  SquareLibrary,
  UserRoundCog,
  Users
} from 'lucide-react';
import { SCHOOL_NAME } from '@/lib/school-config';

const iconByLabelKey = {
  dashboard: LayoutDashboard,
  students: Users,
  teachers: UserRoundCog,
  classes: SquareLibrary,
  notices: Bell,
  timetable: CalendarCheck2,
  exams: BookOpen,
  marks: ClipboardCheck,
  fees: Receipt,
  results: NotebookPen,
  attendance: ClipboardCheck,
  checkout: Receipt
};

const resolveLabelIcon = (label = '', href = '') => {
  const key = (String(label || '') + ' ' + String(href || '')).toLowerCase();
  for (const [token, icon] of Object.entries(iconByLabelKey)) {
    if (key.includes(token)) {
      return icon;
    }
  }

  return School;
};

function ModernSidebar({
  title,
  links,
  mobileOpen = false,
  desktopOpen = true,
  onClose = () => {},
  extraContent = null
}) {
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation"
        className={`fixed inset-0 z-30 bg-slate-900/45 transition md:hidden ${
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <motion.aside
        initial={false}
        animate={{
          width: desktopOpen ? 286 : 92
        }}
        transition={{ type: 'spring', stiffness: 250, damping: 28 }}
        className={`fixed inset-y-0 left-0 z-40 overflow-y-auto border-r border-red-900/40 bg-gradient-to-b from-red-900 via-red-800 to-red-900 p-4 text-red-50 shadow-2xl md:sticky md:top-[76px] md:h-[calc(100vh-76px)] md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-5 flex items-center justify-between md:hidden">
          <p className="text-sm font-semibold uppercase tracking-wider text-red-100/80">Menu</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/35 text-white hover:bg-white/10"
            aria-label="Close sidebar"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className={`mb-6 rounded-2xl border border-white/20 bg-white/90 p-3 text-red-900 shadow-lg ${desktopOpen ? '' : 'text-center'}`}>
          <div className={`flex items-center gap-3 ${desktopOpen ? '' : 'justify-center'}`}>
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-red-100 bg-white">
              <img src="/School_Logo.png" alt="School logo" className="h-9 w-9 object-contain" />
            </div>
            {desktopOpen ? (
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.11em] text-red-700">{SCHOOL_NAME}</p>
                <h2 className="truncate text-sm font-bold">{title}</h2>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = resolveLabelIcon(link.label, link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                title={!desktopOpen ? link.label : ''}
                className={`group relative flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-white text-red-700 shadow-md ring-1 ring-red-100'
                    : 'text-red-50 hover:bg-white/10'
                } ${desktopOpen ? 'gap-3 justify-start' : 'justify-center'}`}
              >
                <motion.span whileHover={{ rotate: active ? 0 : -8 }} className="inline-flex h-5 w-5 items-center justify-center">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </motion.span>
                {desktopOpen ? <span className="truncate">{link.label}</span> : null}

                {!desktopOpen ? (
                  <span className="pointer-events-none absolute left-[84px] top-1/2 z-10 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 shadow-md group-hover:block">
                    {link.label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {extraContent ? (
          <div className="mt-5 border-t border-white/20 pt-4">
            {desktopOpen ? extraContent : null}
          </div>
        ) : null}
      </motion.aside>
    </>
  );
}

export default memo(ModernSidebar);
