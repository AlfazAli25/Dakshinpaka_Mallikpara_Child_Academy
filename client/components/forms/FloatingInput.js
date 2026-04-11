'use client';

import { motion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export default function FloatingInput({
  id,
  label,
  type = 'text',
  className = '',
  wrapperClassName = '',
  error = '',
  success = '',
  hint = '',
  floating = true,
  onWheel,
  onKeyDown,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || `field-${generatedId}`;
  const isNumberInput = type === 'number';
  const canFloat = floating && typeof label === 'string' && label.trim().length > 0;

  const handleWheel = (event) => {
    if (isNumberInput && document.activeElement === event.currentTarget) {
      event.currentTarget.blur();
    }

    if (typeof onWheel === 'function') {
      onWheel(event);
    }
  };

  const handleKeyDown = (event) => {
    if (isNumberInput && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
    }

    if (typeof onKeyDown === 'function') {
      onKeyDown(event);
    }
  };

  const sharedInputClassName = cn(
    'peer h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 shadow-[0_8px_24px_-18px_rgba(153,27,27,0.35)] transition focus:outline-none focus:ring-4',
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-red-200/90 focus:border-red-500 focus:ring-red-100'
  );

  return (
    <div className={cn('mb-3', wrapperClassName)}>
      {canFloat ? (
        <label htmlFor={inputId} className="relative block">
          <input
            id={inputId}
            {...props}
            type={type}
            placeholder=" "
            aria-invalid={Boolean(error)}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            className={cn(sharedInputClassName, 'placeholder:text-transparent', className)}
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-sm font-medium text-slate-600 transition-all peer-placeholder-shown:top-1/2 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:text-red-700 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs">
            {label}
          </span>
        </label>
      ) : (
        <label htmlFor={inputId} className="block">
          {label ? <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span> : null}
          <input
            id={inputId}
            {...props}
            type={type}
            aria-invalid={Boolean(error)}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            className={cn(sharedInputClassName, 'placeholder:text-slate-400', className)}
          />
        </label>
      )}

      <motion.p
        initial={false}
        animate={{ opacity: error || success || hint ? 1 : 0, y: error || success || hint ? 0 : -4 }}
        transition={{ duration: 0.18 }}
        className={cn(
          'mt-1 min-h-[16px] text-xs',
          error
            ? 'text-red-600'
            : success
              ? 'text-emerald-600'
              : 'text-slate-500'
        )}
      >
        {error || success || hint || ''}
      </motion.p>
    </div>
  );
}
