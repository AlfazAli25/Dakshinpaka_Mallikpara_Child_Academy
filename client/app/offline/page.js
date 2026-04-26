export const metadata = {
  title: 'Offline | School Management System'
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold">You are offline</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The application cannot reach the internet right now. Previously visited dashboard and login pages are still available from cache.
        </p>
        <p className="mt-4 text-sm text-slate-700">
          Reconnect to the internet and refresh to continue with live data.
        </p>
      </div>
    </main>
  );
}
