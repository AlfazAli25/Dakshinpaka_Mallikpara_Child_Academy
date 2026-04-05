"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getUser } from '@/lib/session';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const toId = (value) => String(value?._id || value || '');

const toValidDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getUpcomingExamSlots = (exams = [], classId = '') => {
  const normalizedClassId = String(classId || '').trim();
  const nowMs = Date.now();

  const slots = [];

  (Array.isArray(exams) ? exams : []).forEach((exam) => {
    const examId = toId(exam);
    const examClassId = toId(exam?.classId);
    if (normalizedClassId && examClassId && examClassId !== normalizedClassId) {
      return;
    }

    const examName = String(exam?.examName || exam?.description || 'Exam').trim() || 'Exam';

    const fallbackSubjects = Array.isArray(exam?.subjects)
      ? exam.subjects
          .map((subject) => ({
            subjectId: toId(subject),
            label: subject?.name || subject?.code || 'Subject'
          }))
          .filter((subject) => subject.subjectId)
      : [];

    const scheduleRows = Array.isArray(exam?.schedule)
      ? exam.schedule
          .map((slot, index) => {
            const slotClassId = toId(slot?.classId) || examClassId;
            if (normalizedClassId && slotClassId && slotClassId !== normalizedClassId) {
              return null;
            }

            const subjectId = toId(slot?.subjectId);
            const linkedFallbackSubject = fallbackSubjects.find((subject) => subject.subjectId === subjectId);
            const subjectLabel =
              slot?.subjectId?.name ||
              slot?.subjectId?.code ||
              linkedFallbackSubject?.label ||
              fallbackSubjects[0]?.label ||
              'Subject';

            const startDate = toValidDate(slot?.startDate);
            const endDate = toValidDate(slot?.endDate);
            if (!startDate || !endDate) {
              return null;
            }

            if (endDate.getTime() < nowMs) {
              return null;
            }

            const status = nowMs >= startDate.getTime() && nowMs <= endDate.getTime() ? 'Ongoing' : 'Scheduled';

            return {
              id: `${examId}-${subjectId || index}-${startDate.getTime()}`,
              examName,
              subjectName: subjectLabel,
              startDate,
              endDate,
              status
            };
          })
          .filter(Boolean)
      : [];

    if (scheduleRows.length > 0) {
      slots.push(...scheduleRows);
      return;
    }

    const fallbackStartDate = toValidDate(exam?.startDate || exam?.date || exam?.examDate);
    const fallbackEndDate = toValidDate(exam?.endDate) || fallbackStartDate;

    if (!fallbackStartDate || !fallbackEndDate || fallbackEndDate.getTime() < nowMs) {
      return;
    }

    const status = nowMs >= fallbackStartDate.getTime() && nowMs <= fallbackEndDate.getTime() ? 'Ongoing' : 'Scheduled';

    slots.push({
      id: `${examId || examName}-${fallbackStartDate.getTime()}`,
      examName,
      subjectName: fallbackSubjects[0]?.label || 'Subject',
      startDate: fallbackStartDate,
      endDate: fallbackEndDate,
      status
    });
  });

  return slots
    .sort((left, right) => {
      const leftOrder = left.status === 'Ongoing' ? 0 : 1;
      const rightOrder = right.status === 'Ongoing' ? 0 : 1;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.startDate.getTime() - right.startDate.getTime();
    })
    .slice(0, 4);
};

const formatDateLabel = (value) => {
  const parsed = toValidDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString();
};

