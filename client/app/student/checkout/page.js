'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import Input from '@/components/Input';
import { get, postForm } from '@/lib/api';
import { prepareScreenshotForUpload, SCREENSHOT_UPLOAD_MAX_BYTES } from '@/lib/screenshot-upload';
import { SCHOOL_NAME, SCHOOL_UPI_ID, SCHOOL_UPI_PAYEE_NAME } from '@/lib/school-config';
import { buildUpiPaymentLink, createDefaultUpiReference, launchUpiPayment } from '@/lib/upi-payment';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const FALLBACK_UPI_ID = 'alfazali499-1@okicici';
const FALLBACK_PHONE = '8509658357';
const UPI_REFERENCE_PREFIX = 'DPMPCA';

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

const downloadQrAsJpeg = () => {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 512;
    canvas.height = img.height || 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'payment-qr-code.jpeg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }, 'image/jpeg', 0.95);
  };
  img.src = '/static-payment-qr.svg';
};

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
  const [autoUpiReference, setAutoUpiReference] = useState(() => createDefaultUpiReference(UPI_REFERENCE_PREFIX));

  const configuredUpiId = String(SCHOOL_UPI_ID || '').trim() || FALLBACK_UPI_ID;
  const configuredPayeeName = String(SCHOOL_UPI_PAYEE_NAME || SCHOOL_NAME || 'School Payment').trim() || 'School Payment';

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
  const upiPayAmount = isEnteredAmountValid ? enteredAmount : payableAmount;
  const resolvedUpiReference = String(transactionReference || autoUpiReference || '').trim();
  const upiPaymentLink = useMemo(
    () =>
      buildUpiPaymentLink({
        upiId: configuredUpiId,
        payeeName: configuredPayeeName,
        amount: upiPayAmount,
        transactionReference: resolvedUpiReference,
        note: `School Fee Payment ${resolvedUpiReference ? `(${resolvedUpiReference})` : ''}`.trim()
      }),
    [configuredPayeeName, configuredUpiId, resolvedUpiReference, upiPayAmount]
  );

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
      setAutoUpiReference(createDefaultUpiReference(UPI_REFERENCE_PREFIX));
      await loadCheckoutData();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setPaying(false);
    }
  };

  const onPayViaUpiApp = () => {
    setError('');
    setMessage('');

    if (!hasPendingFeeMonth && effectivePendingAmount <= 0) {
      setError('No pending fees available for payment.');
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

    if (!upiPaymentLink) {
      setError('UPI payment is not configured right now.');
      return;
    }

    const didLaunch = launchUpiPayment(upiPaymentLink);
    if (!didLaunch) {
      setError('Unable to open UPI app on this device.');
      return;
    }

    setMessage('Opening UPI app. Complete payment and upload screenshot for verification.');
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
        description="Pay via UPI app or static QR, then submit screenshot for admin verification."
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Static QR Code</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadQrAsJpeg}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Download QR
                  </button>
                  <button
                    type="button"
                    onClick={onPayViaUpiApp}
                    disabled={!hasPendingFeeMonth || !isEnteredAmountValid}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Pay Via an UPI App
                  </button>
                </div>
              </div>
              <Image
                src="/static-payment-qr.svg"
                alt="Static payment QR"
                width={192}
                height={192}
                className="mt-3 h-48 w-48 rounded-lg border border-slate-200 bg-white p-2"
              />
              <p className="mt-2 text-xs text-slate-500">Scan this QR to pay online, then upload screenshot and submit.</p>

              {/* Phone & UPI ID with copy feature */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-700">Phone:</span>
                  <span id="school-phone" className="text-xs text-slate-800 select-all">{FALLBACK_PHONE}</span>
                  <button
                    type="button"
                    className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 border border-slate-300 hover:bg-slate-200"
                    onClick={() => {
                      navigator.clipboard.writeText(FALLBACK_PHONE);
                    }}
                  >Copy</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-700">UPI ID:</span>
                  <span id="school-upi" className="text-xs text-slate-800 select-all">{configuredUpiId}</span>
                  <button
                    type="button"
                    className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 border border-slate-300 hover:bg-slate-200"
                    onClick={() => {
                      navigator.clipboard.writeText(configuredUpiId);
                    }}
                  >Copy</button>
                </div>
              </div>
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
