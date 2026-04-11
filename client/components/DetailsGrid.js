import { memo } from 'react';
import { isAttendanceLabel, isAttendanceLow } from '@/lib/attendance-warning';

function DetailsGrid({ items = [] }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {items.map((item, index) => {
        const label = String(item?.label || '').trim() || `Field ${index + 1}`;
        const rawValue = item?.value;
        const value = rawValue === undefined || rawValue === null || rawValue === '' ? '-' : String(rawValue);
        const highlighted = Boolean(item?.highlight);
        const attendanceWarning = !highlighted && isAttendanceLabel(label) && isAttendanceLow(value);

        const containerClass = highlighted
          ? 'border-red-200 bg-red-50/85 dark:border-red-500/35 dark:bg-red-900/20'
          : attendanceWarning
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-500/35 dark:bg-amber-900/20'
            : 'border-slate-200 bg-white/85 dark:border-red-400/20 dark:bg-slate-900/75';

        const valueClass = highlighted
          ? 'text-red-800 dark:text-red-100'
          : attendanceWarning
            ? 'text-amber-800 dark:text-amber-200'
            : 'text-slate-800 dark:text-red-100';

        return (
          <div
            key={`${label}-${index}`}
            className={`rounded-xl border px-3 py-2.5 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.85)] ${containerClass}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-red-100/70">{label}</p>
            <p className={`mt-1 break-words text-sm font-semibold ${valueClass}`}>
              {value}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default memo(DetailsGrid);
