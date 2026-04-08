'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import SchoolBrandPanel from '@/components/SchoolBrandPanel';
import InfoCard from '@/components/InfoCard';
import DetailsGrid from '@/components/DetailsGrid';
import { get, getBlob } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext } from '@/lib/user-records';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Student Dashboard',
    description: 'Track your attendance, exams, and fee status from a single place.',
    profilePhotoTitle: 'Student Photo',
    detailsTitle: 'Student Details',
    fields: {
      name: 'Name',
      class: 'Class',
      section: 'Section',
      gender: 'Gender',
      dob: 'Date of Birth',
      guardianContact: 'Guardian Contact',
      email: 'Email',
      admissionNo: 'Admission No',
      rollNo: 'Roll No',
      address: 'Address',
      pendingFees: 'Pending Fees',
      attendance: 'Attendance'
    },
    stats: {
      'Attendance %': 'Attendance %',
      'Upcoming Exam': 'Upcoming Exam',
      'Pending Fees': 'Pending Fees'
    },
    notices: {
      title: 'Notices',
      empty: 'No notices available for your class right now.',
      dueDate: 'Due Date',
      amount: 'Amount',
      important: 'Important',
      payNow: 'Pay Now',
      viewInFees: 'View Payment History in Fees',
      downloadAdmitCard: 'Download Admit Card',
      downloadingAdmitCard: 'Downloading...',
      admitCardDownloadFailed: 'Failed to download admit card right now.'
    }
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'স্টুডেন্ট ড্যাশবোর্ড',
    description: 'এক জায়গায় উপস্থিতি, পরীক্ষা ও ফি দেখুন।',
    profilePhotoTitle: 'শিক্ষার্থীর ছবি',
    detailsTitle: 'শিক্ষার্থীর তথ্য',
    fields: {
      name: 'নাম',
      class: 'ক্লাস',
      section: 'সেকশন',
      gender: 'লিঙ্গ',
      dob: 'জন্মতারিখ',
      guardianContact: 'অভিভাবকের যোগাযোগ',
      email: 'ইমেইল',
      admissionNo: 'ভর্তি নম্বর',
      rollNo: 'রোল নম্বর',
      address: 'ঠিকানা',
      pendingFees: 'বকেয়া ফি',
      attendance: 'উপস্থিতি'
    },
    stats: {
      'Attendance %': 'উপস্থিতি %',
      'Upcoming Exam': 'আসন্ন পরীক্ষা',
      'Pending Fees': 'বকেয়া ফি'
    },
    notices: {
      title: 'নোটিশ',
      empty: 'এখন আপনার ক্লাসের জন্য কোনো নোটিশ নেই।',
      dueDate: 'শেষ তারিখ',
      amount: 'পরিমাণ',
      important: 'গুরুত্বপূর্ণ',
      payNow: 'এখনই পরিশোধ করুন',
      viewInFees: 'ফি সেকশনে পেমেন্ট হিস্টোরি দেখুন',
      downloadAdmitCard: 'অ্যাডমিট কার্ড ডাউনলোড',
      downloadingAdmitCard: 'ডাউনলোড হচ্ছে...',
      admitCardDownloadFailed: 'এই মুহূর্তে অ্যাডমিট কার্ড ডাউনলোড করা যাচ্ছে না।'
    }
  }
};

const DEFAULT_STATS = [
  { title: 'Attendance %', value: '0%' },
  { title: 'Upcoming Exam', value: 'No Upcoming Exam' },
  { title: 'Pending Fees', value: 'INR 0' }
];

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

const getExamWindow = (exam) => {
  const scheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];
  const slotWindows = scheduleRows
    .map((slot) => {
      const startDate = toValidDate(slot?.startDate);
      const endDate = toValidDate(slot?.endDate);

      if (!startDate || !endDate) {
        return null;
      }

      return { startDate, endDate };
    })
    .filter(Boolean);

  if (slotWindows.length > 0) {
    return {
      startDate: new Date(Math.min(...slotWindows.map((item) => item.startDate.getTime()))),
      endDate: new Date(Math.max(...slotWindows.map((item) => item.endDate.getTime())))
    };
  }

  const fallbackStartDate = toValidDate(exam?.startDate || exam?.date || exam?.examDate);
  const fallbackEndDate = toValidDate(exam?.endDate) || fallbackStartDate;

  if (!fallbackStartDate || !fallbackEndDate) {
    return null;
  }

  return {
    startDate: fallbackStartDate,
    endDate: fallbackEndDate
  };
};

