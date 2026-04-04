import { memo } from 'react';

function DetailsGrid({ items = [] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item, index) => {
        const label = String(item?.label || '').trim() || `Field ${index + 1}`;
        const rawValue = item?.value;
        const value = rawValue === undefined || rawValue === null || rawValue === '' ? '-' : String(rawValue);
        const highlighted = Boolean(item?.highlight);

        return (
          <div
            key={`${label}-${index}`}
            className={`rounded-xl border px-3 py-2 shadow-sm ${
              highlighted ? 'border-red-200 bg-red-50/70' : 'border-slate-200 bg-white'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p
              className={`mt-1 break-words text-sm font-semibold ${
                highlighted ? 'text-red-800' : 'text-slate-800'
              }`}
            >
              {value}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default memo(DetailsGrid);
