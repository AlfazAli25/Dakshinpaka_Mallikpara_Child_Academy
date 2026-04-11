'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAttendanceKey, isAttendanceLow } from '@/lib/attendance-warning';

const statusClassMap = {
  PAID: 'status-badge status-success',
  APPROVED: 'status-badge status-success',
  VERIFIED: 'status-badge status-success',
  COMPLETED: 'status-badge status-success',
  ACTIVE: 'status-badge status-success',
  PRESENT: 'status-badge status-success',
  'PARTIALLY PAID': 'status-badge status-warning',
  PARTIALLY_PAID: 'status-badge status-warning',
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

function Table({
  columns = [],
  rows = [],
  getRowHref,
  loading = false,
  skeletonRowCount = 6,
  scrollY = false,
  maxHeightClass = 'max-h-[288px]',
  autoScrollThreshold = 5,
  virtualize = false,
  virtualizationThreshold = 80,
  virtualRowHeight = 52,
  virtualHeight = 420,
  virtualOverscan = 8
}) {
  const router = useRouter();
  const [scrollTop, setScrollTop] = useState(0);

  const onRowClick = useCallback(
    (href) => {
      if (href) {
        router.push(href);
      }
    },
    [router]
  );

  const shouldAutoScroll = !scrollY && autoScrollThreshold > 0 && rows.length > autoScrollThreshold;
  const shouldVirtualize =
    Boolean(virtualize) && !loading && Number(rows.length || 0) >= Number(virtualizationThreshold || 0);

  const enableVerticalScroll = scrollY || shouldAutoScroll || shouldVirtualize;

  const tableContainerClass = enableVerticalScroll
    ? `overflow-x-auto overflow-y-auto ${maxHeightClass}`
    : 'overflow-x-auto';

  const virtualizedWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: rows.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0
      };
    }

    const safeRowHeight = Math.max(32, Number(virtualRowHeight) || 52);
    const safeOverscan = Math.max(2, Number(virtualOverscan) || 8);
    const viewportHeight = Math.max(safeRowHeight * 4, Number(virtualHeight) || 420);
    const visibleCount = Math.ceil(viewportHeight / safeRowHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / safeRowHeight) - safeOverscan);
    const endIndex = Math.min(rows.length, startIndex + visibleCount + safeOverscan * 2);
    const topSpacerHeight = startIndex * safeRowHeight;
    const bottomSpacerHeight = Math.max(0, (rows.length - endIndex) * safeRowHeight);

    return {
      startIndex,
      endIndex,
      topSpacerHeight,
      bottomSpacerHeight
    };
  }, [rows.length, scrollTop, shouldVirtualize, virtualHeight, virtualOverscan, virtualRowHeight]);

  const rowsToRender = shouldVirtualize
    ? rows.slice(virtualizedWindow.startIndex, virtualizedWindow.endIndex)
    : rows;

  const onBodyScroll = useCallback(
    (event) => {
      if (!shouldVirtualize) {
        return;
      }

      setScrollTop(event.currentTarget.scrollTop || 0);
    },
    [shouldVirtualize]
  );

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

    if (isAttendanceKey(col.key) && isAttendanceLow(value)) {
      return <span className="status-badge status-warning">{value}</span>;
    }

    return value;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
      <div
        className={tableContainerClass}
        onScroll={onBodyScroll}
        style={shouldVirtualize ? { maxHeight: `${virtualHeight}px`, height: `${virtualHeight}px` } : undefined}
      >
        <table className="min-w-full text-sm">
          <thead className={`bg-red-700 text-left ${enableVerticalScroll ? 'sticky top-0 z-10' : ''}`}>
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
              <>
                {shouldVirtualize && virtualizedWindow.topSpacerHeight > 0 ? (
                  <tr>
                    <td colSpan={Math.max(columns.length, 1)} style={{ height: `${virtualizedWindow.topSpacerHeight}px` }} />
                  </tr>
                ) : null}

                {rowsToRender.map((row, index) => {
                  const rowIndex = shouldVirtualize ? virtualizedWindow.startIndex + index : index;
                  const href = getRowHref ? getRowHref(row) : '';
                  const clickable = Boolean(href);

                  return (
                    <tr
                      key={row.id || rowIndex}
                      className={`border-t border-slate-100 ${rowIndex % 2 === 1 ? 'bg-red-50/25' : ''} ${
                        clickable ? 'cursor-pointer hover:bg-red-50' : ''
                      }`}
                      onClick={() => onRowClick(clickable ? href : '')}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-3 text-slate-700">
                          {renderCell(col, row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {shouldVirtualize && virtualizedWindow.bottomSpacerHeight > 0 ? (
                  <tr>
                    <td colSpan={Math.max(columns.length, 1)} style={{ height: `${virtualizedWindow.bottomSpacerHeight}px` }} />
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(Table);