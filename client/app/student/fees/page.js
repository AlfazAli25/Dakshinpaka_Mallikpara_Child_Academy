'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Fees',
    description: 'View your overall fee summary, paid history, and pending balance.',
    columns: [
      { key: 'feeType', label: 'Fee Type' },
      { key: 'amountDue', label: 'Amount Due' },
      { key: 'amountPaid', label: 'Amount Paid' },
      { key: 'paymentStatus', label: 'Payment Status' }
    ]
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'ফি',
    description: 'সামগ্রিক ফি, পরিশোধিত এবং বকেয়া দেখুন।',
    columns: [
      { key: 'feeType', label: 'ফি ধরন' },
      { key: 'amountDue', label: 'মোট ফি' },
      { key: 'amountPaid', label: 'পরিশোধিত' },
      { key: 'paymentStatus', label: 'পেমেন্ট স্ট্যাটাস' }
    ]
  }
};

const mapPaymentStatus = ({ totalDue, totalPaid, totalPending }) => {
  if (totalPending <= 0 && totalDue > 0) {
    return 'PAID';
  }

  if (totalPaid > 0) {
    return 'PARTIALLY_PAID';
  }

  return 'PENDING';
};

export default function StudentFeesPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [profilePendingFees, setProfilePendingFees] = useState(0);

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
        const student = await getCurrentStudentRecord();
        const { token } = getAuthContext();
        if (!student || !token) {
          setRows([]);
          setReceipts([]);
          setProfilePendingFees(0);
          return;
        }

        const profilePending = Math.max(Number(student.pendingFees || 0), 0);
        setProfilePendingFees(profilePending);

        const response = await get('/student/fees', token);
        const receiptResponse = await get('/receipts/student', token);
        const feeRows = response.data || [];
        const totals = feeRows.reduce(
          (acc, item) => {
            acc.totalDue += item.amountDue || 0;
            acc.totalPaid += item.amountPaid || 0;
            return acc;
          },
          { totalDue: 0, totalPaid: 0 }
        );

        const ledgerPending = Math.max(totals.totalDue - totals.totalPaid, 0);
        const totalPending = Math.max(ledgerPending, profilePending);
        const totalDue = Math.max(totals.totalDue, totals.totalPaid + totalPending);

        setRows(
          [
            {
              id: 'overall-fees',
              feeType: 'Overall',
              amountDue: `INR ${totalDue}`,
              amountPaid: `INR ${totals.totalPaid}`,
              paymentStatus: mapPaymentStatus({ totalDue, totalPaid: totals.totalPaid, totalPending }),
              pendingAmount: totalPending
            }
          ]
        );
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
    () => {
      const ledgerPending = rows.reduce((sum, row) => sum + (row.pendingAmount || 0), 0);
      return Math.max(ledgerPending, profilePendingFees);
    },
    [rows, profilePendingFees]
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