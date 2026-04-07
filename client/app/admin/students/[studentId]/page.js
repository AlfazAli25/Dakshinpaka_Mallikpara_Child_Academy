'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import InfoCard from '@/components/InfoCard';
import Table from '@/components/Table';
import Input from '@/components/Input';
import Select from '@/components/Select';
import DetailsGrid from '@/components/DetailsGrid';
import { get, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTHLY_FEE_AMOUNT = 200;

const feeColumns = [
  { key: 'month', label: 'Month' },
  { key: 'amountPaid', label: 'Amount Paid' },
  { key: 'amountPending', label: 'Amount Pending' },
  { key: 'status', label: 'Status' }
];

const paymentColumns = [
  { key: 'createdAt', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'paymentMethod', label: 'Payment Method' }
];

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

const toPaymentMode = (paymentMethod) => (String(paymentMethod || '').toUpperCase().includes('CASH') ? 'Via Cash' : 'Via Online');

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

const genderOptions = [
  { value: '', label: 'Select Gender' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' }
];

const getStudentFormFromProfile = (student) => ({
  name: student?.userId?.name || '',
  email: student?.userId?.email || '',
  admissionNo: student?.admissionNo || '',
  rollNo: student?.rollNo === 0 || student?.rollNo ? String(student.rollNo) : '',
  classId: student?.classId?._id ? String(student.classId._id) : '',
  gender: student?.gender || '',
  dob: student?.dob ? String(student.dob).slice(0, 10) : '',
  guardianContact: student?.guardianContact || '',
  address: student?.address || '',
  pendingFees: student?.pendingFees === 0 || student?.pendingFees ? String(student.pendingFees) : '',
  password: ''
});

export default function StudentProfilePage() {
  const params = useParams();
  const studentId = params?.studentId;
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classOptions, setClassOptions] = useState([]);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    admissionNo: '',
    rollNo: '',
    classId: '',
    gender: '',
    dob: '',
    guardianContact: '',
    address: '',
    pendingFees: '',
    password: ''
  });

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

  const loadProfile = async () => {
    if (!studentId) {
      return;
    }

    const response = await get(`/students/${studentId}/profile`, getToken(), {
      forceRefresh: true,
      cacheTtlMs: 0
    });
    setProfile(response.data);
  };

  const loadClasses = async () => {
    const response = await get('/classes', getToken());
    setClassOptions(
      (response.data || []).map((item) => ({
        value: String(item._id),
        label: item.section ? `${item.name} (${item.section})` : item.name
      }))
    );
  };

  useEffect(() => {
    Promise.all([loadProfile(), loadClasses()]).catch((apiError) => setError(apiError.message));
  }, [studentId]);

  useEffect(() => {
    if (profile?.student) {
      setEditForm(getStudentFormFromProfile(profile.student));
    }
  }, [profile]);

  const onEditChange = (field) => (event) => {
    setEditForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onCancelEdit = () => {
    if (profile?.student) {
      setEditForm(getStudentFormFromProfile(profile.student));
    }
    setEditMode(false);
    setError('');
  };

  const onSaveEdit = async (event) => {
    event.preventDefault();
    if (!profile?.student?._id) {
      return;
    }

    const originalForm = getStudentFormFromProfile(profile.student);
    const payload = {};

    const nextName = String(editForm.name || '').trim();
    const nextEmail = String(editForm.email || '').trim();
    const nextAdmissionNo = String(editForm.admissionNo || '').trim();
    const nextRollNoText = String(editForm.rollNo || '').trim();
    const nextGuardianContact = String(editForm.guardianContact || '').trim();
    const nextAddress = String(editForm.address || '').trim();

    if (nextName && nextName !== String(originalForm.name || '').trim()) {
      payload.name = nextName;
    }

    if (nextEmail && nextEmail !== String(originalForm.email || '').trim()) {
      if (!EMAIL_REGEX.test(nextEmail)) {
        setError('Please enter a valid email address.');
        return;
      }

      payload.email = nextEmail;
    }

    if (nextAdmissionNo && nextAdmissionNo !== String(originalForm.admissionNo || '').trim()) {
      payload.admissionNo = nextAdmissionNo;
    }

    if (nextRollNoText && nextRollNoText !== String(originalForm.rollNo || '').trim()) {
      const normalizedRollNo = Number(nextRollNoText);
      if (!Number.isInteger(normalizedRollNo) || normalizedRollNo <= 0) {
        setError('Roll number must be a positive whole number.');
        return;
      }

      payload.rollNo = normalizedRollNo;
    }

    if (editForm.classId && editForm.classId !== String(originalForm.classId || '').trim()) {
      payload.classId = editForm.classId;
    }

    if (editForm.gender && editForm.gender !== String(originalForm.gender || '').trim()) {
      payload.gender = editForm.gender;
    }

    if (editForm.dob && editForm.dob !== String(originalForm.dob || '').trim()) {
      payload.dob = editForm.dob;
    }

    if (nextGuardianContact && nextGuardianContact !== String(originalForm.guardianContact || '').trim()) {
      payload.guardianContact = nextGuardianContact;
    }

    if (nextAddress && nextAddress !== String(originalForm.address || '').trim()) {
      payload.address = nextAddress;
    }

    const pendingFeesText = String(editForm.pendingFees || '').trim();
    const originalPendingFeesText = String(originalForm.pendingFees || '').trim();
    if (pendingFeesText && pendingFeesText !== originalPendingFeesText) {
      const normalizedPendingFees = Number(pendingFeesText);
      if (!Number.isFinite(normalizedPendingFees) || normalizedPendingFees < 0) {
        setError('Pending fees must be 0 or greater.');
        return;
      }

      payload.pendingFees = normalizedPendingFees;
    }

    if (editForm.password && String(editForm.password).length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (editForm.password) {
      payload.password = editForm.password;
    }

    if (Object.keys(payload).length === 0) {
      setMessage('No changes found to update.');
      setError('');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await put(`/students/${profile.student._id}`, payload, getToken());
      setMessage('Student profile updated successfully.');
      setEditMode(false);
      await loadProfile();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSaving(false);
    }
  };

  const paymentRows = useMemo(
    () =>
      (profile?.payments || [])
        .map((item, index) => {
          const parsed = item.createdAt ? new Date(item.createdAt) : null;
          const timestamp = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0;
          return {
            id: String(item._id || `${item.createdAt || 'payment'}-${index}`),
            timestamp,
            createdAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('en-GB') : '-',
            amount: `INR ${Number(item.amount || 0)}`,
            paymentMethod: toPaymentMode(item.paymentMethod)
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(({ timestamp, ...row }) => row),
    [profile?.payments]
  );

  if (!profile) {
    return <p className="text-sm text-slate-500">{error ? 'Unable to load student profile right now.' : 'Loading student profile...'}</p>;
  }

  const student = profile.student;
  const classSelectOptions = [
    { value: '', label: classOptions.length > 0 ? 'Select Class' : 'No classes found' },
    ...classOptions
  ];
  const studentDetailItems = [
    { label: 'Name', value: student?.userId?.name || '-' },
    { label: 'Class', value: formatClassLabel(student?.classId) },
    { label: 'Section', value: student?.classId?.section || '-' },
    { label: 'Gender', value: student?.gender || '-' },
    { label: 'Date of Birth', value: student?.dob ? new Date(student.dob).toLocaleDateString('en-GB') : '-' },
    { label: 'Guardian Contact', value: student?.guardianContact || '-' },
    { label: 'Email', value: student?.userId?.email || '-' },
    { label: 'Student ID', value: student?.admissionNo || '-' },
    { label: 'Roll No', value: student?.rollNo || '-' },
    { label: 'Address', value: student?.address || '-' },
    { label: 'Pending Fees', value: `INR ${student?.pendingFees || 0}`, highlight: true },
    { label: 'Attendance', value: `${student?.attendance || 0}%` }
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title={student?.userId?.name || 'Student Profile'}
        description="Full student details, fee status, and payment history."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Student Details">
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-300 bg-white">
              <img
                src={student?.profileImageUrl || '/default-student-avatar.svg'}
                alt="Student profile"
                onError={(event) => {
                  event.currentTarget.src = '/default-student-avatar.svg';
                }}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{student?.userId?.name || 'Student'}</p>
              <p className="text-xs text-slate-600">Student ID: {student?.admissionNo || '-'}</p>
              <p className="text-xs text-slate-600">Roll No: {student?.rollNo || '-'}</p>
            </div>
          </div>

          {!editMode ? (
            <>
              <DetailsGrid items={studentDetailItems} />
              <button
                type="button"
                onClick={() => {
                  setEditMode(true);
                  setError('');
                  setMessage('');
                }}
                className="mt-4 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Edit Student Details
              </button>
            </>
          ) : (
            <form onSubmit={onSaveEdit} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Name" value={editForm.name} onChange={onEditChange('name')} className="h-10" />
                <Input label="Email" type="email" value={editForm.email} onChange={onEditChange('email')} className="h-10" />
                <Input label="Student ID" value={editForm.admissionNo} onChange={onEditChange('admissionNo')} className="h-10" />
                <Input label="Roll No" type="number" min="1" step="1" value={editForm.rollNo} onChange={onEditChange('rollNo')} className="h-10" />
                <Select label="Class" value={editForm.classId} onChange={onEditChange('classId')} className="h-10" options={classSelectOptions} />
                <Select label="Gender" value={editForm.gender} onChange={onEditChange('gender')} className="h-10" options={genderOptions} />
                <Input label="Date of Birth" type="date" value={editForm.dob} onChange={onEditChange('dob')} className="h-10" />
                <Input label="Guardian Contact" value={editForm.guardianContact} onChange={onEditChange('guardianContact')} className="h-10" />
                <Input label="Address" value={editForm.address} onChange={onEditChange('address')} className="h-10" />
                <Input
                  label="Pending Fees (INR)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.pendingFees}
                  onChange={onEditChange('pendingFees')}
                  className="h-10"
                />
                <Input
                  label="Attendance (%) - Auto Calculated"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={Number(student?.attendance || 0)}
                  disabled
                  readOnly
                  className="h-10 bg-slate-100 text-slate-600"
                />
                <Input
                  label="Set New Password (optional)"
                  type="password"
                  value={editForm.password}
                  onChange={onEditChange('password')}
                  className="h-10"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </InfoCard>

        <InfoCard title="Fee Status">
          <p className="text-sm text-slate-700">Total Due: INR {profile.feeStatus?.totalDue || 0}</p>
          <p className="text-sm text-slate-700">Total Paid: INR {profile.feeStatus?.totalPaid || 0}</p>
          <p className="text-sm text-slate-700">Pending: INR {profile.feeStatus?.totalPending || 0}</p>
          <p className="text-sm font-semibold text-slate-900">Status: {profile.feeStatus?.state || 'PENDING'}</p>
        </InfoCard>
      </div>

      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-900">Fee Records</h3>
        <Table
          columns={feeColumns}
          scrollY
          maxHeightClass="max-h-[288px]"
          rows={(profile.fees || [])
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
            .filter((item) => item.amountDueValue > 0 || item.amountPaidValue > 0)}
        />
      </div>

      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-900">Payment History</h3>
        <Table
          columns={paymentColumns}
          scrollY
          maxHeightClass="max-h-[288px]"
          rows={paymentRows}
        />
      </div>
    </div>
  );
}