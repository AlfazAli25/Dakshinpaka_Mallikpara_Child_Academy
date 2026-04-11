"use client";

import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken, getUser } from '@/lib/session';
import { TIMETABLE_PERIODS, buildTimetableGrid, sortTimetableRows } from '@/lib/timetable-grid';
import { useToast } from '@/lib/toast-context';

const fetchTeacherTimetable = async () => {
  const token = getToken();
  const user = getUser();

  if (!token || !user?.id) {
    return [];
  }

  const response = await get(`/timetable/teacher/${user.id}`, token, {
    retryCount: 2,
    retryDelayMs: 250
  });

  return sortTimetableRows(Array.isArray(response?.data) ? response.data : []);
};

export default function TeacherTimetablePage() {
  const toast = useToast();
  const { data, isLoading, error } = useSWR('teacher-timetable', fetchTeacherTimetable, {
    refreshInterval: 60000
  });

  useEffect(() => {
    if (error) {
      toast.error('Unable to load timetable right now.');
    }
  }, [error, toast]);

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const gridRows = useMemo(() => buildTimetableGrid(rows, TIMETABLE_PERIODS), [rows]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Timetable"
        description="Review your weekly class schedule with class, subject, and timing details."
      />

      <section className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="border-b border-red-100 px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-slate-900">Weekly Grid View</h2>
          <p className="text-xs text-slate-600">Only your assigned periods are shown.</p>
        </div>

        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-red-700 text-red-50">
              <tr>
                <th className="rounded-tl-xl px-3 py-3 text-left font-semibold">Day / Period</th>
                {TIMETABLE_PERIODS.map((periodNumber, index) => (
                  <th
                    key={periodNumber}
                    className={`px-3 py-3 text-left font-semibold ${index === TIMETABLE_PERIODS.length - 1 ? 'rounded-tr-xl' : ''}`}
                  >
                    Period {periodNumber}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    Loading timetable...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    No timetable entries found.
                  </td>
                </tr>
              ) : (
                gridRows.map((dayRow, rowIndex) => (
                  <tr key={dayRow.day} className={rowIndex % 2 === 1 ? 'bg-red-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3 font-semibold text-slate-900">{dayRow.day}</td>
                    {dayRow.cells.map((cell) => (
                      <td key={`${cell.day}-${cell.periodNumber}`} className="border-t border-slate-100 px-2 py-2 align-top">
                        {cell.items.length === 0 ? (
                          <p className="text-xs text-slate-400">-</p>
                        ) : (
                          <div className="space-y-2">
                            {cell.items.map((item) => (
                              <div key={item._id} className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-xs font-semibold text-slate-900">{item?.subjectId?.name || 'Subject'}</p>
                                <p className="text-xs text-slate-700">
                                  Class: {item?.classId?.name || 'Class'} | Section: {item?.section || '-'}
                                </p>
                                <p className="text-[11px] text-slate-600">{item?.startTime} - {item?.endTime}</p>
                                {item?.roomNumber ? (
                                  <p className="text-[11px] text-slate-500">Room: {item.roomNumber}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}