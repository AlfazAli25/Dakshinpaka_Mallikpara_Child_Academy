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
import { formatClassLabel, formatClassLabelList } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const DashboardHero3D = dynamic(() => import('@/components/dashboard/DashboardHero3D'), {
  ssr: false
});

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

const getDefaultStats = () => ([
  { id: 'upcomingExam', title: 'Upcoming Exam', value: 'No Upcoming Exam' },
  { id: 'assignedClasses', title: 'Assigned Classes', value: '0' },
  { id: 'assignedSubjects', title: 'Assigned Subjects', value: '0' }
]);

export default function TeacherDashboardPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(getDefaultStats());
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
          ? 'Ongoing'
          : nextScheduledExam?.name || 'No Upcoming Exam';

        setStats([
          { id: 'upcomingExam', title: 'Upcoming Exam', value: upcomingExamValue },
          { id: 'assignedClasses', title: 'Assigned Classes', value: String(teacher.classIds?.length || 0) },
          { id: 'assignedSubjects', title: 'Assigned Subjects', value: String(teacher.subjects?.length || 0) }
        ]);
      } catch (_error) {
        setTeacherProfile(null);
        setSalaryRows([]);
        setTeacherNotices([]);
        setPaymentNotifications([]);
        setStats(getDefaultStats());
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
            ? 'Salary payment confirmed successfully.'
            : 'Payment mismatch reported to admin.')
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
                {downloadingSalaryReceiptId === payrollId ? 'Downloading...' : 'Download Receipt'}
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
        eyebrow="Teaching Panel"
        title="Teacher Dashboard"
        description="Review today's classes, attendance work, and exam tasks at a glance."
      />

      <PortalTopSection
        role="Teacher"
        heading={teacherProfile?.userId?.name ? `Welcome back, ${teacherProfile.userId.name}` : 'Teacher Dashboard'}
        subheading="Track classes, salary updates, notices, and confirmations from one premium workspace."
        metricLabel="Important Notices"
        metricValue={String(importantTeacherNoticeCount)}
      />

      <DashboardHero3D />

      <SchoolBrandPanel subtitle="Guide students confidently with school updates, class insights, and exam readiness tools." />

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
          <InfoCard title="Teacher Details">
            <div className="space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
            </div>
          </InfoCard>
        ) : teacherProfile ? (
          <InfoCard title="Teacher Details">
            <DetailsGrid
              items={[
                { label: 'Name', value: teacherProfile.userId?.name || '-' },
                { label: 'Email', value: teacherProfile.userId?.email || '-' },
                { label: 'Teacher ID', value: teacherProfile.teacherId || '-' },
                { label: 'Contact Number', value: teacherProfile.contactNumber || '-' },
                { label: 'Monthly Salary', value: formatInr(teacherProfile.monthlySalary) },
                { label: 'Total Due Salary', value: formatInr(teacherProfile.pendingSalary) },
                { label: 'Qualifications', value: teacherProfile.qualifications || '-' },
                {
                  label: 'Joining Date',
                  value: teacherProfile.joiningDate ? new Date(teacherProfile.joiningDate).toLocaleDateString('en-GB') : '-'
                },
                {
                  label: 'Assigned Classes',
                  value: formatClassLabelList(teacherProfile.classIds || [])
                },
                {
                  label: 'Assigned Subjects',
                  value: (teacherProfile.subjects || []).map((item) => item?.code).filter(Boolean).join(', ') || '-'
                }
              ]}
            />

            {(teacherProfile.classIds || []).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Class Student List</p>
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
          <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">Payment Confirmation Required</h3>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/85">Please confirm whether you received these salary payments.</p>
          <div className="mt-3 space-y-2">
            {pendingSalaryConfirmations.map((item) => (
              <div key={item._id} className="rounded-xl border border-amber-200 bg-white/90 px-3 py-2 dark:border-amber-500/35 dark:bg-slate-900/75">
                <p className="text-sm font-semibold text-slate-900 dark:text-red-50">{item.message}</p>
                <p className="text-xs text-slate-500 dark:text-red-100/70">Requested: {new Date(item.submittedAt).toLocaleString('en-GB')}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    onClick={() => onRespondSalaryConfirmation(item._id, 'YES')}
                    disabled={respondingNotificationId === item._id}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {respondingNotificationId === item._id ? 'Processing...' : 'Yes'}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onRespondSalaryConfirmation(item._id, 'NO')}
                    disabled={respondingNotificationId === item._id}
                    size="sm"
                    variant="danger"
                  >
                    {respondingNotificationId === item._id ? 'Processing...' : 'No'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <InfoCard title="Latest Notices">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`notice-skeleton-${index}`} className="h-14 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
            ))}
          </div>
        ) : teacherNotices.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-red-100/80">No teacher notices right now.</p>
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
                  {isImportant ? <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">Important</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </InfoCard>

      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-900">Salary History</h3>
        <Table
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'paidOn', label: 'Paid On' },
            { key: 'paymentMethod', label: 'Method' }
          ]}
          rows={salaryTableRows}
          loading={loading}
          scrollY
          maxHeightClass="max-h-[288px]"
        />

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Salary Receipt Downloads</h4>
          <p className="mb-2 text-xs text-slate-600">Receipts are available for paid salary records only.</p>
          <Table
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'amount', label: 'Amount' },
              { key: 'paidOn', label: 'Paid On' },
              { key: 'action', label: 'Receipt' }
            ]}
            rows={salaryReceiptRows}
            loading={loading}
            scrollY
            maxHeightClass="max-h-[240px]"
          />
          {!loading && salaryReceiptRows.length === 0 ? (
            <p className="mt-2 text-xs font-medium text-slate-500">No downloadable receipts found.</p>
          ) : null}
        </div>

        {salaryReceiptError ? (
          <p className="mt-3 text-sm font-medium text-red-600">{salaryReceiptError}</p>
        ) : null}
      </div>

    </div>
  );
}