const formatTimeLabel = (value) => {
  const parsed = toValidDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const translations = {
  en: {
    title: 'Student Panel',
    sidebar: {
      upcomingExamsTitle: 'Upcoming Exams & Timetable',
      loading: 'Loading upcoming exams...',
      empty: 'No Upcoming Exam',
      ongoing: 'Ongoing',
      scheduled: 'Scheduled'
    },
    links: [
      { href: '/student/dashboard', label: 'Dashboard' },
      { href: '/student/timetable', label: 'Timetable' },
      { href: '/student/results', label: 'Results' },
      { href: '/student/attendance', label: 'Attendance' },
      { href: '/student/fees', label: 'Fees' },
      { href: '/student/checkout', label: 'Checkout' }
    ]
  },
  bn: {
    title: 'স্টুডেন্ট প্যানেল',
    sidebar: {
      upcomingExamsTitle: 'আসন্ন পরীক্ষা ও সময়সূচি',
      loading: 'আসন্ন পরীক্ষা লোড হচ্ছে...',
      empty: 'কোনো আসন্ন পরীক্ষা নেই',
      ongoing: 'চলমান',
      scheduled: 'নির্ধারিত'
    },
    links: [
      { href: '/student/dashboard', label: 'ড্যাশবোর্ড' },
      { href: '/student/timetable', label: 'রুটিন' },
      { href: '/student/results', label: 'ফলাফল' },
      { href: '/student/attendance', label: 'উপস্থিতি' },
      { href: '/student/fees', label: 'ফি' },
      { href: '/student/checkout', label: 'চেকআউট' }
    ]
  }
};

export default function StudentLayout({ children }) {
  const router = useRouter();
  const { language } = useLanguage();
  const current = translations[language] || translations.en;
  const [studentName, setStudentName] = useState('');
  const [upcomingExamSlots, setUpcomingExamSlots] = useState([]);
  const [loadingUpcomingExamSlots, setLoadingUpcomingExamSlots] = useState(true);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== 'student') {
      router.replace('/login');
      return;
    }

    setStudentName(String(user.name || '').trim());
  }, [router]);

  useEffect(() => {
    let active = true;

    const loadUpcomingExamSlots = async () => {
      setLoadingUpcomingExamSlots(true);

      try {
        const student = await getCurrentStudentRecord();
        const { token } = getAuthContext();
        const studentClassId = toId(student?.classId);

        if (!token || !studentClassId) {
          if (active) {
            setUpcomingExamSlots([]);
          }
          return;
        }

        const examsResponse = await get(`/exams?classId=${studentClassId}&page=1&limit=200`, token, {
          forceRefresh: true,
          cacheTtlMs: 0
        });

        if (!active) {
          return;
        }

        setUpcomingExamSlots(getUpcomingExamSlots(examsResponse.data || [], studentClassId));
      } catch (_error) {
        if (active) {
          setUpcomingExamSlots([]);
        }
      } finally {
        if (active) {
          setLoadingUpcomingExamSlots(false);
        }
      }
    };

    loadUpcomingExamSlots();
    const timer = setInterval(loadUpcomingExamSlots, 60000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const panelTitle = studentName ? `Welcome, ${studentName}` : current.title;

  const sidebarUpcomingExamWidget = (
    <div className="rounded-xl border border-white/25 bg-white/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-100/95">{current.sidebar.upcomingExamsTitle}</p>

      {loadingUpcomingExamSlots ? (
        <p className="mt-2 text-xs text-red-50/90">{current.sidebar.loading}</p>
      ) : upcomingExamSlots.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-red-50">{current.sidebar.empty}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {upcomingExamSlots.map((slot) => (
            <div key={slot.id} className="rounded-lg border border-red-100 bg-white px-2.5 py-2 text-red-900 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold leading-tight">{slot.examName}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    slot.status === 'Ongoing'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {slot.status === 'Ongoing' ? current.sidebar.ongoing : current.sidebar.scheduled}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium text-slate-800">{slot.subjectName}</p>
              <p className="text-[11px] text-slate-600">
                {formatDateLabel(slot.startDate)} | {formatTimeLabel(slot.startDate)} - {formatTimeLabel(slot.endDate)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AppShell title={panelTitle} links={current.links} sidebarExtra={sidebarUpcomingExamWidget}>
      {children}
    </AppShell>
  );
}