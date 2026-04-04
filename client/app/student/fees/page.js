'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext } from '@/lib/user-records';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Fees',
    description: 'View month-wise fee records and payment status.',
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'amountDue', label: 'Amount Due' },
      { key: 'amountPaid', label: 'Amount Paid' },
      { key: 'status', label: 'Status' }
    ]
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'ফি',
    description: 'মাসভিত্তিক ফি রেকর্ড ও পেমেন্ট স্ট্যাটাস দেখুন।',
    columns: [
      { key: 'month', label: 'মাস' },
      { key: 'amountDue', label: 'মোট ফি' },
      { key: 'amountPaid', label: 'পরিশোধিত' },
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

const normalizeStatus = (status) => {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'PARTIALLY_PAID') {
    return 'PARTIALLY PAID';
  }
  return value || 'PENDING';
};

export default function StudentFeesPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
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
          setReceipts([]);
          return;
        }

        const [response, receiptResponse] = await Promise.all([
          get('/student/fees', token),
          get('/receipts/student', token)
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
            amountDue: `INR ${item.amountDue || 0}`,
            amountPaid: `INR ${item.amountPaid || 0}`,
            status: normalizeStatus(item.status)
          }))
          .filter((item) => item.amountDueValue > 0 || item.amountPaidValue > 0);

        setRows(feeRows);
        setReceipts(receiptResponse.data || []);
      } catch (_error) {
        setRows([]);
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
      <Table columns={t.columns} rows={rows} loading={loading} />

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
                  {receipt.receiptNumber} - INR {receipt.amount} - {new Date(receipt.paymentDate).toLocaleDateString()}
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
                      `Payment Date: ${new Date(receipt.paymentDate).toLocaleString()}`,
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