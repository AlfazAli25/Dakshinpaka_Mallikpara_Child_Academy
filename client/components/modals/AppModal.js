'use client';

import { AnimatePresence, motion } from 'framer-motion';

export default function AppModal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  maxWidth = 'max-w-lg'
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title || 'Modal dialog'}
        >
          <motion.div
            className={`w-full ${maxWidth} rounded-2xl border border-red-100 bg-white/90 p-5 shadow-[0_24px_60px_-26px_rgba(153,27,27,0.65)] backdrop-blur-2xl dark:border-red-400/20 dark:bg-slate-900/90`}
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                {title ? <h3 className="text-lg font-semibold text-slate-900 dark:text-red-50">{title}</h3> : null}
                {description ? <p className="mt-1 text-sm text-slate-600 dark:text-red-100/80">{description}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-400/30 dark:bg-slate-800 dark:text-red-100"
                aria-label="Close modal"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div>{children}</div>

            {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
