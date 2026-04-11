'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ModernSelect({
  label,
  options = [],
  className = '',
  error = '',
  success = '',
  hint = '',
  ...props
}) {
  return (
    <div className={cn('mb-3', className)}>
      <label className="block">
        {label ? <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-red-100">{label}</span> : null}
        <div className="relative">
          <select
            {...props}
            aria-invalid={Boolean(error)}
            className={cn(
              'h-11 w-full appearance-none rounded-xl border bg-white/90 px-3 pr-10 text-sm text-slate-900 shadow-[0_8px_24px_-18px_rgba(153,27,27,0.35)] transition focus:outline-none focus:ring-4 dark:bg-slate-900/75 dark:text-red-50',
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-500/70 dark:focus:ring-red-500/20'
                : 'border-red-200/90 focus:border-red-500 focus:ring-red-100 dark:border-red-400/35 dark:focus:ring-red-500/20'
            )}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600 dark:text-red-200" />
        </div>
      </label>

      <motion.p
        initial={false}
        animate={{ opacity: error || success || hint ? 1 : 0, y: error || success || hint ? 0 : -4 }}
        transition={{ duration: 0.18 }}
        className={cn(
          'mt-1 min-h-[16px] text-xs',
          error
            ? 'text-red-600 dark:text-red-300'
            : success
              ? 'text-emerald-600 dark:text-emerald-300'
              : 'text-slate-500 dark:text-red-100/75'
        )}
      >
        {error || success || hint || ''}
      </motion.p>
    </div>
  );
}
