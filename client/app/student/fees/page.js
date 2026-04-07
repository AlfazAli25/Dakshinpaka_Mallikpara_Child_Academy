'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import { get, getBlob } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext } from '@/lib/user-records';

const MONTHLY_FEE_AMOUNT = 200;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Fees',
    description: 'View month-wise fee records and payment status.',
    monthlyFeeLabel: 'Monthly Fee',
    paymentHistoryTitle: 'Payment History',
    paymentHistoryDescription: 'All fee and payment-notice transactions are shown here.',
    paymentHistoryColumns: [
      { key: 'paymentDate', label: 'Payment Date' },
      { key: 'paymentFor', label: 'Payment For' },
      { key: 'amount', label: 'Amount' },
      { key: 'screenshotStatus', label: 'Screenshot Status' },
      { key: 'verificationStatus', label: 'Verification Status' },
      { key: 'receipt', label: 'Receipt' }
    ],
    downloadReceipt: 'Download Receipt',
    downloadingReceipt: 'Downloading...',
    receiptNotAvailable: 'Not available',
    receiptDownloadFailed: 'Failed to download receipt',
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'amountPaid', label: 'Amount Paid' },
      { key: 'amountPending', label: 'Amount Pending' },
      { key: 'status', label: 'Status' }
    ]
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'ফি',
    description: 'মাসভিত্তিক ফি রেকর্ড ও পেমেন্ট স্ট্যাটাস দেখুন।',
    monthlyFeeLabel: 'মাসিক ফি',
    paymentHistoryTitle: 'পেমেন্ট হিস্টোরি',
    paymentHistoryDescription: 'ফি এবং পেমেন্ট-নোটিশের সব লেনদেন এখানে দেখা যাবে।',
    paymentHistoryColumns: [
      { key: 'paymentDate', label: 'পেমেন্ট তারিখ' },
      { key: 'paymentFor', label: 'পেমেন্টের ধরন' },
      { key: 'amount', label: 'পরিমাণ' },
      { key: 'screenshotStatus', label: 'স্ক্রিনশট স্ট্যাটাস' },
      { key: 'verificationStatus', label: 'ভেরিফিকেশন স্ট্যাটাস' },
      { key: 'receipt', label: 'রিসিপ্ট' }
    ],
    downloadReceipt: 'রিসিপ্ট ডাউনলোড',
    downloadingReceipt: 'ডাউনলোড হচ্ছে...',
    receiptNotAvailable: 'উপলব্ধ নয়',
    receiptDownloadFailed: 'এই মুহূর্তে রিসিপ্ট ডাউনলোড করা যাচ্ছে না।',
    columns: [
      { key: 'month', label: 'মাস' },
      { key: 'amountPaid', label: 'পরিশোধিত' },
      { key: 'amountPending', label: 'বকেয়া' },
      { key: 'status', label: 'স্ট্যাটাস' }
    ]
  }
};

