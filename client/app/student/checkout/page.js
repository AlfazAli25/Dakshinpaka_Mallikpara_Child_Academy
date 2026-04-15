'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import Input from '@/components/Input';
import PendingFeeReminderPopup from '@/components/PendingFeeReminderPopup';
import { get, postForm } from '@/lib/api';
import { prepareScreenshotForUpload, SCREENSHOT_UPLOAD_MAX_BYTES } from '@/lib/screenshot-upload';
import { SCHOOL_NAME, SCHOOL_UPI_ID, SCHOOL_UPI_PAYEE_NAME } from '@/lib/school-config';
import { buildUpiPaymentLink, launchUpiPayment } from '@/lib/upi-payment';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const FALLBACK_UPI_ID = 'alfazali499-1@okicici';
const FALLBACK_PHONE = '8509658357';
const UPI_REFERENCE_PREFIX = 'DPMPCA';
const MONTHLY_FEE_AMOUNT = 200;

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

const toReferenceToken = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

const buildStudentUpiReference = (studentIdentifier = '') => {
  const normalizedStudentToken = toReferenceToken(studentIdentifier);
  if (!normalizedStudentToken) {
    return `${UPI_REFERENCE_PREFIX}STUDENT`;
  }

  return `${UPI_REFERENCE_PREFIX}${normalizedStudentToken}`.slice(0, 35);
};

