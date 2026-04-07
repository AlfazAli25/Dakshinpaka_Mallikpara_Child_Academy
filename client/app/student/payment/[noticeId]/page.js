'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import InfoCard from '@/components/InfoCard';
import { get, postForm } from '@/lib/api';
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

const normalizePaymentStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PAID') {
    return 'VERIFIED';
  }
  if (normalized === 'PENDING') {
    return 'PENDING_VERIFICATION';
  }
  if (['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(normalized)) {
    return normalized;
  }
  return '';
};

export default function StudentNoticePaymentPage() {
  const params = useParams();
  const toast = useToast();

  const noticeId = String(params?.noticeId || '').trim();

  const [notice, setNotice] = useState(null);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [transactionReference, setTransactionReference] = useState('');

  const isPaymentNotice = String(notice?.noticeType || '') === 'Payment';
  const paymentStatus = normalizePaymentStatus(notice?.payment?.paymentStatus);
  const hasPaid = paymentStatus === 'VERIFIED';
  const isPendingVerification = paymentStatus === 'PENDING_VERIFICATION';
  const isRejected = paymentStatus === 'REJECTED';
  const payableAmount = Number(notice?.amount || 0);

  const canPay = useMemo(
    () => Boolean(noticeId && student?._id && isPaymentNotice && !hasPaid && !isPendingVerification && payableAmount > 0),
    [hasPaid, isPaymentNotice, isPendingVerification, noticeId, payableAmount, student?._id]
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

    if (!screenshotFile) {
      toast.error('Please upload payment screenshot before submitting');
      return;
    }

    setPaying(true);
    try {
      const auth = getAuthContext();
      const formData = new FormData();
      formData.append('studentId', student._id);
      formData.append('noticeId', noticeId);
      formData.append('amount', String(payableAmount));
      formData.append('screenshot', screenshotFile);

      const normalizedReference = String(transactionReference || '').trim();
      if (normalizedReference) {
        formData.append('transactionReference', normalizedReference);
      }

      await postForm('/notices/pay', formData, auth.token);

      toast.success('Screenshot uploaded. Waiting for admin verification.');
      setScreenshotFile(null);
      setTransactionReference('');
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
              <div className="space-y-2">
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  Payment Verified by Admin
                </p>
                <Link
                  href="/student/fees"
                  className="inline-flex rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  View Payment History in Fees
                </Link>
              </div>
            ) : isPendingVerification ? (
              <div className="space-y-2">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  Screenshot submitted. Waiting for admin verification.
                </p>
                <Link
                  href="/student/fees"
                  className="inline-flex rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  View Payment History in Fees
                </Link>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {isRejected ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    Previous screenshot was rejected. Upload a new screenshot and submit again.
                  </p>
                ) : null}

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-800">Static QR Code</p>
                  <img
                    src="/static-payment-qr.svg"
                    alt="Static payment QR"
                    className="mt-3 h-44 w-44 rounded-lg border border-slate-200 bg-white p-2"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Scan this QR, complete payment, then upload screenshot below.
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-800">Want to pay via Cash?</p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Visit the admin office and request a cash notice payment. Admin can record your notice payment directly.
                  </p>
                </div>

                {notice?.payment?.verificationNotes ? (
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold">Admin Note:</span> {notice.payment.verificationNotes}
                  </p>
                ) : null}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Payment Screenshot</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setScreenshotFile(event.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Transaction Reference (optional)</label>
                  <input
                    type="text"
                    value={transactionReference}
                    onChange={(event) => setTransactionReference(event.target.value)}
                    placeholder="UPI ref / bank ref"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={onPayNow}
                  disabled={!canPay || paying || !screenshotFile}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {paying ? 'Submitting...' : isRejected ? 'Upload Again' : 'Upload & Submit'}
                </button>
              </div>
            )}
          </div>
        )}
      </InfoCard>
    </div>
  );
}
