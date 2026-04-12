'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import SchoolBrandPanel from '@/components/SchoolBrandPanel';
import InfoCard from '@/components/InfoCard';
import DetailsGrid from '@/components/DetailsGrid';
import PortalTopSection from '@/components/dashboard/PortalTopSection';
import { get, getBlob } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext } from '@/lib/user-records';

const DashboardHero3D = dynamic(() => import('@/components/dashboard/DashboardHero3D'), {
  ssr: false
});

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
    },
    welcomeBack: 'Welcome back',
    importantNotices: 'Important Notices',
    brandSubtitle: 'Stay connected with your school, track your progress, and never miss an important update.',
    synthetic: {
      admitCardTitle: 'Admit Card Available',
      admitCardDesc: 'Your Admit Card for {examName}{yearSuffix} is now available for download.',
      upcomingExamFallback: 'upcoming examination'
    },
    examStatus: {
      ongoing: 'Ongoing',
      noUpcoming: 'No Upcoming Exam'
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
    },
    welcomeBack: 'স্বাগতম ফিরে আসার জন্য',
    importantNotices: 'গুরুত্বপূর্ণ নোটিশ',
    brandSubtitle: 'আপনার স্কুলের সাথে সংযুক্ত থাকুন, আপনার অগ্রগতি ট্র্যাক করুন এবং কোনো গুরুত্বপূর্ণ আপডেট মিস করবেন না।',
    synthetic: {
      admitCardTitle: 'অ্যাডমিট কার্ড পাওয়া যাচ্ছে',
      admitCardDesc: '{examName}{yearSuffix}-এর জন্য আপনার অ্যাডমিট কার্ড এখন ডাউনলোডের জন্য উপলব্ধ।',
      upcomingExamFallback: 'আসন্ন পরীক্ষা'
    },
    examStatus: {
      ongoing: 'চলমান',
      noUpcoming: 'কোনো আসন্ন পরীক্ষা নেই'
    }
  }
};

const getDefaults = (t) => [
  { title: 'Attendance %', value: '0%' },
  { title: 'Upcoming Exam', value: t.examStatus.noUpcoming },
  { title: 'Pending Fees', value: 'INR 0' }
];

const parseAdmitCardIdFromPath = (pathValue) => {
  const normalizedPath = String(pathValue || '').trim();
  if (!normalizedPath) {
    return '';
  }

  const match = normalizedPath.match(/\/admit-cards\/([a-f0-9]{24})\/download/i);
  return match ? String(match[1]).trim() : '';
};

const buildAdmitCardSyntheticNotice = (card = {}) => {
  const admitCardId = String(card?._id || '').trim();
  if (!admitCardId) {
    return null;
  }

  const examName = String(card?.examName || card?.examId?.examName || 'upcoming examination').trim() || 'upcoming examination';
  const academicYear = String(card?.academicYear || card?.examId?.academicYear || '').trim();
  const yearSuffix = academicYear ? ` (${academicYear})` : '';

  return {
    _id: `admit-card-${admitCardId}`,
    title: t.synthetic.admitCardTitle,
    description: t.synthetic.admitCardDesc.replace('{examName}', examName).replace('{yearSuffix}', yearSuffix),
    noticeType: 'General',
    status: 'Active',
    isImportant: true,
    sourceType: 'ADMIT_CARD_SYSTEM',
    actionType: 'ADMIT_CARD_DOWNLOAD',
    actionLabel: t.notices.downloadAdmitCard,
    actionPath: `/admit-cards/${admitCardId}/download`,
    admitCardId,
    createdAt: card?.availableAt || card?.updatedAt || new Date().toISOString()
  };
};

const mergeNoticesWithAdmitCards = ({ notices = [], availableAdmitCards = [], t } = {}) => {
  const normalizedNotices = Array.isArray(notices) ? notices : [];
  const availableCards = Array.isArray(availableAdmitCards) ? availableAdmitCards : [];
 
  const existingAdmitCardIds = new Set();
  normalizedNotices.forEach((notice) => {
    const directId = String(notice?.admitCardId || '').trim();
    if (directId) {
      existingAdmitCardIds.add(directId);
      return;
    }
 
    const fromPathId = parseAdmitCardIdFromPath(notice?.actionPath);
    if (fromPathId) {
      existingAdmitCardIds.add(fromPathId);
    }
  });
 
  const syntheticNotices = availableCards
    .map((card) => buildAdmitCardSyntheticNotice(card, t))
    .filter(Boolean)
    .filter((item) => !existingAdmitCardIds.has(String(item.admitCardId || '').trim()));

  return [...syntheticNotices, ...normalizedNotices].sort((left, right) => {
    const leftImportant = left?.isImportant ? 1 : 0;
    const rightImportant = right?.isImportant ? 1 : 0;
    if (leftImportant !== rightImportant) {
      return rightImportant - leftImportant;
    }

    const leftCreated = new Date(left?.createdAt || 0).getTime();
    const rightCreated = new Date(right?.createdAt || 0).getTime();
    return rightCreated - leftCreated;
  });
};

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

