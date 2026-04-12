"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const MONTHLY_FEE_AMOUNT = 200;

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

  return parsed.toLocaleDateString('en-GB');
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
    pendingFeeWarning: {
      title: 'Pending Fee Alert',
      message: 'Your pending fees are higher than one monthly fee. Please clear dues soon to avoid interruptions in school activities.',
      pendingFeeLabel: 'Pending Fee',
      payNow: 'Pay Now',
      close: 'Close warning'
    },
    sidebar: {
      nextExamTitle: 'Next Exam',
      loading: 'Loading next exam...',
      empty: 'No Upcoming Exam',
      ongoing: 'Ongoing',
      scheduled: 'Scheduled'
    },
    links: [
      { href: '/student/dashboard', label: 'Dashboard' },
      { href: '/student/timetable', label: 'Timetable' },
      { href: '/student/exams', label: 'Exams' },
      { href: '/student/results', label: 'Results' },
      { href: '/student/attendance', label: 'Attendance' },
      { href: '/student/fees', label: 'Fees' }
    ]
  },
  bn: {
    title: 'স্টুডেন্ট প্যানেল',
    pendingFeeWarning: {
      title: 'বকেয়া ফি সতর্কতা',
      message: 'আপনার বকেয়া ফি এক মাসের ফি-এর চেয়ে বেশি। স্কুলের কার্যক্রমে বাধা এড়াতে দ্রুত বকেয়া পরিশোধ করুন।',
      pendingFeeLabel: 'বকেয়া ফি',
      payNow: 'এখনই পরিশোধ করুন',
      close: 'সতর্কতা বন্ধ করুন'
    },
    sidebar: {
      nextExamTitle: 'পরবর্তী পরীক্ষা',
      loading: 'পরবর্তী পরীক্ষা লোড হচ্ছে...',
      empty: 'কোনো আসন্ন পরীক্ষা নেই',
      ongoing: 'চলমান',
      scheduled: 'নির্ধারিত'
    },
    links: [
      { href: '/student/dashboard', label: 'ড্যাশবোর্ড' },
      { href: '/student/timetable', label: 'রুটিন' },
      { href: '/student/exams', label: 'পরীক্ষা' },
      { href: '/student/results', label: 'ফলাফল' },
      { href: '/student/attendance', label: 'উপস্থিতি' },
      { href: '/student/fees', label: 'ফি' }
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
  const [pendingFeeWarning, setPendingFeeWarning] = useState({
    visible: false,
    amount: 0
  });

  useEffect(() => {
    const { token, user } = getAuthContext();
    if (!token || !user || user.role !== 'student') {
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

        const examsResponse = await get(`/exams?classId=${studentClassId}&page=1&limit=200`, token);

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

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPendingFeeWarning = async () => {
      try {
        const student = await getCurrentStudentRecord();
        const { token } = getAuthContext();

        if (!token) {
          if (active) {
            setPendingFeeWarning({ visible: false, amount: 0 });
          }
          return;
        }

        const feesResponse = await get('/student/fees', token);
        const ledgerPendingAmount = (Array.isArray(feesResponse.data) ? feesResponse.data : []).reduce(
          (sum, item) => sum + Math.max(Number(item?.amountDue || 0) - Number(item?.amountPaid || 0), 0),
          0
        );

        const profilePendingAmount = Math.max(Number(student?.pendingFees || 0), 0);
        const pendingAmount = Math.max(ledgerPendingAmount, profilePendingAmount);

        if (active) {
          setPendingFeeWarning({
            visible: pendingAmount > MONTHLY_FEE_AMOUNT,
            amount: pendingAmount
          });
        }
      } catch (_error) {
        if (active) {
          setPendingFeeWarning({ visible: false, amount: 0 });
        }
      }
    };

    loadPendingFeeWarning();

    return () => {
      active = false;
    };
  }, []);

  const panelTitle = studentName ? `${current.welcome || 'Welcome'}, ${studentName}` : current.title;
  const nextExamSlot = upcomingExamSlots[0] || null;

  const sidebarUpcomingExamWidget = (
    <div className="rounded-xl border border-white/25 bg-white/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-100/95">{current.sidebar.nextExamTitle}</p>

      {loadingUpcomingExamSlots ? (
        <p className="mt-2 text-xs text-red-50/90">{current.sidebar.loading}</p>
      ) : !nextExamSlot ? (
        <p className="mt-2 text-xs font-semibold text-red-50">{current.sidebar.empty}</p>
      ) : (
        <div className="mt-2">
          <div className="rounded-lg border border-red-100 bg-white px-2.5 py-2 text-red-900 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold leading-tight">{nextExamSlot.examName}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  nextExamSlot.status === 'Ongoing'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {nextExamSlot.status === 'Ongoing' ? current.sidebar.ongoing : current.sidebar.scheduled}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-800">{nextExamSlot.subjectName}</p>
            <p className="text-[11px] text-slate-600">
              {formatDateLabel(nextExamSlot.startDate)} | {formatTimeLabel(nextExamSlot.startDate)} - {formatTimeLabel(nextExamSlot.endDate)}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const showPendingFeeWarning = pendingFeeWarning.visible && pendingFeeWarning.amount > MONTHLY_FEE_AMOUNT;

  const onClosePendingFeeWarning = () => {
    setPendingFeeWarning((prev) => ({
      ...prev,
      visible: false
    }));
  };

  const onPayNowFromWarning = () => {
    const amount = Math.max(Number(pendingFeeWarning.amount || 0), 0);
    router.push(`/student/checkout?amount=${amount}`);
    onClosePendingFeeWarning();
  };

  return (
    <>
      <AppShell title={panelTitle} links={current.links} sidebarExtra={sidebarUpcomingExamWidget}>
        {children}
      </AppShell>

      {showPendingFeeWarning ? (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[95] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2">
          <div className="pointer-events-auto overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-red-50 shadow-2xl animate-fade-up">
            <div className="flex items-start justify-between gap-3 border-b border-amber-100 px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.3 3.4L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3l-8.5-14.6a2 2 0 00-3.4 0z" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-extrabold uppercase tracking-wide text-amber-800">
                    {current.pendingFeeWarning.title}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-700">{current.pendingFeeWarning.message}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClosePendingFeeWarning}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={current.pendingFeeWarning.close}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {current.pendingFeeWarning.pendingFeeLabel}
              </p>
              <p className="mt-1 text-2xl font-black text-red-700">INR {pendingFeeWarning.amount}</p>

              <button
                type="button"
                onClick={onPayNowFromWarning}
                className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
              >
                {current.pendingFeeWarning.payNow}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}