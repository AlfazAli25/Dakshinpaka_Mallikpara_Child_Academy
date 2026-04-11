'use client';

import { useEffect, useState } from 'react';
import { useMemo } from 'react';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import { get } from '@/lib/api';
import { TIMETABLE_PERIODS, buildTimetableGrid, sortTimetableRows } from '@/lib/timetable-grid';
import { useLanguage } from '@/lib/language-context';
import { useToast } from '@/lib/toast-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'My Timetable',
    description: 'Check your weekly classes, subjects, and period timings.',
    dayPeriod: 'Day / Period',
    loading: 'Loading timetable...',
    empty: 'No timetable entries found.',
    room: 'Room',
    subjectFallback: 'Subject',
    teacherFallback: 'Teacher',
    periodLabel: 'Period'
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'আমার রুটিন',
    description: 'সাপ্তাহিক ক্লাস, বিষয় ও সময় দেখুন।',
    dayPeriod: 'দিন / পিরিয়ড',
    loading: 'রুটিন লোড হচ্ছে...',
    empty: 'কোনো রুটিন পাওয়া যায়নি।',
    room: 'রুম',
    subjectFallback: 'বিষয়',
    teacherFallback: 'শিক্ষক',
    periodLabel: 'পিরিয়ড'
  }
};

export default function StudentTimetablePage() {
  const toast = useToast();
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const gridRows = useMemo(() => buildTimetableGrid(rows, TIMETABLE_PERIODS), [rows]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const student = await getCurrentStudentRecord();
        const { token } = getAuthContext();
        if (!student?.classId?._id || !token) {
          setRows([]);
          return;
        }

        const query = new URLSearchParams();
        if (student?.classId?.section) {
          query.set('section', String(student.classId.section));
        }

        const response = await get(`/timetable/class/${student.classId._id}?${query.toString()}`, token);
        setRows(sortTimetableRows(Array.isArray(response?.data) ? response.data : []));
      } catch (_error) {
        setRows([]);
        toast.error('Unable to load timetable right now.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [toast]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        rightSlot={<LanguageToggle />}
      />

      <section className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-red-700 text-red-50">
              <tr>
                <th className="rounded-tl-xl px-3 py-3 text-left font-semibold">{t.dayPeriod}</th>
                {TIMETABLE_PERIODS.map((periodNumber, index) => (
                  <th
                    key={periodNumber}
                    className={`px-3 py-3 text-left font-semibold ${index === TIMETABLE_PERIODS.length - 1 ? 'rounded-tr-xl' : ''}`}
                  >
                    {t.periodLabel} {periodNumber}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    {t.loading}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    {t.empty}
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
                                <p className="text-xs font-semibold text-slate-900">{item?.subjectId?.name || t.subjectFallback}</p>
                                <p className="text-xs text-slate-700">{item?.teacherId?.name || t.teacherFallback}</p>
                                <p className="text-[11px] text-slate-600">{item?.startTime} - {item?.endTime}</p>
                                {item?.roomNumber ? (
                                  <p className="text-[11px] text-slate-500">{t.room}: {item.roomNumber}</p>
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