const downloadDataUrlAsPng = ({ dataUrl, fileName }) => {
  if (!dataUrl || typeof document === 'undefined') {
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
  const [autoUpiReference, setAutoUpiReference] = useState(() => buildStudentUpiReference(''));
  const [studentReferenceId, setStudentReferenceId] = useState('');
  const [payNowModalOpen, setPayNowModalOpen] = useState(false);
  const [dynamicQrDataUrl, setDynamicQrDataUrl] = useState('');
  const [dynamicQrLoading, setDynamicQrLoading] = useState(false);

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
        setStudentReferenceId('');
        setAutoUpiReference(buildStudentUpiReference(''));
        return;
      }

      setProfilePendingFees(Math.max(Number(student.pendingFees || 0), 0));
      const nextStudentReferenceId = String(student.admissionNo || student._id || '').trim();
      setStudentReferenceId(nextStudentReferenceId);
      setAutoUpiReference(buildStudentUpiReference(nextStudentReferenceId));

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
  const resolvedUpiReference = String(autoUpiReference || buildStudentUpiReference(studentReferenceId)).trim();
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
  const hasPendingFeeMonth = Boolean(feeRowForSubmission);
  const hasEnteredAmount = String(paymentAmount || '').trim().length > 0;
  const canOpenPayNow = hasPendingFeeMonth && hasEnteredAmount && isEnteredAmountValid && Boolean(upiPaymentLink);

  useEffect(() => {
    if (!payNowModalOpen || typeof window === 'undefined') {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPayNowModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payNowModalOpen]);

  useEffect(() => {
    let isDisposed = false;

    if (!payNowModalOpen || !upiPaymentLink) {
      setDynamicQrDataUrl('');
      setDynamicQrLoading(false);
      return undefined;
    }

    const generateDynamicQr = async () => {
      setDynamicQrLoading(true);
      try {
        const qrDataUrl = await QRCode.toDataURL(upiPaymentLink, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 360
        });
        if (!isDisposed) {
          setDynamicQrDataUrl(qrDataUrl);
        }
      } catch (qrError) {
        if (!isDisposed) {
          setDynamicQrDataUrl('');
          setError(qrError?.message || 'Unable to generate payment QR right now.');
        }
      } finally {
        if (!isDisposed) {
          setDynamicQrLoading(false);
        }
      }
    };

    generateDynamicQr();

    return () => {
      isDisposed = true;
    };
  }, [payNowModalOpen, upiPaymentLink]);

  const closePayNowModal = () => {
    setPayNowModalOpen(false);
  };

  const onOpenPayNow = () => {
    setError('');
    setMessage('');

    if (!hasPendingFeeMonth) {
      setError('No fee ledger record found for this account. Please contact admin.');
      return;
    }

    if (!hasEnteredAmount) {
      setError('Enter payment amount first.');
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

    setPayNowModalOpen(true);
  };

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
      setAutoUpiReference(buildStudentUpiReference(studentReferenceId));
      setPayNowModalOpen(false);
      setDynamicQrDataUrl('');
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

    if (!hasPendingFeeMonth) {
      setError('No fee ledger record found for this account. Please contact admin.');
      return;
    }

    if (!hasEnteredAmount) {
      setError('Enter payment amount first.');
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

  const onDownloadDynamicQr = () => {
    if (!dynamicQrDataUrl) {
      setError('Dynamic QR is not ready yet.');
      return;
    }

    const referenceToken = toReferenceToken(resolvedUpiReference) || 'PAYMENT';
    downloadDataUrlAsPng({
      dataUrl: dynamicQrDataUrl,
      fileName: `dynamic-upi-qr-${referenceToken}.png`
    });
  };

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
      <PendingFeeReminderPopup pendingAmount={effectivePendingAmount} monthlyFeeAmount={MONTHLY_FEE_AMOUNT} />

      <PageHeader
        eyebrow="Student Payments"
        title="Checkout"
        description="Enter amount, open Pay Now, complete payment, then upload screenshot for admin verification."
      />

      <div className="card-hover rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Total Payable</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">INR {payableAmount}</p>
        <p className="mt-2 text-sm text-slate-500">Enter payment amount, use Pay Now for dynamic QR, then submit payment screenshot.</p>

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

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
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
                {hasEnteredAmount ? (
                  <button
                    type="button"
                    onClick={onOpenPayNow}
                    disabled={!canOpenPayNow}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Pay Now
                  </button>
                ) : null}
                {hasEnteredAmount && !isEnteredAmountValid ? (
                  <p className="text-xs text-amber-700">Enter amount between 1 and INR {effectivePendingAmount}.</p>
                ) : null}
              </div>

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

      {payNowModalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-3 sm:p-6"
          onClick={closePayNowModal}
          role="dialog"
          aria-modal="true"
          aria-label="UPI payment page"
        >
          <div
            className="h-[80vh] w-[80vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
              <div>
                <p className="text-base font-semibold text-slate-900">Payment Page</p>
                <p className="mt-1 text-xs text-slate-500">
                  Pay INR {upiPayAmount.toFixed(2)} using QR or UPI app, then close this page and upload screenshot.
                </p>
              </div>
              <button
                type="button"
                onClick={closePayNowModal}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid h-[calc(80vh-70px)] gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(240px,320px)_1fr] md:p-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Dynamic UPI QR</p>
                  <button
                    type="button"
                    onClick={onDownloadDynamicQr}
                    disabled={!dynamicQrDataUrl || dynamicQrLoading}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Download QR
                  </button>
                </div>
                <div className="mt-3 flex h-64 w-full items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
                  {dynamicQrLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                      <p className="text-xs">Generating QR...</p>
                    </div>
                  ) : dynamicQrDataUrl ? (
                    <img
                      src={dynamicQrDataUrl}
                      alt="Dynamic payment QR"
                      className="h-full w-full max-w-[260px] rounded-md object-contain"
                    />
                  ) : (
                    <p className="text-xs text-slate-500">QR will appear here.</p>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <p>
                    Amount: <span className="font-semibold text-slate-800">INR {upiPayAmount.toFixed(2)}</span>
                  </p>
                  <p>
                    Reference: <span className="font-semibold text-slate-800">{resolvedUpiReference || '-'}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Complete Payment</p>
                <p className="mt-2 text-sm text-slate-600">
                  1. Scan the QR or tap UPI app button below. 2. Complete the payment. 3. Close this page. 4. Upload screenshot and submit.
                </p>

                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p>
                    UPI ID: <span className="font-semibold">{configuredUpiId}</span>
                  </p>
                  <p className="mt-1">
                    Phone: <span className="font-semibold">{FALLBACK_PHONE}</span>
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <button
                    type="button"
                    onClick={onPayViaUpiApp}
                    disabled={!canOpenPayNow || dynamicQrLoading}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Pay Via an UPI App
                  </button>
                  <button
                    type="button"
                    onClick={closePayNowModal}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Close Payment Page
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Table columns={checkoutColumns} rows={checkoutHistory} loading={loading} scrollY maxHeightClass="max-h-[288px]" />
    </div>
  );
}
