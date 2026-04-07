'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import { get, getBlob, post } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const verificationColumns = [
  { key: 'studentAdmissionNo', label: 'Student ID' },
  { key: 'studentName', label: 'Student' },
  { key: 'className', label: 'Class' },
  { key: 'amount', label: 'Amount' },
  { key: 'submittedAt', label: 'Submitted At' },
  { key: 'status', label: 'Status' }
];

const PENDING_SCREENSHOT_VERIFICATION_MESSAGE = 'Payment screenshot pending verification. Please verify before processing payment.';

const normalizeStatus = (status) => {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'PARTIALLY_PAID') {
    return 'PARTIALLY PAID';
  }
  return value || 'PENDING';
};

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
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingCash, setSubmittingCash] = useState(false);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [studentSearch, setStudentSearch] = useState('');
  const [verificationSearch, setVerificationSearch] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [amount, setAmount] = useState('');

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
          status: normalizeStatus(item.status),
          dueDate: item.dueDate?.slice(0, 10)
        };
      }).filter((item) => item.amountDueValue > 0 || item.amountPaidValue > 0).sort((a, b) => {
        const first = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const second = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return first - second;
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

  const selectedStudent = useMemo(() => {
    const query = String(studentSearch || '').trim().toLowerCase();
    if (!query) {
      return null;
    }

    const exactIdMatch = students.find((item) => String(item.admissionNo || '').toLowerCase() === query);
    if (exactIdMatch) {
      return exactIdMatch;
    }

    const exactNameMatches = students.filter((item) => String(item.userId?.name || '').toLowerCase() === query);
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }

    if (filteredStudents.length === 1) {
      return filteredStudents[0];
    }

    return null;
  }, [filteredStudents, studentSearch, students]);

  const selectedStudentId = String(selectedStudent?._id || '');

  const filteredPendingVerifications = useMemo(
    () => filterVerificationRows(pendingVerifications, verificationSearch),
    [pendingVerifications, verificationSearch]
  );

  const selectedStudentRows = useMemo(
    () => rows.filter((row) => row.studentId === selectedStudentId),
    [rows, selectedStudentId]
  );

  const oldestPendingFee = useMemo(
    () => selectedStudentRows.find((row) => row.pendingAmountValue > 0) || null,
    [selectedStudentRows]
  );

  const selectedStudentPendingTotal = useMemo(
    () => selectedStudentRows.reduce((sum, row) => sum + (row.pendingAmountValue || 0), 0),
    [selectedStudentRows]
  );

  const onProcessPayment = async (event) => {
    event.preventDefault();
    if (!selectedStudentId) {
      setError('Search with exact Student ID or full name to select a student.');
      return;
    }

    if (!oldestPendingFee) {
      setError('No pending monthly fee found for this student.');
      return;
    }

    const amountToProcess = Number(amount || selectedStudentPendingTotal);
    if (!Number.isFinite(amountToProcess) || amountToProcess <= 0) {
      setError('Enter a valid payment amount greater than 0.');
      return;
    }

    if (amountToProcess > selectedStudentPendingTotal) {
      setError(`Amount cannot exceed total pending INR ${selectedStudentPendingTotal}.`);
      return;
    }

    setSubmittingCash(true);
    setError('');
    setMessage('');

    try {
      if (paymentMode === 'CASH') {
        await post(`/fees/${oldestPendingFee.id}/pay-cash`, { amount: amountToProcess }, getToken());
        setMessage('Cash payment processed and auto-allocated successfully.');
      } else {
        await post(
          `/fees/${oldestPendingFee.id}/pay-online`,
          {
            amount: amountToProcess,
            transactionReference: transactionReference.trim() || undefined
          },
          getToken()
        );
        setMessage('Online payment recorded and auto-allocated successfully.');
        setTransactionReference('');
      }

      setAmount('');
      await loadData();
    } catch (apiError) {
      if ((apiError.rawMessage || apiError.message) === PENDING_SCREENSHOT_VERIFICATION_MESSAGE) {
        toast.info(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
        return;
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
            required
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {selectedStudent
              ? `Selected: ${selectedStudent.userId?.name || 'Student'} (${selectedStudent.admissionNo || '-'})`
              : studentSearch.trim()
                ? filteredStudents.length > 1
                  ? `Multiple students found (${filteredStudents.length}). Type exact Student ID or full name.`
                  : 'No student found for this search.'
                : 'Type Student ID or Name to select a student.'}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Auto Allocation</label>
            <div className="h-11 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm leading-[44px] text-slate-700">
              {oldestPendingFee
                ? `Oldest pending starts from ${oldestPendingFee.month}`
                : studentSearch.trim()
                  ? selectedStudent
                    ? 'No pending month for selected student'
                    : 'Select a single student by exact ID or full name'
                  : 'Search student first'}
            </div>
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
            placeholder={selectedStudentId ? String(selectedStudentPendingTotal || 0) : 'Enter amount'}
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
            <Image
              src="/static-payment-qr.svg"
              alt="Static payment QR"
              width={192}
              height={192}
              className="mt-3 h-48 w-48 rounded-lg border border-slate-200 bg-white p-2"
            />
            <p className="mt-2 text-xs text-slate-500">For in-person collection, confirm payment and record it directly. Screenshot upload is not required here.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submittingCash || !oldestPendingFee}
          className="mt-4 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingCash ? 'Processing...' : paymentMode === 'CASH' ? 'Process Cash Payment' : 'Record Online Payment'}
        </button>
      </form>

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
          scrollY
          maxHeightClass="max-h-[288px]"
          rows={filteredPendingVerifications.map((item) => ({
            id: item._id,
            studentAdmissionNo: item.studentId?.admissionNo || '-',
            studentName: item.studentId?.userId?.name || '-',
            className: formatClassLabel(item.studentId?.classId),
            amount: `INR ${item.amount || 0}`,
            submittedAt: new Date(item.createdAt).toLocaleString('en-GB'),
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