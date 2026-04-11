import { memo } from 'react';

function PageHeader({ eyebrow, title, description, rightSlot }) {
  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-red-100/90 bg-white/80 p-5 shadow-[0_26px_56px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl md:p-6 dark:border-red-400/20 dark:bg-slate-900/70">
      <div className="mb-4 h-2.5 w-28 rounded-full bg-gradient-to-r from-red-800 via-red-600 to-red-300 shadow-sm shadow-red-200" />
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-200">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl dark:text-red-50">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base dark:text-red-100/80">{description}</p>}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </div>
  );
}

export default memo(PageHeader);