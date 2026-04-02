export default function StatCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      <div className="mt-4 h-1.5 w-20 rounded-full bg-gradient-to-r from-red-700 to-red-300" />
    </div>
  );
}