const formatMonth = (dateValue) => {
  if (!dateValue) {
    return '-';
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return String(dateValue).slice(0, 7);
  }

  return parsed.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const deriveStatusFromAmountPaid = (amountPaid) => {
  const paid = Number(amountPaid || 0);
  if (!Number.isFinite(paid) || paid <= 0) {
    return 'PENDING';
  }

  if (paid < MONTHLY_FEE_AMOUNT) {
    return 'PARTIALLY PAID';
  }

  return 'PAID';
};

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

const isSuccessfulPaymentStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  return normalized === 'SUCCESS' || normalized === 'PAID' || normalized === 'VERIFIED';
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

export default function StudentFeesPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [downloadingReceiptPaymentId, setDownloadingReceiptPaymentId] = useState('');
  const [receiptDownloadError, setReceiptDownloadError] = useState('');

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

  const downloadReceiptPdf = async (paymentId, receiptNumber) => {
    const normalizedPaymentId = String(paymentId || '').trim();
    if (!normalizedPaymentId) {
      return;
    }

    const { token } = getAuthContext();
    if (!token) {
      return;
    }

    setReceiptDownloadError('');
    setDownloadingReceiptPaymentId(normalizedPaymentId);

    try {
      const blob = await getBlob(`/receipt/download/${normalizedPaymentId}`, token, { timeoutMs: 120000 });
      const fallbackReceiptToken = String(receiptNumber || normalizedPaymentId).replace(/[^A-Za-z0-9_-]/g, '_');
      downloadBlob(blob, `Fee_Receipt_${fallbackReceiptToken}.pdf`);
    } catch (_error) {
      setReceiptDownloadError(t.receiptDownloadFailed);
    } finally {
      setDownloadingReceiptPaymentId('');
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { token } = getAuthContext();
        if (!token) {
          setRows([]);
          setPaymentHistory([]);
          return;
        }

        const [response, paymentHistoryResponse] = await Promise.all([
          get('/student/fees', token),
          get('/fees/my/payments', token)
        ]);

        const feeRows = (response.data || [])
          .slice()
          .sort((a, b) => {
            const first = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            const second = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            return first - second;
          })
          .map((item) => ({
            id: item._id,
            month: formatMonth(item.dueDate),
            amountDueValue: Number(item.amountDue || 0),
            amountPaidValue: Number(item.amountPaid || 0),
            pendingAmountValue: Math.max(Number(item.amountDue || 0) - Number(item.amountPaid || 0), 0),
            amountPaid: `INR ${item.amountPaid || 0}`,
            amountPending: `INR ${Math.max(Number(item.amountDue || 0) - Number(item.amountPaid || 0), 0)}`,
            status: deriveStatusFromAmountPaid(item.amountPaid)
          }))
          .filter((item) => item.amountDueValue > 0 || item.amountPaidValue > 0);

        const paymentRows = (paymentHistoryResponse.data || []).map((item) => {
          const sourceType = String(item?.sourceType || '').toUpperCase();

          const paymentId = String(item?._id || '').trim();
          const canDownloadReceipt =
            sourceType === 'FEE' &&
            OBJECT_ID_REGEX.test(paymentId) &&
            isSuccessfulPaymentStatus(item?.paymentStatus);

          return {
            id: item._id,
            paymentId,
            receiptToken: String(item?.transactionId || item?.transactionReference || paymentId),
            canDownloadReceipt,
            paymentDate: formatDateValue(item.paidAt || item.createdAt),
            paymentFor:
              item.sourceLabel ||
              (sourceType === 'NOTICE' ? 'Notice Payment' : 'Fee Payment'),
            amount: `INR ${item.amount || 0}`,
            screenshotStatus: item.screenshotPath ? 'UPLOADED' : 'NOT_UPLOADED',
            verificationStatus: mapVerificationStatus(item.paymentStatus)
          };
        });

        setRows(feeRows);
        setPaymentHistory(paymentRows);
      } catch (_error) {
        setRows([]);
        setPaymentHistory([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const pendingTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (row.pendingAmountValue || 0), 0),
    [rows]
  );

  const paymentHistoryRows = useMemo(
    () =>
      paymentHistory.map((row) => {
        const paymentId = String(row?.paymentId || '').trim();
        const canDownloadReceipt = Boolean(row?.canDownloadReceipt) && Boolean(paymentId);

        return {
          ...row,
          receipt: canDownloadReceipt ? (
            <button
              type="button"
              onClick={() => downloadReceiptPdf(paymentId, row?.receiptToken)}
              disabled={downloadingReceiptPaymentId === paymentId}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {downloadingReceiptPaymentId === paymentId ? t.downloadingReceipt : t.downloadReceipt}
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-400">{t.receiptNotAvailable}</span>
          )
        };
      }),
    [paymentHistory, downloadingReceiptPaymentId, t]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        rightSlot={
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link
              href={`/student/checkout?amount=${pendingTotal}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Checkout
            </Link>
          </div>
        }
      />
      <p className="text-sm font-medium text-slate-700">{t.monthlyFeeLabel}: INR {MONTHLY_FEE_AMOUNT}</p>
      <Table columns={t.columns} rows={rows} loading={loading} scrollY maxHeightClass="max-h-[288px]" />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t.paymentHistoryTitle}</h3>
        <p className="mb-3 text-sm text-slate-600">{t.paymentHistoryDescription}</p>
        <Table
          columns={t.paymentHistoryColumns}
          rows={paymentHistoryRows}
          loading={loading}
          scrollY
          maxHeightClass="max-h-[288px]"
        />
        {receiptDownloadError ? (
          <p className="mt-3 text-sm font-medium text-red-600">{receiptDownloadError}</p>
        ) : null}
      </div>
    </div>
  );
}