'use client';

import Link from 'next/link';
import { memo } from 'react';
import { usePathname } from 'next/navigation';
import { SCHOOL_NAME } from '@/lib/school-config';

function Sidebar({ title, links, mobileOpen = false, onClose = () => {}, extraContent = null }) {
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

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-red-900/50 bg-gradient-to-b from-red-800 via-red-700 to-red-800 p-4 text-red-50 transition-transform md:static md:z-auto md:w-72 md:translate-x-0 md:p-5 ${
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

        <div className="mb-6 rounded-2xl border-2 border-white/80 bg-white p-4 shadow-lg shadow-red-950/20">
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.12em] text-red-700">{SCHOOL_NAME}</p>
          </div>
          <h2 className="mt-1 text-lg font-bold leading-tight text-red-900">{title}</h2>
        </div>

        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-white text-red-700 shadow-sm ring-1 ring-red-200' : 'text-red-50 hover:bg-red-600/80'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {extraContent ? <div className="mt-5 border-t border-white/20 pt-4">{extraContent}</div> : null}
      </aside>
    </>
  );
}

export default memo(Sidebar);