const getUpcomingExamValue = (exams) => {
  const nowMs = Date.now();

  const examWindows = (Array.isArray(exams) ? exams : [])
    .map((item) => {
      const examWindow = getExamWindow(item);
      if (!examWindow) {
        return null;
      }

      const examName = String(item?.examName || item?.description || 'Exam').trim() || 'Exam';
      return {
        name: examName,
        startDate: examWindow.startDate,
        endDate: examWindow.endDate
      };
    })
    .filter(Boolean);

  const ongoingExam = examWindows
    .filter((item) => nowMs >= item.startDate.getTime() && nowMs <= item.endDate.getTime())
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];

  if (ongoingExam) {
    return 'Ongoing';
  }

  const nextScheduledExam = examWindows
    .filter((item) => item.startDate.getTime() > nowMs)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];

  return nextScheduledExam?.name || 'No Upcoming Exam';
};

const fetchStudentDashboardData = async () => {
  const { token } = getAuthContext();
  if (!token) {
    return {
      studentProfile: null,
      stats: DEFAULT_STATS,
      notices: []
    };
  }

  const profileRes = await get('/students/me/profile', token, {
    forceRefresh: true,
    cacheTtlMs: 0
  });
  const student = profileRes.data || null;
  if (!student) {
    return {
      studentProfile: null,
      stats: DEFAULT_STATS,
      notices: []
    };
  }

  const [attendanceRes, examsRes, feesRes, noticesRes] = await Promise.all([
    get('/student/attendance', token),
    get(`/exams?classId=${student.classId?._id || ''}`, token),
    get('/student/fees', token),
    get('/notices/student?page=1&limit=12', token, {
      forceRefresh: true,
      cacheTtlMs: 0
    })
  ]);

  const attendanceRows = attendanceRes.data || [];
  const present = attendanceRows.filter((item) => item.status === 'Present').length;
  const attendanceFromRecords = attendanceRows.length ? Math.round((present / attendanceRows.length) * 100) : null;
  const configuredAttendance = Number(student.attendance || 0);
  const attendancePercent = `${
    attendanceFromRecords !== null
      ? attendanceFromRecords
      : Number.isFinite(configuredAttendance)
        ? configuredAttendance
        : 0
  }%`;
  const upcomingExamValue = getUpcomingExamValue(examsRes.data || []);
  const pendingFromFees = (feesRes.data || []).reduce(
    (sum, item) => sum + Math.max((item.amountDue || 0) - (item.amountPaid || 0), 0),
    0
  );

  return {
    studentProfile: student,
    stats: [
      { title: 'Attendance %', value: attendancePercent },
      { title: 'Upcoming Exam', value: upcomingExamValue },
      { title: 'Pending Fees', value: `INR ${pendingFromFees}` }
    ],
    notices: Array.isArray(noticesRes?.data) ? noticesRes.data : []
  };
};

