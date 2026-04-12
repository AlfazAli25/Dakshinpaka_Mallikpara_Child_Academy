"use client";

import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken, getUser } from '@/lib/session';
import { TIMETABLE_PERIODS, buildTimetableGrid, sortTimetableRows } from '@/lib/timetable-grid';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Teaching Panel',
    title: 'Timetable',
    description: 'Review your weekly class schedule with class, subject, and timing details.',
    grid: {
      title: 'Weekly Grid View',
      subtitle: 'Only your assigned periods are shown.',
      dayPeriod: 'Day / Period',
      period: 'Period',
      loading: 'Loading timetable...',
      empty: 'No timetable entries found.',
      subject: 'Subject', // updated below inline
      classLbl: 'Class', // rename reserved words
      section: 'Section',
      room: 'Room'
    },
    days: {
      Monday: 'Monday',
      Tuesday: 'Tuesday',
      Wednesday: 'Wednesday',
      Thursday: 'Thursday',
      Friday: 'Friday',
      Saturday: 'Saturday'
    },
    alerts: {
      errorLoad: 'Unable to load timetable right now.'
    }
  },
  bn: {
    eyebrow: 'টিচিং প্যানেল',
    title: 'সময়সূচী',
    description: 'ক্লাস, বিষয় এবং সময়সহ আপনার সাপ্তাহিক ক্লাসের সময়সূচী পর্যালোচনা করুন।',
    grid: {
      title: 'সাপ্তাহিক গ্রিড ভিউ',
      subtitle: 'শুধুমাত্র আপনার নির্ধারিত পিরিয়ডগুলো দেখানো হয়েছে।',
      dayPeriod: 'দিন / পিরিয়ড',
      period: 'পিরিয়ড',
      loading: 'সময়সূচী লোড হচ্ছে...',
      empty: 'কোনো সময়সূচী পাওয়া যায়নি।',
      subject: 'বিষয়',
      classLbl: 'ক্লাস',
      section: 'সেকশন',
      room: 'রুম'
    },
    days: {
      Monday: 'সোমবার',
      Tuesday: 'মঙ্গলবার',
      Wednesday: 'বুধবার',
      Thursday: 'বৃহস্পতিবার',
      Friday: 'শুক্রবার',
      Saturday: 'শনিবার'
    },
    alerts: {
      errorLoad: 'এই মুহূর্তে সময়সূচী লোড করা যাচ্ছে না।'
    }
  }
};

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
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const toast = useToast();
  const { data, isLoading, error } = useSWR('teacher-timetable', fetchTeacherTimetable, {
    refreshInterval: 60000
  });

  useEffect(() => {
    if (error) {
      toast.error(t.alerts.errorLoad);
    }
  }, [error, toast, t]);

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const gridRows = useMemo(() => buildTimetableGrid(rows, TIMETABLE_PERIODS), [rows]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <section className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="border-b border-red-100 px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-slate-900">{t.grid.title}</h2>
          <p className="text-xs text-slate-600">{t.grid.subtitle}</p>
        </div>

        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-red-700 text-red-50">
              <tr>
                <th className="rounded-tl-xl px-3 py-3 text-left font-semibold">{t.grid.dayPeriod}</th>
                {TIMETABLE_PERIODS.map((periodNumber, index) => (
                  <th
                    key={periodNumber}
                    className={`px-3 py-3 text-left font-semibold ${index === TIMETABLE_PERIODS.length - 1 ? 'rounded-tr-xl' : ''}`}
                  >
                    {t.grid.period} {periodNumber}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    {t.grid.loading}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    {t.grid.empty}
                  </td>
                </tr>
              ) : (
                gridRows.map((dayRow, rowIndex) => (
                  <tr key={dayRow.day} className={rowIndex % 2 === 1 ? 'bg-red-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3 font-semibold text-slate-900">{t.days[dayRow.day] || dayRow.day}</td>
                    {dayRow.cells.map((cell) => (
                      <td key={`${cell.day}-${cell.periodNumber}`} className="border-t border-slate-100 px-2 py-2 align-top">
                        {cell.items.length === 0 ? (
                          <p className="text-xs text-slate-400">-</p>
                        ) : (
                          <div className="space-y-2">
                            {cell.items.map((item) => (
                              <div key={item._id} className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-xs font-semibold text-slate-900">{item?.subjectId?.name || t.grid.subject}</p>
                                <p className="text-xs text-slate-700">
                                  {t.grid.classLbl}: {item?.classId?.name || t.grid.classLbl} | {t.grid.section}: {item?.section || '-'}
                                </p>
                                <p className="text-[11px] text-slate-600">{item?.startTime} - {item?.endTime}</p>
                                {item?.roomNumber ? (
                                  <p className="text-[11px] text-slate-500">{t.grid.room}: {item.roomNumber}</p>
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