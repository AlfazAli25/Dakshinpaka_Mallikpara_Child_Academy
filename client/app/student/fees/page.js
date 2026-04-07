'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext } from '@/lib/user-records';

const MONTHLY_FEE_AMOUNT = 200;

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
      { key: 'verificationStatus', label: 'Verification Status' }
    ],
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
      { key: 'verificationStatus', label: 'ভেরিফিকেশন স্ট্যাটাস' }
    ],
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
  const [receipts, setReceipts] = useState([]);

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
        const { token } = getAuthContext();
        if (!token) {
          setRows([]);
          setPaymentHistory([]);
          setReceipts([]);
          return;
        }

        const [response, receiptResponse, paymentHistoryResponse] = await Promise.all([
          get('/student/fees', token),
          get('/receipts/student', token),
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

        const paymentRows = (paymentHistoryResponse.data || []).map((item) => ({
          id: item._id,
          paymentDate: formatDateValue(item.paidAt || item.createdAt),
          paymentFor: item.sourceLabel || (String(item.sourceType || '').toUpperCase() === 'NOTICE' ? 'Notice Payment' : 'Fee Payment'),
          amount: `INR ${item.amount || 0}`,
          screenshotStatus: item.screenshotPath ? 'UPLOADED' : 'NOT_UPLOADED',
          verificationStatus: mapVerificationStatus(item.paymentStatus)
        }));

        setRows(feeRows);
        setPaymentHistory(paymentRows);
        setReceipts(receiptResponse.data || []);
      } catch (_error) {
        setRows([]);
        setPaymentHistory([]);
        setReceipts([]);
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
      <Table columns={t.columns} rows={rows} loading={loading} scrollY maxHeightClass="max-h-[276px]" />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t.paymentHistoryTitle}</h3>
        <p className="mb-3 text-sm text-slate-600">{t.paymentHistoryDescription}</p>
        <Table
          columns={t.paymentHistoryColumns}
          rows={paymentHistory}
          loading={loading}
          scrollY
          maxHeightClass="max-h-[320px]"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Payment Receipts</h3>
        <p className="mb-3 text-sm text-slate-600">Receipts are generated automatically after successful fee updates.</p>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`receipt-skeleton-${index}`} className="h-10 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-slate-500">No receipts available yet.</p>
        ) : (
          <div className="space-y-2">
            {receipts.map((receipt) => (
              <div key={receipt._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {receipt.receiptNumber} - INR {receipt.amount} - {new Date(receipt.paymentDate).toLocaleDateString('en-GB')}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(`${receipt.receiptNumber}.txt`, [
                      `Receipt Number: ${receipt.receiptNumber}`,
                      `Student Name: ${receipt.studentName || '-'}`,
                      `Class: ${receipt.className || '-'}`,
                      `Amount Paid: INR ${receipt.amount}`,
                      `Payment Method: ${receipt.paymentMethod}`,
                      `Payment Date: ${new Date(receipt.paymentDate).toLocaleString('en-GB')}`,
                      `Transaction Reference: ${receipt.transactionReference || '-'}`,
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