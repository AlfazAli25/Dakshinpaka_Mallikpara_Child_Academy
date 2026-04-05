import { memo } from 'react';
import { isAttendanceLabel, isAttendanceLow } from '@/lib/attendance-warning';

function StatCard({ title, value, loading = false }) {
  const attendanceWarning = isAttendanceLabel(title) && isAttendanceLow(value);

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${attendanceWarning ? 'border-amber-200' : 'border-red-100'}`}>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {loading ? (
        <div className="mt-3">
          <div className="h-8 w-20 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-1.5 w-20 animate-pulse rounded-full bg-slate-200" />
        </div>
      ) : (
        <>
          <p className={`mt-3 text-3xl font-bold ${attendanceWarning ? 'text-amber-800' : 'text-slate-900'}`}>{value}</p>
          <div
            className={`mt-4 h-1.5 w-20 rounded-full ${
              attendanceWarning
                ? 'bg-gradient-to-r from-amber-600 to-amber-300'
                : 'bg-gradient-to-r from-red-700 to-red-300'
            }`}
          />
        </>
      )}
    </div>
  );
}

export default memo(StatCard);