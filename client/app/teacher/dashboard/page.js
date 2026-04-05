"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import InfoCard from '@/components/InfoCard';
import DetailsGrid from '@/components/DetailsGrid';
import { get, post } from '@/lib/api';
import { formatClassLabel, formatClassLabelList } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

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
  const [receipts, setReceipts] = useState([]);
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [paymentNotifications, setPaymentNotifications] = useState([]);
  const [respondingNotificationId, setRespondingNotificationId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const teacherDetailsRef = useRef(null);

  const pendingSalaryConfirmations = paymentNotifications.filter(
    (item) =>
      item.notificationType === 'TEACHER_SALARY_PAYMENT_CONFIRMATION' &&
      String(item?.metadata?.status || '').toUpperCase() === 'PENDING'
  );

  const downloadTextFile = (filename, lines) => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
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
          setReceipts([]);
          setPaymentNotifications([]);
          setStats(getDefaultStats());
          return;
        }

        setTeacherProfile(teacher);

        const [examsRes, payrollRes, receiptRes, notificationRes] = await Promise.all([
          get('/exams', token),
          get('/payroll/my/history', token),
          get('/receipts/teacher', token),
          get('/notifications/teacher', token, {
            forceRefresh: true,
            cacheTtlMs: 0
          })
        ]);

        setSalaryRows(
          (payrollRes.data || []).map((item) => ({
            id: item._id,
            month: item.month,
            amount: `INR ${item.amount || 0}`,
            status: item.status,
            paidOn: formatDateValue(item.paidOn),
            paymentMethod: item.status === 'Paid' ? (item.paymentMethod || '-') : '-'
          }))
        );

        setReceipts(receiptRes.data || []);
        setPaymentNotifications(notificationRes.data?.notifications || []);

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
        setReceipts([]);
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Teacher Dashboard"
        description="Review today's classes, attendance work, and exam tasks at a glance."
      />
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
                        className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
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
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-amber-900">Payment Confirmation Required</h3>
          <p className="mt-1 text-sm text-amber-800">Please confirm whether you received these salary payments.</p>
          <div className="mt-3 space-y-2">
            {pendingSalaryConfirmations.map((item) => (
              <div key={item._id} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                <p className="text-sm font-semibold text-slate-900">{item.message}</p>
                <p className="text-xs text-slate-500">Requested: {new Date(item.submittedAt).toLocaleString('en-GB')}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRespondSalaryConfirmation(item._id, 'YES')}
                    disabled={respondingNotificationId === item._id}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {respondingNotificationId === item._id ? 'Processing...' : 'Yes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespondSalaryConfirmation(item._id, 'NO')}
                    disabled={respondingNotificationId === item._id}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {respondingNotificationId === item._id ? 'Processing...' : 'No'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          rows={salaryRows}
          loading={loading}
          scrollY
          maxHeightClass="max-h-[340px]"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Salary Receipts</h3>
        {loading ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`receipt-skeleton-${index}`} className="h-10 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No salary receipts available yet.</p>
        ) : (
          <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {receipts.map((receipt) => (
              <div key={receipt._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div className="text-sm text-slate-700">
                  <p>{receipt.receiptNumber} - {new Date(receipt.paymentDate).toLocaleDateString('en-GB')}</p>
                  <p className="text-xs text-slate-600">
                    Monthly Salary: INR {receipt.monthlySalary ?? receipt.amount ?? 0} | Amount Paid: INR {receipt.amountPaid ?? receipt.pendingSalaryCleared ?? receipt.amount ?? 0} | Pending Salary: INR {receipt.pendingSalary ?? 0}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(`${receipt.receiptNumber}.txt`, [
                      `Receipt Number: ${receipt.receiptNumber}`,
                      `Teacher Name: ${receipt.teacherName || '-'}`,
                      `Monthly Salary: INR ${receipt.monthlySalary ?? receipt.amount ?? 0}`,
                      `Payment Date: ${new Date(receipt.paymentDate).toLocaleString('en-GB')}`,
                      `Payment Method: ${receipt.paymentMethod}`,
                      `Amount Paid: INR ${receipt.amountPaid ?? receipt.pendingSalaryCleared ?? receipt.amount ?? 0}`,
                      `Pending Salary: INR ${receipt.pendingSalary ?? 0}`,
                      `Status: ${receipt.status}`
                    ])
                  }
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
