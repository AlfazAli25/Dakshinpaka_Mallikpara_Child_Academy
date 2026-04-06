'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import InfoCard from '@/components/InfoCard';
import { get, post } from '@/lib/api';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const formatDateLabel = (value) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
};

export default function StudentNoticePaymentPage() {
  const params = useParams();
  const toast = useToast();

  const noticeId = String(params?.noticeId || '').trim();

  const [notice, setNotice] = useState(null);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const isPaymentNotice = String(notice?.noticeType || '') === 'Payment';
  const hasPaid = Boolean(notice?.hasPaid || notice?.payment);
  const payableAmount = Number(notice?.amount || 0);

  const canPay = useMemo(
    () => Boolean(noticeId && student?._id && isPaymentNotice && !hasPaid && payableAmount > 0),
    [hasPaid, isPaymentNotice, noticeId, payableAmount, student?._id]
  );

  const loadNotice = async () => {
    if (!noticeId) {
      setNotice(null);
      setStudent(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const auth = getAuthContext();
      if (!auth.token) {
        setNotice(null);
        setStudent(null);
        return;
      }

      const [studentRecord, noticeResponse] = await Promise.all([
        getCurrentStudentRecord(),
        get(`/notices/student?noticeId=${noticeId}&page=1&limit=1`, auth.token, {
          forceRefresh: true,
          cacheTtlMs: 0
        })
      ]);

      setStudent(studentRecord || null);
      const noticeRow = Array.isArray(noticeResponse?.data) ? noticeResponse.data[0] : null;
      setNotice(noticeRow || null);
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to load notice payment details');
      setNotice(null);
      setStudent(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotice();
  }, [noticeId]);

  const onPayNow = async () => {
    if (!canPay) {
      return;
    }

    setPaying(true);
    try {
      const auth = getAuthContext();
      await post('/notices/pay', {
        studentId: student._id,
        noticeId,
        amount: payableAmount
      }, auth.token);

      toast.success('Payment Successful');
      await loadNotice();
    } catch (apiError) {
      toast.error(apiError.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Student Payments"
        title="Notice Payment"
        description="Complete payment for notices that require additional fees."
      />

      <InfoCard title="Payment Details">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-slate-200" />
          </div>
        ) : !notice ? (
          <p className="text-sm text-slate-500">Notice not found for your class.</p>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 ${notice?.isImportant ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-base font-semibold text-slate-900">{notice?.title || '-'}</p>
              <p className="mt-1 text-sm text-slate-700">{notice?.description || '-'}</p>

              <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                <p><span className="font-semibold">Type:</span> {notice?.noticeType || '-'}</p>
                <p><span className="font-semibold">Amount:</span> INR {payableAmount || 0}</p>
                <p><span className="font-semibold">Due Date:</span> {formatDateLabel(notice?.dueDate)}</p>
              </div>
            </div>

            {!isPaymentNotice ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This notice is informational only and does not require payment.
              </p>
            ) : hasPaid ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                Payment Successful
              </p>
            ) : (
              <button
                type="button"
                onClick={onPayNow}
                disabled={!canPay || paying}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {paying ? 'Processing...' : 'Pay Now'}
              </button>
            )}
          </div>
        )}
      </InfoCard>
    </div>
  );
}