export default function StudentDashboardPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [downloadingNoticeId, setDownloadingNoticeId] = useState('');
  const [admitCardDownloadError, setAdmitCardDownloadError] = useState('');

  const { data, isLoading } = useSWR('student-dashboard', fetchStudentDashboardData, {
    refreshInterval: 60000
  });

  const studentProfile = data?.studentProfile || null;
  const stats = useMemo(() => (Array.isArray(data?.stats) ? data.stats : DEFAULT_STATS), [data]);
  const notices = useMemo(() => (Array.isArray(data?.notices) ? data.notices : []), [data]);

  const formatDate = (value) => {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }

    return parsed.toLocaleDateString('en-GB');
  };

  const downloadBlob = (blob, filename) => {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  const downloadAdmitCard = async (notice) => {
    const noticeId = String(notice?._id || '').trim();
    const actionPath = String(notice?.actionPath || '').trim();

    if (!noticeId || !actionPath) {
      setAdmitCardDownloadError(t.notices.admitCardDownloadFailed);
      return;
    }

    const { token } = getAuthContext();
    if (!token) {
      setAdmitCardDownloadError(t.notices.admitCardDownloadFailed);
      return;
    }

    try {
      setAdmitCardDownloadError('');
      setDownloadingNoticeId(noticeId);
      const blob = await getBlob(actionPath, token, { timeoutMs: 120000 });

      const examToken = String(notice?.title || 'Admit_Card').replace(/[^A-Za-z0-9_-]/g, '_') || 'Admit_Card';
      downloadBlob(blob, `${examToken}.pdf`);
    } catch (error) {
      setAdmitCardDownloadError(String(error?.message || t.notices.admitCardDownloadFailed));
    } finally {
      setDownloadingNoticeId('');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        rightSlot={
          <div className="flex w-full items-center justify-end gap-3 md:w-[560px] md:justify-between">
            <div className="h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:-mt-8 md:h-[152px] md:w-[152px]">
              <img
                src={studentProfile?.profileImageUrl || '/default-student-avatar.svg'}
                alt={t.profilePhotoTitle}
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.src = '/default-student-avatar.svg';
                }}
              />
            </div>
            <LanguageToggle />
          </div>
        }
      />

      <SchoolBrandPanel subtitle="Stay connected with your school, track your progress, and never miss an important update." />

      <InfoCard title={t.notices.title}>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-11/12 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-9/12 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-10/12 animate-pulse rounded bg-slate-200" />
          </div>
        ) : notices.length === 0 ? (
          <p className="text-base font-semibold text-slate-600">{t.notices.empty}</p>
        ) : (
          <div className="space-y-4">
            {notices.map((notice) => {
              const noticeId = String(notice?._id || '');
              const isImportant = Boolean(notice?.isImportant);
              const isPaymentNotice = String(notice?.noticeType || '') === 'Payment';
              const isAdmitCardDownloadNotice =
                String(notice?.actionType || '').trim() === 'ADMIT_CARD_DOWNLOAD' &&
                Boolean(String(notice?.actionPath || '').trim());
              const actionLabel = String(notice?.actionLabel || '').trim() || t.notices.downloadAdmitCard;

              return (
                <div
                  key={noticeId}
                  className={`rounded-xl border p-5 ${isImportant ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xl font-bold text-slate-900">{notice?.title || '-'}</p>
                      <p className="mt-2 text-base font-medium text-slate-700">{notice?.description || '-'}</p>
                    </div>
                    {isImportant ? (
                      <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
                        {t.notices.important}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-700">
                    {notice?.dueDate ? (
                      <p>{t.notices.dueDate}: {formatDate(notice.dueDate)}</p>
                    ) : null}
                    {isPaymentNotice ? (
                      <p>{t.notices.amount}: INR {Number(notice?.amount || 0)}</p>
                    ) : null}
                  </div>

                  {isAdmitCardDownloadNotice ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => downloadAdmitCard(notice)}
                        disabled={downloadingNoticeId === noticeId}
                        className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadingNoticeId === noticeId ? t.notices.downloadingAdmitCard : actionLabel}
                      </button>
                    </div>
                  ) : isPaymentNotice ? (
                    <div className="mt-4">
                      {notice?.canPay ? (
                        <Link
                          href={`/student/payment/${noticeId}`}
                          className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                        >
                          {t.notices.payNow}
                        </Link>
                      ) : (
                        <Link
                          href="/student/fees"
                          className="inline-flex rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                        >
                          {t.notices.viewInFees}
                        </Link>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {admitCardDownloadError ? (
              <p className="text-sm font-medium text-red-600">{admitCardDownloadError}</p>
            ) : null}
          </div>
        )}
      </InfoCard>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} title={t.stats[item.title] || item.title} value={item.value} loading={isLoading} />
        ))}
      </div>

      {isLoading ? (
        <InfoCard title={t.detailsTitle}>
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
          </div>
        </InfoCard>
      ) : studentProfile ? (
        <InfoCard title={t.detailsTitle}>
          <DetailsGrid
            items={[
              { label: t.fields.name, value: studentProfile.userId?.name || '-' },
              { label: t.fields.class, value: formatClassLabel(studentProfile.classId) },
              { label: t.fields.section, value: studentProfile.classId?.section || '-' },
              { label: t.fields.gender, value: studentProfile.gender || '-' },
              { label: t.fields.dob, value: formatDate(studentProfile.dob) },
              { label: t.fields.guardianContact, value: studentProfile.guardianContact || '-' },
              { label: t.fields.email, value: studentProfile.userId?.email || '-' },
              { label: t.fields.admissionNo, value: studentProfile.admissionNo || '-' },
              { label: t.fields.rollNo, value: studentProfile.rollNo || '-' },
              { label: t.fields.address, value: studentProfile.address || '-' },
              { label: t.fields.pendingFees, value: `INR ${studentProfile.pendingFees || 0}`, highlight: true },
              { label: t.fields.attendance, value: `${studentProfile.attendance || 0}%` }
            ]}
          />
        </InfoCard>
      ) : null}

    </div>
  );
}