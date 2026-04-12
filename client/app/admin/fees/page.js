'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/ui/button';
import { get, getBlob, post } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const verificationColumns = [
  { key: 'studentAdmissionNo', label: 'Student ID' },
  { key: 'studentName', label: 'Student' },
  { key: 'className', label: 'Class' },
  { key: 'section', label: 'Section' },
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
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('');
  const [debouncedVerificationSearch, setDebouncedVerificationSearch] = useState('');
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

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedStudentSearch(studentSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [studentSearch]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedVerificationSearch(verificationSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [verificationSearch]);

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

  const filteredStudents = useMemo(
    () => filterStudentsBySearch(students, debouncedStudentSearch),
    [debouncedStudentSearch, students]
  );

  const selectedStudent = useMemo(() => {
    const query = String(debouncedStudentSearch || '').trim().toLowerCase();
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
  }, [debouncedStudentSearch, filteredStudents, students]);

  const selectedStudentId = String(selectedStudent?._id || '');

  const filteredPendingVerifications = useMemo(
    () => filterVerificationRows(pendingVerifications, debouncedVerificationSearch),
    [debouncedVerificationSearch, pendingVerifications]
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

  const feeSummary = useMemo(() => {
    const totalDue = rows.reduce((sum, row) => sum + Number(row.amountDueValue || 0), 0);
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amountPaidValue || 0), 0);
    const totalPending = rows.reduce((sum, row) => sum + Number(row.pendingAmountValue || 0), 0);

    return {
      totalDue,
      totalPaid,
      totalPending,
      pendingVerificationCount: pendingVerifications.length,
      filteredVerificationCount: filteredPendingVerifications.length
    };
  }, [filteredPendingVerifications.length, pendingVerifications.length, rows]);

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
        description="Process cash or direct online records, and verify student static-QR screenshot submissions."
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">Total Due</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">INR {feeSummary.totalDue}</p>
        </div>
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">Total Paid</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">INR {feeSummary.totalPaid}</p>
        </div>
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">Total Pending</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">INR {feeSummary.totalPending}</p>
        </div>
        <div className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700 dark:text-red-200">Pending Verifications</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">{feeSummary.pendingVerificationCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-red-100/75">Filtered: {feeSummary.filteredVerificationCount}</p>
        </div>
      </section>

      <form
        onSubmit={onProcessPayment}
        className="rounded-3xl border border-red-100/85 bg-white/85 p-5 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-red-50">Process Payments</h3>
        <p className="mb-4 text-sm text-slate-600 dark:text-red-100/80">Record cash or direct online confirmations. Use the queue below only for student-uploaded static QR screenshots.</p>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Search Student (ID / Name)"
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            className="h-11"
            placeholder="Type student ID or name"
            required
          />

          <div className="rounded-xl border border-red-100 bg-red-50/65 px-3 py-2 text-sm text-slate-700 dark:border-red-400/20 dark:bg-red-900/20 dark:text-red-100">
            {selectedStudent
              ? `Selected: ${selectedStudent.userId?.name || 'Student'} (${selectedStudent.admissionNo || '-'})`
              : studentSearch.trim()
                ? filteredStudents.length > 1
                  ? `Multiple students found (${filteredStudents.length}). Type exact Student ID or full name.`
                  : 'No student found for this search.'
                : 'Type Student ID or Name to select a student.'}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-red-100">Auto Allocation</label>
            <div className="h-11 rounded-xl border border-red-200 bg-red-50/60 px-3 text-sm leading-[44px] text-slate-700 dark:border-red-400/30 dark:bg-red-900/20 dark:text-red-100">
              {oldestPendingFee
                ? `Oldest pending starts from ${oldestPendingFee.month}`
                : studentSearch.trim()
                  ? selectedStudent
                    ? 'No pending month for selected student'
                    : 'Select a single student by exact ID or full name'
                  : 'Search student first'}
            </div>
          </div>

          <Select
            label="Payment Mode"
            value={paymentMode}
            onChange={(event) => setPaymentMode(event.target.value)}
            options={[
              { value: 'CASH', label: 'Via Cash' },
              { value: 'ONLINE', label: 'Online (Direct Record)' }
            ]}
            required
          />

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
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-4 dark:border-red-400/20 dark:bg-red-900/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800 dark:text-red-100">Static QR Code (Reference)</p>
              <button
                type="button"
                onClick={downloadQrAsJpeg}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-red-400/30 dark:bg-slate-800 dark:text-red-100 dark:hover:bg-slate-700"
              >
                Download QR
              </button>
            </div>
            <Image
              src="/static-payment-qr.svg"
              alt="Static payment QR"
              width={192}
              height={192}
              className="mt-3 h-48 w-48 rounded-xl border border-red-100 bg-white p-2 dark:border-red-400/20 dark:bg-slate-900/80"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-red-100/75">For in-person collection, confirm payment and record it directly. Screenshot upload is not required here.</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={submittingCash || !oldestPendingFee}
          className="mt-4"
          size="md"
        >
          {submittingCash ? 'Processing...' : paymentMode === 'CASH' ? 'Process Cash Payment' : 'Record Online Payment'}
        </Button>
      </form>

      <div className="rounded-3xl border border-red-100/85 bg-white/85 p-5 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-red-50">Static QR Verification Queue</h3>
        <p className="mb-3 text-sm text-slate-600 dark:text-red-100/80">Review uploaded screenshots, then approve or reject payment verification.</p>

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
          virtualize
          virtualizationThreshold={40}
          virtualHeight={288}
          rows={filteredPendingVerifications.map((item) => ({
            id: item._id,
            studentAdmissionNo: item.studentId?.admissionNo || '-',
            studentName: item.studentId?.userId?.name || '-',
            className: item.studentId?.classId?.name || '-',
            section: item.studentId?.classId?.section || '-',
            amount: `INR ${item.amount || 0}`,
            submittedAt: new Date(item.createdAt).toLocaleString('en-GB'),
            status: 'Pending'
          }))}
        />

        {filteredPendingVerifications.length > 0 && (
          <div className="mt-4 space-y-2">
            {filteredPendingVerifications.map((item) => (
              <div key={item._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2 dark:border-red-400/20 dark:bg-red-900/15">
                <p className="text-sm text-slate-700 dark:text-red-100">
                  {item.studentId?.admissionNo || '-'} - {item.studentId?.userId?.name || 'Student'} - INR {item.amount}
                </p>
                <Button
                  type="button"
                  onClick={() => onViewScreenshot(item._id)}
                  variant="outline"
                  size="sm"
                >
                  View Screenshot
                </Button>
                <Button
                  type="button"
                  onClick={() => onVerify(item._id, 'APPROVE')}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  onClick={() => onVerify(item._id, 'REJECT')}
                  variant="danger"
                  size="sm"
                >
                  Reject
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}