export default function InfoCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-3 h-1 w-14 rounded-full bg-red-600" />
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}