export default function Input({ label, className = '', ...props }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-red-600 focus:ring-2 focus:ring-red-100 ${className}`.trim()}
      />
    </label>
  );
}