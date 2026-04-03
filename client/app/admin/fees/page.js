'use client';

import { useEffect, useMemo, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import { get, getBlob, post } from '@/lib/api';
import { getToken } from '@/lib/session';

const columns = [
  { key: 'month', label: 'Month' },
  { key: 'amountDue', label: 'Amount Due' },
  { key: 'amountPaid', label: 'Amount Paid' },
  { key: 'pendingAmount', label: 'Pending Amount' },
  { key: 'studentName', label: 'Student' }
];

const verificationColumns = [
  { key: 'studentAdmissionNo', label: 'Student ID' },
  { key: 'studentName', label: 'Student' },
  { key: 'className', label: 'Class' },
  { key: 'amount', label: 'Amount' },
  { key: 'submittedAt', label: 'Submitted At' },
  { key: 'status', label: 'Status' }
];

const PENDING_SCREENSHOT_VERIFICATION_MESSAGE = 'Payment screenshot pending verification. Please verify before processing payment.';

const formatMonth = (dateValue) => {
  if (!dateValue) {
    return '-';
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return String(dateValue).slice(0, 7);
  }

  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const filterStudentsBySearch = (items, searchText) => {
  const query = String(searchText || '').trim().toLowerCase();
  if (!query) {
    return items;
  }

  const exactIdMatches = items.filter((item) => String(item.admissionNo || '').toLowerCase() === query);
  if (exactIdMatches.length > 0) {
    return exactIdMatches;
  }

  return items.filter((item) => {
    const studentName = String(item.userId?.name || '').toLowerCase();
    return studentName.includes(query);
  });
};

const filterVerificationRows = (items, searchText) => {
  const query = String(searchText || '').trim().toLowerCase();
  if (!query) {
    return items;
  }

  const exactIdMatches = items.filter((item) => String(item.studentId?.admissionNo || '').toLowerCase() === query);
  if (exactIdMatches.length > 0) {
    return exactIdMatches;
  }

  return items.filter((item) => String(item.studentId?.userId?.name || '').toLowerCase().includes(query));
};

export default function AdminFeesPage() {
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingCash, setSubmittingCash] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedFeeId, setSelectedFeeId] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [studentSearch, setStudentSearch] = useState('');
  const [verificationSearch, setVerificationSearch] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [amount, setAmount] = useState('');

  const loadData = async () => {
    setLoadingData(true);
    try {
      const token = getToken();
      const [feesRes, studentsRes, verificationRes] = await Promise.all([
        get('/fees', token),
        get('/students', token),
        get('/fees/pending-verifications', token)
      ]);

      const feeRows = (feesRes.data || []).map((item) => {
        const pending = Math.max((item.amountDue || 0) - (item.amountPaid || 0), 0);
        return {
          id: item._id,
          studentId: item.studentId?._id,
          studentAdmissionNo: item.studentId?.admissionNo || '-',
          studentName: item.studentId?.userId?.name || item.studentId?._id,
          amountDueValue: item.amountDue || 0,
          amountPaidValue: item.amountPaid || 0,
          pendingAmountValue: pending,
          month: formatMonth(item.dueDate),
          amountDue: `INR ${item.amountDue || 0}`,
          amountPaid: `INR ${item.amountPaid || 0}`,
          pendingAmount: `INR ${pending}`,
          dueDate: item.dueDate?.slice(0, 10)
        };
      });

      setRows(feeRows);
      setStudents(studentsRes.data || []);
      setPendingVerifications(verificationRes.data || []);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadData().catch((apiError) => {
      setError(apiError.message);
      setRows([]);
    });
  }, []);

  const filteredStudents = useMemo(() => filterStudentsBySearch(students, studentSearch), [students, studentSearch]);

  const filteredPendingVerifications = useMemo(
    () => filterVerificationRows(pendingVerifications, verificationSearch),
    [pendingVerifications, verificationSearch]
  );

  const feeOptions = rows.filter((row) => row.studentId === selectedStudentId && row.pendingAmountValue > 0);

  const selectedFee = rows.find((row) => row.id === selectedFeeId);

  const onProcessPayment = async (event) => {
    event.preventDefault();
    if (!selectedFee) {
      setError('Please select a valid month.');
      return;
    }

    if (paymentMode === 'CASH') {
      const hasPendingScreenshot = pendingVerifications.some(
        (item) => String(item.feeId?._id || item.feeId) === String(selectedFee.id) && item.paymentStatus === 'PENDING_VERIFICATION'
      );
      if (hasPendingScreenshot) {
        window.alert(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
        setError(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
        return;
      }
    }

    setSubmittingCash(true);
    setError('');
    setMessage('');

    try {
      if (paymentMode === 'CASH') {
        await post(`/fees/${selectedFee.id}/pay-cash`, { amount: Number(amount || selectedFee.pendingAmountValue) }, getToken());
        setMessage('Cash payment processed successfully.');
      } else {
        await post(
          `/fees/${selectedFee.id}/pay-online`,
          {
            amount: Number(amount || selectedFee.pendingAmountValue),
            transactionReference: transactionReference.trim() || undefined
          },
          getToken()
        );
        setMessage('Online payment recorded successfully.');
        setTransactionReference('');
      }

      setAmount('');
      await loadData();
    } catch (apiError) {
      if ((apiError.rawMessage || apiError.message) === PENDING_SCREENSHOT_VERIFICATION_MESSAGE) {
        window.alert(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
      }
      setError(apiError.message);
    } finally {
      setSubmittingCash(false);
    }
  };

  const onVerify = async (paymentId, decision) => {
    setError('');
    setMessage('');
    try {
      await post(`/fees/payments/${paymentId}/verify`, { decision }, getToken());
      setMessage(`Payment ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully.`);
      await loadData();
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const onViewScreenshot = async (paymentId) => {
    setError('');
    try {
      const blob = await getBlob(`/fees/payments/${paymentId}/screenshot`, getToken());
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Fees"
        description="Process cash and in-person online payments, and review student screenshot submissions."
      />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      <form onSubmit={onProcessPayment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Process Payments</h3>
        <p className="mb-4 text-sm text-slate-600">Record cash or in-person online payments. Use the queue below only for student-uploaded screenshots.</p>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Search Student (ID / Name)"
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            className="h-11"
            placeholder="Type student ID or name"
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Student</label>
            <select
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                setSelectedFeeId('');
              }}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              required
            >
              <option value="">Select student</option>
              {filteredStudents.map((student) => (
                <option key={student._id} value={student._id}>
                  {student.userId?.name || student.admissionNo} ({student.admissionNo})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Month</label>
            <select
              value={selectedFeeId}
              onChange={(event) => setSelectedFeeId(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              required
            >
              <option value="">Select month</option>
              {feeOptions.map((fee) => (
                <option key={fee.id} value={fee.id}>
                  {fee.month} - Pending INR {fee.pendingAmountValue}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Payment Mode</label>
            <select
              value={paymentMode}
              onChange={(event) => setPaymentMode(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              required
            >
              <option value="CASH">Via Cash</option>
              <option value="ONLINE">Via Online</option>
            </select>
          </div>

          <Input
            label="Payment Amount"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-11"
            placeholder={selectedFee ? String(selectedFee.pendingAmountValue) : 'Enter amount'}
          />

          {paymentMode === 'ONLINE' && (
            <Input
              label="Transaction Reference (optional)"
              value={transactionReference}
              onChange={(event) => setTransactionReference(event.target.value)}
              className="h-11"
              placeholder="UPI reference"
            />
          )}
        </div>

        {paymentMode === 'ONLINE' && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Static QR Code (Online Payment)</p>
            <img
              src="/static-payment-qr.svg"
              alt="Static payment QR"
              className="mt-3 h-48 w-48 rounded-lg border border-slate-200 bg-white p-2"
            />
            <p className="mt-2 text-xs text-slate-500">For in-person collection, confirm payment and record it directly. Screenshot upload is not required here.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submittingCash || !selectedFee}
          className="mt-4 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingCash ? 'Processing...' : paymentMode === 'CASH' ? 'Process Cash Payment' : 'Record Online Payment'}
        </button>
      </form>

      <Table columns={columns} rows={rows} loading={loadingData} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Static QR Verification Queue</h3>
        <p className="mb-3 text-sm text-slate-600">Review uploaded screenshots, then approve or reject payment verification.</p>

        <Input
          label="Search Student (ID / Name)"
          value={verificationSearch}
          onChange={(event) => setVerificationSearch(event.target.value)}
          className="h-11"
          placeholder="Type student ID or name"
        />

        <Table
          columns={verificationColumns}
          loading={loadingData}
          rows={filteredPendingVerifications.map((item) => ({
            id: item._id,
            studentAdmissionNo: item.studentId?.admissionNo || '-',
            studentName: item.studentId?.userId?.name || '-',
            className: item.studentId?.classId?.name || '-',
            amount: `INR ${item.amount || 0}`,
            submittedAt: new Date(item.createdAt).toLocaleString(),
            status: 'Pending'
          }))}
        />

        {filteredPendingVerifications.length > 0 && (
          <div className="mt-4 space-y-2">
            {filteredPendingVerifications.map((item) => (
              <div key={item._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {item.studentId?.admissionNo || '-'} - {item.studentId?.userId?.name || 'Student'} - INR {item.amount}
                </p>
                <button
                  type="button"
                  onClick={() => onViewScreenshot(item._id)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  View Screenshot
                </button>
                <button
                  type="button"
                  onClick={() => onVerify(item._id, 'APPROVE')}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onVerify(item._id, 'REJECT')}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}