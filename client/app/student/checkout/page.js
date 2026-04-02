'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import Input from '@/components/Input';
import { get, postForm } from '@/lib/api';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const checkoutColumns = [
  { key: 'paymentDate', label: 'Payment Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'screenshotStatus', label: 'Screenshot Status' },
  { key: 'verificationStatus', label: 'Verification Status' }
];

const mapVerificationStatus = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCESS') {
    return 'VERIFIED';
  }
  if (normalized === 'FAILED' || normalized === 'CANCELLED') {
    return 'REJECTED';
  }
  return 'PENDING';
};

export default function StudentCheckoutPage() {
  const [rows, setRows] = useState([]);
  const [checkoutHistory, setCheckoutHistory] = useState([]);
  const [profilePendingFees, setProfilePendingFees] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [paying, setPaying] = useState(false);
  const [paymentMode, setPaymentMode] = useState('VIA_ONLINE');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [transactionReference, setTransactionReference] = useState('');
  const [queryAmount, setQueryAmount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const amount = Number(params.get('amount') || 0);
    setQueryAmount(Number.isFinite(amount) ? amount : 0);
  }, []);

  const loadCheckoutData = async () => {
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
        return {
          id: item._id,
          dueDate: item.dueDate?.slice(0, 10) || '',
          amountDueValue: item.amountDue || 0,
          amountPaidValue: item.amountPaid || 0,
          pendingAmountValue: pending,
          amountDue: `INR ${item.amountDue || 0}`,
          amountPaid: `INR ${item.amountPaid || 0}`,
          pendingAmount: `INR ${pending}`
        };
      })
      .filter((item) => item.pendingAmountValue > 0)
      .sort((a, b) => {
        const first = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const second = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return first - second;
      });

    const paymentRows = (paymentsResponse.data || []).map((item) => ({
      id: item._id,
      paymentDate: (item.paidAt || item.createdAt || '').slice(0, 10) || '-',
      amount: `INR ${item.amount || 0}`,
      screenshotStatus: item.screenshotPath ? 'UPLOADED' : 'NOT_UPLOADED',
      verificationStatus: mapVerificationStatus(item.paymentStatus)
    }));

    setRows(pendingRows);
    setCheckoutHistory(paymentRows);
  };

  useEffect(() => {
    loadCheckoutData().catch((apiError) => setError(apiError.message));
  }, []);

  const totalPending = useMemo(
    () => rows.reduce((sum, row) => sum + (row.pendingAmountValue || 0), 0),
    [rows]
  );
  const effectivePendingAmount = useMemo(
    () => Math.max(totalPending, profilePendingFees),
    [totalPending, profilePendingFees]
  );
  const payableAmount = queryAmount > 0 ? queryAmount : effectivePendingAmount;

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

    setPaying(true);
    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('screenshot', screenshotFile);
      formData.append('amount', String(feeRowForSubmission.pendingAmountValue));
      if (transactionReference) {
        formData.append('transactionReference', transactionReference);
      }

      await postForm(`/fees/${feeRowForSubmission.id}/upload-static-qr-screenshot`, formData, token);
      setMessage('Screenshot uploaded successfully. Payment status is now Pending until admin verification.');
      setScreenshotFile(null);
      setTransactionReference('');
      await loadCheckoutData();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setPaying(false);
    }
  };

  const hasPendingFeeMonth = Boolean(feeRowForSubmission);
  const canSubmitOnline = paymentMode === 'VIA_ONLINE' && hasPendingFeeMonth && Boolean(screenshotFile) && !paying;
  const submitHint = !hasPendingFeeMonth
    ? profilePendingFees > 0
      ? `Pending fee INR ${profilePendingFees} exists, but fee ledger records are missing. Please contact admin.`
      : 'Submit is disabled because pending fee is 0.'
    : screenshotFile
      ? 'Ready to submit screenshot for admin verification.'
      : 'Submit is enabled after uploading screenshot in the field above.';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Student Payments"
        title="Checkout"
        description="Choose payment mode and submit online screenshot for verification when paying via QR."
      />

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      <div className="card-hover rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Total Payable</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">INR {payableAmount}</p>
        <p className="mt-2 text-sm text-slate-500">Choose a payment mode. Cash collection is handled by Admin only.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setPaymentMode('VIA_CASH')}
            className={`rounded-lg border px-4 py-3 text-left text-sm ${
              paymentMode === 'VIA_CASH' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <p className="font-semibold">Via Cash</p>
            <p className="mt-1 text-xs">Pay at the Admin desk. QR is not required for cash payment.</p>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMode('VIA_ONLINE')}
            className={`rounded-lg border px-4 py-3 text-left text-sm ${
              paymentMode === 'VIA_ONLINE' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <p className="font-semibold">Via Online</p>
            <p className="mt-1 text-xs">Pay through static QR and upload screenshot for admin verification.</p>
          </button>
        </div>

        {paymentMode === 'VIA_ONLINE' && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Outstanding Fee</p>
            <p className="mt-2 text-sm text-slate-700">Pending Amount: INR {effectivePendingAmount}</p>
            <p className="text-xs text-slate-500">Payments are applied to your oldest pending ledger entry automatically.</p>
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
              <img
                src="/static-payment-qr.svg"
                alt="Static payment QR"
                className="mt-3 h-48 w-48 rounded-lg border border-slate-200 bg-white p-2"
              />
              <p className="mt-2 text-xs text-slate-500">Scan this QR to pay online, then upload screenshot and submit.</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
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
        )}

        {paymentMode === 'VIA_CASH' && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Cash Payment</p>
            <p className="mt-1 text-sm text-slate-600">Please visit the admin office to complete cash payment. QR code is hidden in cash mode.</p>
          </div>
        )}
      </div>

      <Table columns={checkoutColumns} rows={checkoutHistory} />
    </div>
  );
}
