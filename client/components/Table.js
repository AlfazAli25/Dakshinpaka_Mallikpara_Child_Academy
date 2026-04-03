'use client';

import { useRouter } from 'next/navigation';

const statusClassMap = {
  PAID: 'status-badge status-success',
  APPROVED: 'status-badge status-success',
  VERIFIED: 'status-badge status-success',
  COMPLETED: 'status-badge status-success',
  ACTIVE: 'status-badge status-success',
  PRESENT: 'status-badge status-success',
  PENDING: 'status-badge status-warning',
  PROCESSING: 'status-badge status-warning',
  DUE: 'status-badge status-warning',
  NOT_UPLOADED: 'status-badge status-warning',
  UNPAID: 'status-badge status-danger',
  REJECTED: 'status-badge status-danger',
  FAILED: 'status-badge status-danger',
  ABSENT: 'status-badge status-danger',
  INACTIVE: 'status-badge status-danger',
  UPLOADED: 'status-badge status-success',
};

const getStatusClass = (rawValue) => {
  if (typeof rawValue !== 'string') {
    return '';
  }
  const key = rawValue.trim().toUpperCase();
  return statusClassMap[key] || '';
};

export default function Table({ columns = [], rows = [], getRowHref, loading = false, skeletonRowCount = 6 }) {
  const router = useRouter();

  const renderCell = (col, row) => {
    const value = row[col.key];
    if (value === undefined || value === null || value === '') {
      return '-';
    }

    const isStatusColumn = /status/i.test(col.key);
    const statusClass = isStatusColumn ? getStatusClass(value) : '';
    if (statusClass) {
      return <span className={statusClass}>{value}</span>;
    }

    return value;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-red-700 text-left">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 font-semibold text-red-50">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: Math.max(3, skeletonRowCount) }).map((_, rowIndex) => (
                <tr
                  key={`skeleton-row-${rowIndex}`}
                  className={`border-t border-slate-100 ${rowIndex % 2 === 1 ? 'bg-red-50/25' : ''}`}
                >
                  {columns.length === 0 ? (
                    <td className="px-4 py-4">
                      <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                    </td>
                  ) : (
                    columns.map((col, colIndex) => (
                      <td key={`skeleton-cell-${col.key}-${rowIndex}`} className="px-4 py-4">
                        <div
                          className={`h-4 animate-pulse rounded bg-slate-200 ${
                            colIndex === 0 ? 'w-3/4 max-w-40' : 'w-full max-w-32'
                          }`}
                        />
                      </td>
                    ))
                  )}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={Math.max(columns.length, 1)}>
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const href = getRowHref ? getRowHref(row) : '';
                const clickable = Boolean(href);

                return (
                  <tr
                    key={row.id || index}
                    className={`border-t border-slate-100 ${index % 2 === 1 ? 'bg-red-50/25' : ''} ${
                      clickable ? 'cursor-pointer hover:bg-red-50' : ''
                    }`}
                    onClick={() => {
                      if (clickable) {
                        router.push(href);
                      }
                    }}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-slate-700">
                        {renderCell(col, row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}