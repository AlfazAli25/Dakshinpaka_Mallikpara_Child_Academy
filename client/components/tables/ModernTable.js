'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search
} from 'lucide-react';
import { isAttendanceKey, isAttendanceLow } from '@/lib/attendance-warning';
import Button from '@/components/ui/button';

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
  UPLOADED: 'status-badge status-success'
};

const toText = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
};

const getStatusClass = (rawValue) => {
  if (typeof rawValue !== 'string') {
    return '';
  }

  return statusClassMap[rawValue.trim().toUpperCase()] || '';
};

const downloadAsCsv = ({ columns = [], rows = [], fileName = 'table-export.csv' }) => {
  if (!Array.isArray(columns) || columns.length === 0 || !Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const safeColumns = columns.filter((column) => column?.key && column?.key !== 'actions');
  const header = safeColumns.map((column) => `"${String(column.label || column.key).replace(/"/g, '""')}"`).join(',');
  const lines = rows.map((row) =>
    safeColumns
      .map((column) => `"${toText(row[column.key]).replace(/"/g, '""')}"`)
      .join(',')
  );

  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', fileName);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

function ModernTable({
  columns = [],
  rows = [],
  getRowHref,
  loading = false,
  skeletonRowCount = 6,
  scrollY = false,
  maxHeightClass = 'max-h-[320px]',
  autoScrollThreshold = 5,
  virtualize = false,
  virtualizationThreshold = 80,
  virtualRowHeight = 52,
  virtualHeight = 420,
  virtualOverscan = 8,
  searchable = false,
  filterKey = '',
  filterOptions = [],
  exportable = false,
  paginate = true,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 50]
}) {
  const router = useRouter();
  const [scrollTop, setScrollTop] = useState(0);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(Math.max(1, Number(initialPageSize) || 10));

  const onRowClick = useCallback(
    (href) => {
      if (href) {
        router.push(href);
      }
    },
    [router]
  );

  const searchedRows = useMemo(() => {
    if (!searchable) {
      return rows;
    }

    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) =>
      columns.some((column) => {
        if (!column?.key || column.key === 'actions') {
          return false;
        }

        return toText(row[column.key]).toLowerCase().includes(normalizedQuery);
      })
    );
  }, [columns, query, rows, searchable]);

  const filteredRows = useMemo(() => {
    if (!filterKey || !activeFilter) {
      return searchedRows;
    }

    return searchedRows.filter((row) => String(row?.[filterKey] || '').trim() === activeFilter);
  }, [activeFilter, filterKey, searchedRows]);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) {
      return filteredRows;
    }

    const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;

    return [...filteredRows].sort((left, right) => {
      const leftValue = toText(left?.[sortConfig.key]).toLowerCase();
      const rightValue = toText(right?.[sortConfig.key]).toLowerCase();

      if (leftValue === rightValue) {
        return 0;
      }

      return leftValue > rightValue ? directionMultiplier : -directionMultiplier;
    });
  }, [filteredRows, sortConfig.direction, sortConfig.key]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  useEffect(() => {
    if (!paginate) {
      return;
    }

    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, paginate, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, activeFilter, sortConfig, pageSize]);

  const paginatedRows = useMemo(() => {
    if (!paginate) {
      return sortedRows;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedRows.slice(startIndex, endIndex);
  }, [currentPage, pageSize, paginate, sortedRows]);

  const shouldAutoScroll = !scrollY && autoScrollThreshold > 0 && paginatedRows.length > autoScrollThreshold;
  const shouldVirtualize = Boolean(virtualize) && !loading && Number(paginatedRows.length || 0) >= Number(virtualizationThreshold || 0);
  const enableVerticalScroll = scrollY || shouldAutoScroll || shouldVirtualize;

  const tableContainerClass = enableVerticalScroll
    ? `overflow-x-auto overflow-y-auto ${maxHeightClass}`
    : 'overflow-x-auto';

  const virtualizedWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: paginatedRows.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0
      };
    }

    const safeRowHeight = Math.max(32, Number(virtualRowHeight) || 52);
    const safeOverscan = Math.max(2, Number(virtualOverscan) || 8);
    const viewportHeight = Math.max(safeRowHeight * 4, Number(virtualHeight) || 420);
    const visibleCount = Math.ceil(viewportHeight / safeRowHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / safeRowHeight) - safeOverscan);
    const endIndex = Math.min(paginatedRows.length, startIndex + visibleCount + safeOverscan * 2);

    return {
      startIndex,
      endIndex,
      topSpacerHeight: startIndex * safeRowHeight,
      bottomSpacerHeight: Math.max(0, (paginatedRows.length - endIndex) * safeRowHeight)
    };
  }, [paginatedRows.length, scrollTop, shouldVirtualize, virtualHeight, virtualOverscan, virtualRowHeight]);

  const rowsToRender = shouldVirtualize
    ? paginatedRows.slice(virtualizedWindow.startIndex, virtualizedWindow.endIndex)
    : paginatedRows;

  const onBodyScroll = useCallback(
    (event) => {
      if (!shouldVirtualize) {
        return;
      }

      setScrollTop(event.currentTarget.scrollTop || 0);
    },
    [shouldVirtualize]
  );

  const onSort = (key, sortable) => {
    if (!sortable) {
      return;
    }

    setSortConfig((previousConfig) => {
      if (previousConfig.key === key) {
        return {
          key,
          direction: previousConfig.direction === 'asc' ? 'desc' : 'asc'
        };
      }

      return {
        key,
        direction: 'asc'
      };
    });
  };

  const renderCell = (column, row) => {
    const value = row[column.key];
    if (value === undefined || value === null || value === '') {
      return '-';
    }

    const statusClass = /status/i.test(column.key) ? getStatusClass(value) : '';
    if (statusClass) {
      return <span className={statusClass}>{value}</span>;
    }

    if (isAttendanceKey(column.key) && isAttendanceLow(value)) {
      return <span className="status-badge status-warning">{value}</span>;
    }

    return value;
  };

  const sortIcon = (column) => {
    if (!column?.sortable) {
      return null;
    }

    if (sortConfig.key !== column.key) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />;
    }

    return sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-red-100/85 bg-white/85 shadow-[0_24px_48px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
      {(searchable || exportable || (filterKey && filterOptions.length > 0)) ? (
        <div className="flex flex-wrap items-end gap-2 border-b border-red-100/85 px-3 py-3 dark:border-red-400/20">
          {searchable ? (
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search table"
                className="h-10 w-full rounded-xl border border-red-200 bg-white pl-9 pr-3 text-sm focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-100 dark:border-red-400/30 dark:bg-slate-900 dark:text-red-50 dark:focus:ring-red-500/20"
                aria-label="Search table rows"
              />
            </label>
          ) : null}

          {filterKey && filterOptions.length > 0 ? (
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              className="h-10 rounded-xl border border-red-200 bg-white px-3 text-sm focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-100 dark:border-red-400/30 dark:bg-slate-900 dark:text-red-50 dark:focus:ring-red-500/20"
              aria-label="Filter table"
            >
              <option value="">All</option>
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}

          {exportable ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Download className="h-4 w-4" />}
              onClick={() => downloadAsCsv({ columns, rows: sortedRows, fileName: 'table-export.csv' })}
              disabled={sortedRows.length === 0}
            >
              Export
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        className={tableContainerClass}
        onScroll={onBodyScroll}
        style={shouldVirtualize ? { maxHeight: `${virtualHeight}px`, height: `${virtualHeight}px` } : undefined}
      >
        <table className="min-w-full text-sm">
          <thead className={`bg-gradient-to-r from-red-900 via-red-700 to-red-900 text-left ${enableVerticalScroll ? 'sticky top-0 z-10' : ''}`}>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-semibold text-red-50">
                  <button
                    type="button"
                    onClick={() => onSort(column.key, Boolean(column.sortable))}
                    className={`inline-flex items-center gap-1 ${column.sortable ? 'hover:text-white' : ''}`}
                    disabled={!column.sortable}
                  >
                    <span>{column.label}</span>
                    {sortIcon(column)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: Math.max(3, skeletonRowCount) }).map((_, rowIndex) => (
                <tr key={`skeleton-row-${rowIndex}`} className={`border-t border-red-50 ${rowIndex % 2 === 1 ? 'bg-red-50/20' : ''}`}>
                  {columns.map((column, colIndex) => (
                    <td key={`${column.key}-${rowIndex}`} className="px-4 py-4">
                      <div
                        className={`h-4 animate-pulse rounded bg-red-100 ${colIndex === 0 ? 'w-3/4 max-w-40' : 'w-full max-w-32'}`}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : rowsToRender.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-red-100/80" colSpan={Math.max(columns.length, 1)}>
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

                <AnimatePresence initial={false}>
                  {rowsToRender.map((row, rowOffset) => {
                    const rowIndex = shouldVirtualize ? virtualizedWindow.startIndex + rowOffset : rowOffset;
                    const href = getRowHref ? getRowHref(row) : '';
                    const clickable = Boolean(href);

                    return (
                      <motion.tr
                        key={row.id || rowIndex}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }}
                        className={`border-t border-red-50 ${rowIndex % 2 === 1 ? 'bg-red-50/20' : ''} ${
                          clickable ? 'cursor-pointer hover:bg-red-50/60 hover:shadow-inner' : ''
                        }`}
                        onClick={() => onRowClick(clickable ? href : '')}
                      >
                        {columns.map((column) => (
                          <td key={column.key} className="px-4 py-3 text-slate-700 dark:text-red-100">
                            {renderCell(column, row)}
                          </td>
                        ))}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>

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

      {paginate && !loading ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-100/85 px-3 py-3 text-xs text-slate-600 dark:border-red-400/20 dark:text-red-100/80">
          {(() => {
            const hasRows = sortedRows.length > 0;
            const startCount = hasRows ? (currentPage - 1) * pageSize + 1 : 0;
            const endCount = hasRows ? Math.min(currentPage * pageSize, sortedRows.length) : 0;

            return (
              <p>
                Showing {startCount} to {endCount} of {sortedRows.length}
              </p>
            );
          })()}

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Math.max(1, Number(event.target.value) || 10))}
              className="h-8 rounded-lg border border-red-200 bg-white px-2 text-xs dark:border-red-400/30 dark:bg-slate-900 dark:text-red-100"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setCurrentPage((previousPage) => Math.max(1, previousPage - 1))}
              disabled={currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 disabled:opacity-50 dark:border-red-400/30 dark:bg-slate-900 dark:text-red-100"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="min-w-[50px] text-center font-semibold text-red-700 dark:text-red-100">{currentPage} / {totalPages}</span>

            <button
              type="button"
              onClick={() => setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 disabled:opacity-50 dark:border-red-400/30 dark:bg-slate-900 dark:text-red-100"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(ModernTable);
