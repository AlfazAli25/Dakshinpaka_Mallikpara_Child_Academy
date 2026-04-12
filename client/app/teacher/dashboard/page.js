"use client";

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import SchoolBrandPanel from '@/components/SchoolBrandPanel';
import Table from '@/components/Table';
import InfoCard from '@/components/InfoCard';
import DetailsGrid from '@/components/DetailsGrid';
import PortalTopSection from '@/components/dashboard/PortalTopSection';
import Button from '@/components/ui/button';
import { get, getBlob, post } from '@/lib/api';
import { formatClassLabelList, formatClassLabel } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const DashboardHero3D = dynamic(() => import('@/components/dashboard/DashboardHero3D'), {
  ssr: false
});

const text = {
  en: {
    eyebrow: 'Teaching Panel',
    title: 'Teacher Dashboard',
    description: "Review today's classes, attendance work, and exam tasks at a glance.",
    welcome: 'Welcome back',
    subheading: 'Track classes, salary updates, notices, and confirmations from one premium workspace.',
    importantNotices: 'Important Notices',
    brandSubtitle: 'Guide students confidently with school updates, class insights, and exam readiness tools.',
    stats: {
      upcomingExam: 'Upcoming Exam',
      noUpcoming: 'No Upcoming Exam',
      ongoing: 'Ongoing',
      assignedClasses: 'Assigned Classes',
      assignedSubjects: 'Assigned Subjects'
    },
    detailsTitle: 'Teacher Details',
    fields: {
      name: 'Name',
      email: 'Email',
      teacherId: 'Teacher ID',
      contactNumber: 'Contact Number',
      monthlySalary: 'Monthly Salary',
      totalDueSalary: 'Total Due Salary',
      qualifications: 'Qualifications',
      joiningDate: 'Joining Date',
      assignedClasses: 'Assigned Classes',
      assignedSubjects: 'Assigned Subjects'
    },
    classesSubtitle: 'Open Class Student List',
    payment: {
      title: 'Payment Confirmation Required',
      description: 'Please confirm whether you received these salary payments.',
      requested: 'Requested:',
      yes: 'Yes',
      no: 'No',
      processing: 'Processing...',
      successYes: 'Salary payment confirmed successfully.',
      successNo: 'Payment mismatch reported to admin.'
    },
    notices: {
      title: 'Latest Notices',
      empty: 'No teacher notices right now.',
      important: 'Important'
    },
    salary: {
      title: 'Salary History',
      month: 'Month',
      amount: 'Amount',
      status: 'Status',
      paidOn: 'Paid On',
      method: 'Method',
      receiptsTitle: 'Salary Receipt Downloads',
      receiptsDesc: 'Receipts are available for paid salary records only.',
      action: 'Receipt',
      download: 'Download Receipt',
      downloading: 'Downloading...',
      noReceipts: 'No downloadable receipts found.'
    }
  },
  bn: {
    eyebrow: 'টিচিং প্যানেল',
    title: 'টিচার ড্যাশবোর্ড',
    description: 'আজকের ক্লাস, উপস্থিতি এবং পরীক্ষার কাজগুলি এক নজরে দেখুন।',
    welcome: 'স্বাগতম ফিরে আসার জন্য',
    subheading: 'একটি প্রিমিয়াম ওয়ার্কস্পেস থেকে ক্লাস, বেতন আপডেট, নোটিশ এবং কনফার্মেশন নজরে রাখুন।',
    importantNotices: 'গুরুত্বপূর্ণ নোটিশ',
    brandSubtitle: 'স্কুল আপডেট, ক্লাস ইনসাইট এবং পরীক্ষার প্রস্তুতির সাহায্যে শিক্ষার্থীদের আত্মবিশ্বাসের সাথে গাইড করুন।',
    stats: {
      upcomingExam: 'আসন্ন পরীক্ষা',
      noUpcoming: 'কোনো আসন্ন পরীক্ষা নেই',
      ongoing: 'চলমান',
      assignedClasses: 'নির্ধারিত ক্লাস',
      assignedSubjects: 'নির্ধারিত বিষয়'
    },
    detailsTitle: 'শিক্ষকের তথ্য',
    fields: {
      name: 'নাম',
      email: 'ইমেইল',
      teacherId: 'শিক্ষক আইডি',
      contactNumber: 'যোগাযোগ নম্বর',
      monthlySalary: 'মাসিক বেতন',
      totalDueSalary: 'মোট বকেয়া বেতন',
      qualifications: 'শিক্ষাগত যোগ্যতা',
      joiningDate: 'যোগদানের তারিখ',
      assignedClasses: 'নির্ধারিত ক্লাস',
      assignedSubjects: 'নির্ধারিত বিষয়'
    },
    classesSubtitle: 'ওপেন ক্লাস স্টুডেন্ট লিস্ট',
    payment: {
      title: 'পেমেন্ট কনফার্মেশন প্রয়োজন',
      description: 'দয়া করে নিশ্চিত করুন আপনি এই বেতনের টাকা পেয়েছেন কি না।',
      requested: 'অনুরোধ করা হয়েছে:',
      yes: 'হ্যাঁ',
      no: 'না',
      processing: 'প্রসেসিং হচ্ছে...',
      successYes: 'বেতন পরিশোধ সফলভাবে নিশ্চিত করা হয়েছে।',
      successNo: 'পেমেন্ট অমিল হওয়ার বিষয়টি অ্যাডমিনকে জানানো হয়েছে।'
    },
    notices: {
      title: 'সাম্প্রতিক নোটিশ',
      empty: 'এখন কোনো নোটিশ নেই।',
      important: 'গুরুত্বপূর্ণ'
    },
    salary: {
      title: 'বেতন ইতিহাস',
      month: 'মাস',
      amount: 'পরিমাণ',
      status: 'অবস্থা',
      paidOn: 'পরিশোধের তারিখ',
      method: 'পদ্ধতি',
      receiptsTitle: 'স্যালারি রিসিপ্ট ডাউনলোড',
      receiptsDesc: 'পরিশোধিত বেতনের জন্য কেবল রিসিপ্ট ডাউনলোড করা সম্ভব।',
      action: 'রিসিপ্ট',
      download: 'রিসিপ্ট ডাউনলোড করুন',
      downloading: 'ডাউনলোড হচ্ছে...',
      noReceipts: 'কোনো ডাউনলোডযোগ্য রিসিপ্ট পাওয়া যায়নি।'
    }
  }
};

