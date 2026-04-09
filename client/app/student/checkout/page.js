'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import Input from '@/components/Input';
import { get, postForm } from '@/lib/api';
import { prepareScreenshotForUpload, SCREENSHOT_UPLOAD_MAX_BYTES } from '@/lib/screenshot-upload';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const checkoutColumns = [
  { key: 'paymentDate', label: 'Payment Date' },
  { key: 'paymentFor', label: 'Payment For' },
  { key: 'amount', label: 'Amount' },
  { key: 'screenshotStatus', label: 'Screenshot Status' },
  { key: 'verificationStatus', label: 'Verification Status' }
];

const mapVerificationStatus = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCESS' || normalized === 'VERIFIED') {
    return 'VERIFIED';
  }
  if (normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'REJECTED') {
    return 'REJECTED';
  }
  if (normalized === 'PENDING_VERIFICATION') {
    return 'PENDING_VERIFICATION';
  }
  return 'PENDING';
};

const formatDateValue = (value) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
};

const formatMb = (bytes) => (Number(bytes || 0) / (1024 * 1024)).toFixed(1);

export default function StudentCheckoutPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [checkoutHistory, setCheckoutHistory] = useState([]);
  const [profilePendingFees, setProfilePendingFees] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [paying, setPaying] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error, toast]);

  useEffect(() => {
    if (message) {
      toast.success(message);
    }
  }, [message, toast]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const amount = Number(params.get('amount') || 0);
    const normalizedAmount = Number.isFinite(amount) ? amount : 0;
    if (normalizedAmount > 0) {
      setPaymentAmount(String(normalizedAmount));
    }
  }, []);

  const loadCheckoutData = async () => {
    setLoading(true);
    try {
      const student = await getCurrentStudentRecord();
      const { token } = getAuthContext();
      if (!student || !token) {
        setRows([]);
        setCheckoutHistory([]);
        setProfilePendingFees(0);
        return;
      }

      setProfilePendingFees(Math.max(Number(student.pendingFees || 0), 0));

      const [feeResponse, paymentsResponse] = await Promise.all([
        get('/student/fees', token),
        get('/fees/my/payments', token)
      ]);

      const pendingRows = (feeResponse.data || [])
        .map((item) => {
          const pending = Math.max((item.amountDue || 0) - (item.amountPaid || 0), 0);
          const dueDateParsed = item.dueDate ? new Date(item.dueDate) : null;
          const dueDateTimestamp = dueDateParsed && !Number.isNaN(dueDateParsed.getTime())
            ? dueDateParsed.getTime()
            : Number.MAX_SAFE_INTEGER;

          return {
            id: item._id,
            dueDate: formatDateValue(item.dueDate),
            dueDateTimestamp,
            amountDueValue: item.amountDue || 0,
            amountPaidValue: item.amountPaid || 0,
            pendingAmountValue: pending,
            amountDue: `INR ${item.amountDue || 0}`,
            amountPaid: `INR ${item.amountPaid || 0}`,
            pendingAmount: `INR ${pending}`
          };
        })
        .filter((item) => item.pendingAmountValue > 0)
        .sort((a, b) => a.dueDateTimestamp - b.dueDateTimestamp);

      const paymentRows = (paymentsResponse.data || []).map((item) => ({
        id: item._id,
        paymentDate: formatDateValue(item.paidAt || item.createdAt),
        paymentFor: item.sourceLabel || (String(item.sourceType || '').toUpperCase() === 'NOTICE' ? 'Notice Payment' : 'Fee Payment'),
        amount: `INR ${item.amount || 0}`,
        screenshotStatus: item.screenshotPath ? 'UPLOADED' : 'NOT_UPLOADED',
        verificationStatus: mapVerificationStatus(item.paymentStatus)
      }));

      setRows(pendingRows);
      setCheckoutHistory(paymentRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCheckoutData().catch((apiError) => setError(apiError.message));
  }, []);

  const totalPending = useMemo(
    () => rows.reduce((sum, row) => sum + (row.pendingAmountValue || 0), 0),
    [rows]
  );
  const effectivePendingAmount = useMemo(
    () => (rows.length > 0 ? totalPending : profilePendingFees),
    [rows.length, totalPending, profilePendingFees]
  );
  const payableAmount = effectivePendingAmount;
  const enteredAmount = Number(paymentAmount || payableAmount);
  const isEnteredAmountValid = Number.isFinite(enteredAmount) && enteredAmount > 0 && enteredAmount <= effectivePendingAmount;

  const feeRowForSubmission = rows[0] || null;

  const onSubmitOnlinePayment = async () => {
    const { token } = getAuthContext();
    if (!token || !screenshotFile) {
      setError('Please upload payment screenshot.');
      return;
    }

    if (!feeRowForSubmission) {
      setError('No fee ledger record found for this account. Please contact admin.');
      return;
    }

    if (!isEnteredAmountValid) {
      setError(
        effectivePendingAmount > 0
          ? `Enter a valid payment amount between 1 and ${effectivePendingAmount}.`
          : 'No pending fees available for payment.'
      );
      return;
    }

    setPaying(true);
    setError('');
    setMessage('');

    try {
      const preparedScreenshot = await prepareScreenshotForUpload(screenshotFile, {
        maxBytes: SCREENSHOT_UPLOAD_MAX_BYTES
      });

      if (!preparedScreenshot || preparedScreenshot.size > SCREENSHOT_UPLOAD_MAX_BYTES) {
        setError(`Screenshot is too large. Please upload up to ${formatMb(SCREENSHOT_UPLOAD_MAX_BYTES)} MB.`);
        return;
      }

      if (preparedScreenshot.size < screenshotFile.size) {
        toast.info('Screenshot optimized for upload.');
      }

      const formData = new FormData();
      formData.append('screenshot', preparedScreenshot, preparedScreenshot.name);
      formData.append('amount', String(enteredAmount));
      if (transactionReference) {
        formData.append('transactionReference', transactionReference);
      }

      await postForm(`/fees/${feeRowForSubmission.id}/upload-static-qr-screenshot`, formData, token, { timeoutMs: 90000 });
      setMessage('Screenshot uploaded successfully. Payment status is now Pending until admin verification.');
      setScreenshotFile(null);
      setTransactionReference('');
      setPaymentAmount('');
      await loadCheckoutData();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setPaying(false);
    }
  };

  const hasPendingFeeMonth = Boolean(feeRowForSubmission);
  const canSubmitOnline = hasPendingFeeMonth && Boolean(screenshotFile) && !paying && isEnteredAmountValid;
  const submitHint = !hasPendingFeeMonth
    ? profilePendingFees > 0
      ? `Pending fee INR ${profilePendingFees} exists, but fee ledger records are missing. Please contact admin.`
      : 'Submit is disabled because pending fee is 0.'
    : screenshotFile
      ? isEnteredAmountValid
        ? 'Ready to submit screenshot for admin verification.'
        : `Enter amount up to INR ${effectivePendingAmount} before submitting.`
      : 'Submit is enabled after uploading screenshot in the field above.';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Student Payments"
        title="Checkout"
        description="Pay via static QR and submit screenshot for admin verification."
      />

      <div className="card-hover rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Total Payable</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">INR {payableAmount}</p>
        <p className="mt-2 text-sm text-slate-500">Student payments are submitted via static QR only. Cash collection is handled by Admin at the school office.</p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Outstanding Fee</p>
            <p className="mt-2 text-sm text-slate-700">Pending Amount: INR {effectivePendingAmount}</p>
            <p className="text-xs text-slate-500">Payments are applied to your oldest pending ledger entry automatically.</p>
            {feeRowForSubmission && (
              <p className="mt-1 text-xs text-slate-500">Oldest pending month due date: {feeRowForSubmission.dueDate || '-'}</p>
            )}
            {rows.length === 0 && (
              <p className="mt-3 text-sm text-amber-700">No fee ledger record found for this account. Please contact admin.</p>
            )}

            {rows.length === 0 && profilePendingFees > 0 && (
              <p className="mt-2 text-sm text-amber-700">
                Your profile has pending fees of INR {profilePendingFees}, but admin has not created fee ledger records yet.
              </p>
            )}

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Static QR Code</p>
              <Image
                src="/static-payment-qr.svg"
                alt="Static payment QR"
                width={192}
                height={192}
                className="mt-3 h-48 w-48 rounded-lg border border-slate-200 bg-white p-2"
              />
              <p className="mt-2 text-xs text-slate-500">Scan this QR to pay online, then upload screenshot and submit.</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input
                label="Payment Amount"
                type="number"
                min="1"
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                className="h-11"
                placeholder={String(payableAmount || 0)}
              />

              <Input
                label="Transaction Reference (optional)"
                value={transactionReference}
                onChange={(event) => setTransactionReference(event.target.value)}
                className="h-11"
                placeholder="UPI ref / bank ref"
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment Screenshot</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!hasPendingFeeMonth}
                  onChange={(event) => {
                    setScreenshotFile(event.target.files?.[0] || null);
                    setError('');
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onSubmitOnlinePayment}
              disabled={!canSubmitOnline}
              className="mt-4 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {paying ? 'Submitting...' : 'Submit'}
            </button>
            <p className={`mt-2 text-xs ${hasPendingFeeMonth ? 'text-slate-500' : 'text-amber-700'}`}>{submitHint}</p>
          </div>
      </div>

      <Table columns={checkoutColumns} rows={checkoutHistory} loading={loading} scrollY maxHeightClass="max-h-[288px]" />
    </div>
  );
}