const getUpcomingExamValue = (exams, t) => {
  const nowMs = Date.now();
 
  const examWindows = (Array.isArray(exams) ? exams : [])
    .map((item) => {
      const examWindow = getExamWindow(item);
      if (!examWindow) {
        return null;
      }
 
      const examName = String(item?.examName || item?.description || t.synthetic.upcomingExamFallback).trim() || t.synthetic.upcomingExamFallback;
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
    return t.examStatus.ongoing;
  }
 
  const nextScheduledExam = examWindows
    .filter((item) => item.startDate.getTime() > nowMs)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];
 
  return nextScheduledExam?.name || t.examStatus.noUpcoming;
};

const fetchStudentDashboardData = async (t) => {
  const { token } = getAuthContext();
  const defaultStats = getDefaults(t);

  if (!token) {
    return {
      studentProfile: null,
      stats: defaultStats,
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
      stats: defaultStats,
      notices: []
    };
  }

  const [attendanceRes, examsRes, feesRes, noticesRes, admitCardsRes] = await Promise.all([
    get('/student/attendance', token),
    get(`/exams?classId=${student.classId?._id || ''}`, token),
    get('/student/fees', token),
    get('/notices/student?page=1&limit=12', token, {
      forceRefresh: true,
      cacheTtlMs: 0
    }),
    get('/admit-cards/my/available', token, {
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
  const upcomingExamValue = getUpcomingExamValue(examsRes.data || [], t);
  const pendingFromFees = (feesRes.data || []).reduce(
    (sum, item) => sum + Math.max((item.amountDue || 0) - (item.amountPaid || 0), 0),
    0
  );
 
  const notices = mergeNoticesWithAdmitCards({
    notices: Array.isArray(noticesRes?.data) ? noticesRes.data : [],
    availableAdmitCards: Array.isArray(admitCardsRes?.data) ? admitCardsRes.data : [],
    t
  });
 
  return {
    studentProfile: student,
    stats: [
      { title: 'Attendance %', value: attendancePercent },
      { title: 'Upcoming Exam', value: upcomingExamValue },
      { title: 'Pending Fees', value: `INR ${pendingFromFees}` }
    ],
    notices
  };
};

export default function StudentDashboardPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [downloadingNoticeId, setDownloadingNoticeId] = useState('');
  const [admitCardDownloadError, setAdmitCardDownloadError] = useState('');

  const { data, isLoading } = useSWR(t ? ['student-dashboard', t] : null, () => fetchStudentDashboardData(t), {
    refreshInterval: 60000
  });

  const studentProfile = data?.studentProfile || null;
  const defaultStats = useMemo(() => getDefaults(t), [t]);
  const stats = useMemo(() => (Array.isArray(data?.stats) ? data.stats : defaultStats), [data, defaultStats]);
  const notices = useMemo(() => (Array.isArray(data?.notices) ? data.notices : []), [data]);
  const importantNoticeCount = useMemo(
    () => notices.filter((item) => Boolean(item?.isImportant)).length,
    [notices]
  );

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
            <div className="h-24 w-24 overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm md:-mt-8 md:h-[152px] md:w-[152px] dark:border-red-400/20 dark:bg-slate-900/80">
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

      <section className="relative overflow-hidden rounded-3xl border border-red-100/70 bg-gradient-to-br from-white via-red-50/60 to-red-100/70 p-3 shadow-[0_30px_64px_-42px_rgba(153,27,27,0.7)] dark:border-red-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-red-950/35 md:p-4">
        <DashboardHero3D backgroundMode />
        <div className="relative z-10">
          <PortalTopSection
            role="Student"
            heading={studentProfile?.userId?.name ? `${t.welcomeBack}, ${studentProfile.userId.name}` : t.title}
            subheading={t.description}
            metricLabel={t.importantNotices}
            metricValue={String(importantNoticeCount)}
          />
        </div>
      </section>
 
      <SchoolBrandPanel subtitle={t.brandSubtitle} />

      <InfoCard title={t.notices.title}>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-11/12 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-9/12 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-10/12 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ) : notices.length === 0 ? (
          <p className="text-base font-semibold text-slate-600 dark:text-red-100/85">{t.notices.empty}</p>
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
                  className={`rounded-2xl border p-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.8)] ${
                    isImportant
                      ? 'border-amber-300 bg-amber-50/85 dark:border-amber-500/35 dark:bg-amber-900/20'
                      : 'border-red-100 bg-red-50/50 dark:border-red-400/20 dark:bg-red-900/15'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xl font-bold text-slate-900 dark:text-red-50">{notice?.title || '-'}</p>
                      <p className="mt-2 text-base font-medium text-slate-700 dark:text-red-100/85">{notice?.description || '-'}</p>
                    </div>
                    {isImportant ? (
                      <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
                        {t.notices.important}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-700 dark:text-red-100/80">
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
                        className="inline-flex rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadingNoticeId === noticeId ? t.notices.downloadingAdmitCard : actionLabel}
                      </button>
                    </div>
                  ) : isPaymentNotice ? (
                    <div className="mt-4">
                      {notice?.canPay ? (
                        <Link
                          href={`/student/payment/${noticeId}`}
                          className="inline-flex rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-800"
                        >
                          {t.notices.payNow}
                        </Link>
                      ) : (
                        <Link
                          href="/student/fees"
                          className="inline-flex rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 dark:border-red-400/30 dark:bg-slate-900 dark:text-red-100 dark:hover:bg-slate-800"
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
              <p className="text-sm font-medium text-red-600 dark:text-red-300">{admitCardDownloadError}</p>
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
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
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