const formatInr = (value) => {
  const numeric = Number(value);
  return `INR ${Number.isFinite(numeric) ? numeric.toLocaleString('en-IN') : '0'}`;
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

const formatDateValue = (value) => {
  const parsed = toValidDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
};

const formatDateTimeValue = (value) => {
  const parsed = toValidDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleString('en-GB');
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

export default function TeacherDashboardPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { id: 'upcomingExam', title: 'Upcoming Exam', value: t.stats.noUpcoming },
    { id: 'assignedClasses', title: 'Assigned Classes', value: '0' },
    { id: 'assignedSubjects', title: 'Assigned Subjects', value: '0' }
  ]);
  const [salaryRows, setSalaryRows] = useState([]);
  const [downloadingSalaryReceiptId, setDownloadingSalaryReceiptId] = useState('');
  const [salaryReceiptError, setSalaryReceiptError] = useState('');
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [teacherNotices, setTeacherNotices] = useState([]);
  const [paymentNotifications, setPaymentNotifications] = useState([]);
  const [respondingNotificationId, setRespondingNotificationId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const teacherDetailsRef = useRef(null);

  const pendingSalaryConfirmations = paymentNotifications.filter(
    (item) =>
      item.notificationType === 'TEACHER_SALARY_PAYMENT_CONFIRMATION' &&
      String(item?.metadata?.status || '').toUpperCase() === 'PENDING'
  );

  const downloadBlob = (blob, filename) => {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const downloadSalaryReceiptPdf = async (payrollId, receiptToken) => {
    const normalizedPayrollId = String(payrollId || '').trim();
    if (!normalizedPayrollId) {
      return;
    }

    const { token } = getAuthContext();
    if (!token) {
      return;
    }

    setSalaryReceiptError('');
    setDownloadingSalaryReceiptId(normalizedPayrollId);

    try {
      const endpointCandidates = [
        `/receipt/teacher/${normalizedPayrollId}`,
        `/receipt/download/teacher/${normalizedPayrollId}`,
        `/receipts/teacher/${normalizedPayrollId}`
      ];

      let blob = null;
      let lastError = null;

      for (const endpoint of endpointCandidates) {
        try {
          blob = await getBlob(endpoint, token, { timeoutMs: 120000 });
          break;
        } catch (error) {
          lastError = error;
          const statusCode = Number(error?.statusCode || 0);
          if (statusCode && statusCode !== 404 && statusCode !== 405) {
            break;
          }
        }
      }

      if (!blob) {
        throw lastError || new Error('Unable to download receipt right now.');
      }

      const safeToken = String(receiptToken || normalizedPayrollId).replace(/[^A-Za-z0-9_-]/g, '_');
      downloadBlob(blob, `Salary_Receipt_${safeToken}.pdf`);
    } catch (error) {
      setSalaryReceiptError(String(error?.message || 'Failed to download receipt'));
    } finally {
      setDownloadingSalaryReceiptId('');
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const teacher = await getCurrentTeacherRecord();
        const { token } = getAuthContext();

        if (!teacher || !token) {
          setTeacherProfile(null);
          setSalaryRows([]);
          setTeacherNotices([]);
          setPaymentNotifications([]);
          setStats(getDefaultStats());
          return;
        }

        setTeacherProfile(teacher);

        const [examsRes, payrollRes, notificationRes, noticeRes] = await Promise.all([
          get('/exams', token),
          get('/payroll/my/history', token),
          get('/notifications/teacher', token, {
            forceRefresh: true,
            cacheTtlMs: 0
          }),
          get('/notices/teacher?page=1&limit=8', token, {
            forceRefresh: true,
            cacheTtlMs: 0
          })
        ]);

        setSalaryRows(
          (payrollRes.data || []).map((item) => ({
            id: item._id,
            payrollId: item._id,
            month: item.month,
            amount: `INR ${item.amount || 0}`,
            status: item.status,
            paidOn: formatDateValue(item.paidOn),
            paymentMethod: item.status === 'Paid' ? (item.paymentMethod || '-') : '-',
            receiptToken: item?.receiptId?.receiptNumber || item.month || item._id
          }))
        );

        setPaymentNotifications(notificationRes.data?.notifications || []);
        setTeacherNotices(Array.isArray(noticeRes?.data) ? noticeRes.data : []);

        const exams = Array.isArray(examsRes.data) ? examsRes.data : [];
        const nowMs = Date.now();

        const examWindows = exams
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

        const nextScheduledExam = examWindows
          .filter((item) => item.startDate.getTime() > nowMs)
          .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];

        const upcomingExamValue = ongoingExam
          ? t.stats.ongoing
          : nextScheduledExam?.name || t.stats.noUpcoming;

        setStats([
          { id: 'upcomingExam', title: t.stats.upcomingExam, value: upcomingExamValue },
          { id: 'assignedClasses', title: t.stats.assignedClasses, value: String(teacher.classIds?.length || 0) },
          { id: 'assignedSubjects', title: t.stats.assignedSubjects, value: String(teacher.subjects?.length || 0) }
        ]);
      } catch (_error) {
        setTeacherProfile(null);
        setSalaryRows([]);
        setTeacherNotices([]);
        setPaymentNotifications([]);
        setStats([
          { id: 'upcomingExam', title: t.stats.upcomingExam, value: t.stats.noUpcoming },
          { id: 'assignedClasses', title: t.stats.assignedClasses, value: '0' },
          { id: 'assignedSubjects', title: t.stats.assignedSubjects, value: '0' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [refreshKey]);

  const onRespondSalaryConfirmation = async (notificationId, decision) => {
    const { token } = getAuthContext();
    if (!token || !notificationId) {
      return;
    }

    setRespondingNotificationId(notificationId);
    try {
      const response = await post(
        `/notifications/teacher/${notificationId}/respond`,
        { decision },
        token
      );

      toast.success(
        response.message ||
          (decision === 'YES'
            ? t.payment.successYes
            : t.payment.successNo)
      );
      setRefreshKey((prev) => prev + 1);
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setRespondingNotificationId('');
    }
  };

  const scrollToTeacherDetails = () => {
    if (!teacherDetailsRef.current || typeof window === 'undefined') {
      return;
    }

    const topOffset = 88;
    const nextTop = window.scrollY + teacherDetailsRef.current.getBoundingClientRect().top - topOffset;
    window.scrollTo({ top: Math.max(nextTop, 0), behavior: 'smooth' });
  };

  const salaryTableRows = useMemo(
    () => salaryRows,
    [salaryRows]
  );

  const salaryReceiptRows = useMemo(
    () =>
      salaryRows
        .map((row) => {
          const payrollId = String(row?.payrollId || '').trim();
          const status = String(row?.status || '').trim().toUpperCase();
          const canDownload = status === 'PAID' && Boolean(payrollId);

          if (!canDownload) {
            return null;
          }

          return {
            id: `salary-receipt-${row.id || payrollId}`,
            month: row.month,
            amount: row.amount,
            paidOn: row.paidOn,
            action: (
              <button
                type="button"
                onClick={() => downloadSalaryReceiptPdf(payrollId, row?.receiptToken)}
                disabled={downloadingSalaryReceiptId === payrollId}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {downloadingSalaryReceiptId === payrollId ? t.salary.downloading : t.salary.download}
              </button>
            )
          };
        })
        .filter(Boolean),
    [salaryRows, downloadingSalaryReceiptId]
  );

  const importantTeacherNoticeCount = useMemo(
    () => teacherNotices.filter((item) => Boolean(item?.isImportant)).length,
    [teacherNotices]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <section className="relative overflow-hidden rounded-3xl border border-red-100/70 bg-gradient-to-br from-white via-red-50/60 to-red-100/70 p-3 shadow-[0_30px_64px_-42px_rgba(153,27,27,0.7)] dark:border-red-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-red-950/35 md:p-4">
        <DashboardHero3D backgroundMode />
        <div className="relative z-10">
          <PortalTopSection
            role="Teacher"
            heading={teacherProfile?.userId?.name ? `${t.welcome}, ${teacherProfile.userId.name}` : t.title}
            subheading={t.subheading}
            metricLabel={t.importantNotices}
            metricValue={String(importantTeacherNoticeCount)}
          />
        </div>
      </section>

      <SchoolBrandPanel subtitle={t.brandSubtitle} />

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => {
          const jumpToDetails = item.id === 'assignedClasses' || item.id === 'assignedSubjects';
          if (!jumpToDetails) {
            return <StatCard key={item.id} title={item.title} value={item.value} loading={loading} />;
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={scrollToTeacherDetails}
              disabled={loading}
              className="text-left disabled:cursor-not-allowed"
              title="Scroll to Teacher Details"
            >
              <StatCard title={item.title} value={item.value} loading={loading} />
            </button>
          );
        })}
      </div>

      <div ref={teacherDetailsRef}>
        {loading ? (
          <InfoCard title={t.detailsTitle}>
            <div className="space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
            </div>
          </InfoCard>
        ) : teacherProfile ? (
          <InfoCard title={t.detailsTitle}>
            <DetailsGrid
              items={[
                { label: t.fields.name, value: teacherProfile.userId?.name || '-' },
                { label: t.fields.email, value: teacherProfile.userId?.email || '-' },
                { label: t.fields.teacherId, value: teacherProfile.teacherId || '-' },
                { label: t.fields.contactNumber, value: teacherProfile.contactNumber || '-' },
                { label: t.fields.monthlySalary, value: formatInr(teacherProfile.monthlySalary) },
                { label: t.fields.totalDueSalary, value: formatInr(teacherProfile.pendingSalary) },
                { label: t.fields.qualifications, value: teacherProfile.qualifications || '-' },
                {
                  label: t.fields.joiningDate,
                  value: teacherProfile.joiningDate ? new Date(teacherProfile.joiningDate).toLocaleDateString('en-GB') : '-'
                },
                {
                  label: t.fields.assignedClasses,
                  value: formatClassLabelList(teacherProfile.classIds || [])
                },
                {
                  label: t.fields.assignedSubjects,
                  value: (teacherProfile.subjects || []).map((item) => item?.code).filter(Boolean).join(', ') || '-'
                }
              ]}
            />

            {(teacherProfile.classIds || []).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.classesSubtitle}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(teacherProfile.classIds || []).map((classItem) => {
                    const classId = String(classItem?._id || classItem || '');
                    if (!classId) {
                      return null;
                    }

                    return (
                      <Link
                        key={classId}
                        href={`/teacher/classes/${classId}`}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-400/30 dark:bg-red-900/20 dark:text-red-100 dark:hover:bg-red-900/35"
                      >
                        {formatClassLabel(classItem, 'Class')}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </InfoCard>
        ) : null}
      </div>

      {!loading && pendingSalaryConfirmations.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/85 p-5 shadow-[0_24px_52px_-36px_rgba(146,64,14,0.72)] dark:border-amber-500/35 dark:bg-amber-900/20">
          <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">{t.payment.title}</h3>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/85">{t.payment.description}</p>
          <div className="mt-3 space-y-2">
            {pendingSalaryConfirmations.map((item) => (
              <div key={item._id} className="rounded-xl border border-amber-200 bg-white/90 px-3 py-2 dark:border-amber-500/35 dark:bg-slate-900/75">
                <p className="text-sm font-semibold text-slate-900 dark:text-red-50">{item.message}</p>
                <p className="text-xs text-slate-500 dark:text-red-100/70">{t.payment.requested} {new Date(item.submittedAt).toLocaleString('en-GB')}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    onClick={() => onRespondSalaryConfirmation(item._id, 'YES')}
                    disabled={respondingNotificationId === item._id}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {respondingNotificationId === item._id ? t.payment.processing : t.payment.yes}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onRespondSalaryConfirmation(item._id, 'NO')}
                    disabled={respondingNotificationId === item._id}
                    size="sm"
                    variant="danger"
                  >
                    {respondingNotificationId === item._id ? t.payment.processing : t.payment.no}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <InfoCard title={t.notices.title}>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`notice-skeleton-${index}`} className="h-14 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
            ))}
          </div>
        ) : teacherNotices.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-red-100/80">{t.notices.empty}</p>
        ) : (
          <div className="space-y-2">
            {teacherNotices.map((notice, index) => {
              const isImportant = Boolean(notice?.isImportant);
              return (
                <div
                  key={String(notice?._id || `notice-${index}`)}
                  className={`rounded-xl border px-3 py-2 ${
                    isImportant
                      ? 'border-amber-200 bg-amber-50/85 dark:border-amber-500/35 dark:bg-amber-900/20'
                      : 'border-red-100 bg-red-50/45 dark:border-red-400/20 dark:bg-red-900/15'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-red-50">{notice?.title || '-'}</p>
                    <p className="text-xs text-slate-500 dark:text-red-100/70">{formatDateTimeValue(notice?.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-700 dark:text-red-100/85">{notice?.description || '-'}</p>
                  {isImportant ? <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">{t.notices.important}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </InfoCard>

      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-900">{t.salary.title}</h3>
        <Table
          columns={[
            { key: 'month', label: t.salary.month },
            { key: 'amount', label: t.salary.amount },
            { key: 'status', label: t.salary.status },
            { key: 'paidOn', label: t.salary.paidOn },
            { key: 'paymentMethod', label: t.salary.method }
          ]}
          rows={salaryTableRows}
          loading={loading}
          scrollY
          maxHeightClass="max-h-[288px]"
        />

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">{t.salary.receiptsTitle}</h4>
          <p className="mb-2 text-xs text-slate-600">{t.salary.receiptsDesc}</p>
          <Table
            columns={[
              { key: 'month', label: t.salary.month },
              { key: 'amount', label: t.salary.amount },
              { key: 'paidOn', label: t.salary.paidOn },
              { key: 'action', label: t.salary.action }
            ]}
            rows={salaryReceiptRows}
            loading={loading}
            scrollY
            maxHeightClass="max-h-[240px]"
          />
          {!loading && salaryReceiptRows.length === 0 ? (
             <p className="mt-2 text-xs font-medium text-slate-500">{t.salary.noReceipts}</p>
          ) : null}
        </div>

        {salaryReceiptError ? (
          <p className="mt-3 text-sm font-medium text-red-600">{salaryReceiptError}</p>
        ) : null}
      </div>

    </div>
  );
}
