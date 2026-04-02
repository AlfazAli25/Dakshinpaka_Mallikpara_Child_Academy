export default function PageHeader({ eyebrow, title, description, rightSlot }) {
  return (
    <div className="mb-6 rounded-2xl border-2 border-red-200 bg-gradient-to-r from-white via-red-50/70 to-white p-5 shadow-sm md:p-6">
      <div className="mb-4 h-2.5 w-28 rounded-full bg-gradient-to-r from-red-800 via-red-600 to-red-300 shadow-sm shadow-red-200" />
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-red-700">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">{description}</p>}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </div>
  );
}