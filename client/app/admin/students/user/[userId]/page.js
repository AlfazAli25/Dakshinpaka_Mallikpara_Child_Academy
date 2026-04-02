'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import InfoCard from '@/components/InfoCard';
import Table from '@/components/Table';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { get, put } from '@/lib/api';
import { getToken } from '@/lib/session';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const feeColumns = [
  { key: 'month', label: 'Month' },
  { key: 'amountDue', label: 'Amount Due' },
  { key: 'amountPaid', label: 'Amount Paid' }
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
  classId: student?.classId?._id ? String(student.classId._id) : '',
  gender: student?.gender || '',
  dob: student?.dob ? String(student.dob).slice(0, 10) : '',
  guardianContact: student?.guardianContact || '',
  address: student?.address || '',
  pendingFees: student?.pendingFees === 0 || student?.pendingFees ? String(student.pendingFees) : '',
  attendance: student?.attendance === 0 || student?.attendance ? String(student.attendance) : '',
  password: ''
});

export default function StudentUserProfilePage() {
  const params = useParams();
  const userId = params?.userId;
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
    classId: '',
    gender: '',
    dob: '',
    guardianContact: '',
    address: '',
    pendingFees: '',
    attendance: '',
    password: ''
  });

  const loadProfile = async () => {
    if (!userId) {
      return;
    }

    const response = await get(`/students/by-user/${userId}/profile`, getToken());
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
  }, [userId]);

  useEffect(() => {
    if (profile?.student) {
      setEditForm(getStudentFormFromProfile(profile.student));
    }
  }, [profile]);

  const onEditChange = (field) => (event) => {
    setEditForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const missingStudentFields = useMemo(() => {
    const missing = [];
    if (!String(editForm.name || '').trim()) {
      missing.push('Name');
    }
    if (!String(editForm.email || '').trim()) {
      missing.push('Email');
    }
    if (!String(editForm.admissionNo || '').trim()) {
      missing.push('Admission No');
    }
    if (!String(editForm.classId || '').trim()) {
      missing.push('Class');
    }
    if (!String(editForm.gender || '').trim()) {
      missing.push('Gender');
    }
    if (!String(editForm.dob || '').trim()) {
      missing.push('Date of Birth');
    }
    if (!String(editForm.guardianContact || '').trim()) {
      missing.push('Guardian Contact');
    }
    if (!String(editForm.address || '').trim()) {
      missing.push('Address');
    }
    if (String(editForm.pendingFees || '').trim() === '') {
      missing.push('Pending Fees');
    }
    if (String(editForm.attendance || '').trim() === '') {
      missing.push('Attendance');
    }
    return missing;
  }, [editForm]);

  const onCancelEdit = () => {
    if (profile?.student) {
      setEditForm(getStudentFormFromProfile(profile.student));
    }
    setEditMode(false);
    setError('');
  };

  const onSaveEdit = async (event) => {
    event.preventDefault();
    const studentRecordId = profile?.student?._id ? String(profile.student._id) : '';
    if (!studentRecordId || studentRecordId.startsWith('user-')) {
      setError('Cannot edit this account until a linked student profile exists.');
      return;
    }

    if (!EMAIL_REGEX.test(String(editForm.email || '').trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    if (missingStudentFields.length > 0) {
      setError(`Please complete all mandatory fields: ${missingStudentFields.join(', ')}`);
      return;
    }

    if (editForm.password && String(editForm.password).length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const normalizedPendingFees = Number(editForm.pendingFees);
    const normalizedAttendance = Number(editForm.attendance);
    if (!Number.isFinite(normalizedPendingFees) || normalizedPendingFees < 0) {
      setError('Pending fees must be 0 or greater.');
      return;
    }
    if (!Number.isFinite(normalizedAttendance) || normalizedAttendance < 0 || normalizedAttendance > 100) {
      setError('Attendance must be between 0 and 100.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        name: String(editForm.name || '').trim(),
        email: String(editForm.email || '').trim(),
        admissionNo: String(editForm.admissionNo || '').trim(),
        classId: editForm.classId,
        gender: editForm.gender,
        dob: editForm.dob,
        guardianContact: String(editForm.guardianContact || '').trim(),
        address: String(editForm.address || '').trim(),
        pendingFees: normalizedPendingFees,
        attendance: normalizedAttendance
      };

      if (editForm.password) {
        payload.password = editForm.password;
      }

      await put(`/students/${studentRecordId}`, payload, getToken());
      setMessage('Student profile updated successfully.');
      setEditMode(false);
      await loadProfile();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !profile) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
  }

  if (!profile) {
    return <p className="text-sm text-slate-500">Loading student profile...</p>;
  }

  const student = profile.student;
  const linkedRecordId = student?._id ? String(student._id) : '';
  const canEdit = Boolean(linkedRecordId) && !linkedRecordId.startsWith('user-');
  const classSelectOptions = [
    { value: '', label: classOptions.length > 0 ? 'Select Class' : 'No classes found' },
    ...classOptions
  ];
  const groupedPayments = Object.values(
    (profile.payments || []).reduce((acc, item) => {
      const key = String(item.createdAt || '').slice(0, 10) || '-';
      const amount = Number(item.amount || 0);
      const mode = toPaymentMode(item.paymentMethod);

      if (!acc[key]) {
        acc[key] = {
          id: key,
          createdAt: key,
          amount: 0,
          viaCash: 0,
          viaOnline: 0
        };
      }

      acc[key].amount += amount;
      if (mode === 'Via Cash') {
        acc[key].viaCash += amount;
      } else {
        acc[key].viaOnline += amount;
      }

      return acc;
    }, {})
  ).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title={student?.userId?.name || 'Student Profile'}
        description="Full student details, fee status, and payment history."
      />

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Student Details">
          {!editMode ? (
            <>
              <p className="text-sm text-slate-700">Name: {student?.userId?.name || '-'}</p>
              <p className="text-sm text-slate-700">Class: {student?.classId?.name || '-'}</p>
              <p className="text-sm text-slate-700">Section: {student?.classId?.section || '-'}</p>
              <p className="text-sm text-slate-700">Gender: {student?.gender || '-'}</p>
              <p className="text-sm text-slate-700">Date of Birth: {student?.dob ? new Date(student.dob).toLocaleDateString() : '-'}</p>
              <p className="text-sm text-slate-700">Guardian Contact: {student?.guardianContact || '-'}</p>
              <p className="text-sm text-slate-700">Email: {student?.userId?.email || '-'}</p>
              <p className="text-sm text-slate-700">Admission No: {student?.admissionNo || '-'}</p>
              <p className="text-sm text-slate-700">Address: {student?.address || '-'}</p>
              <p className="text-sm text-slate-700">Pending Fees: INR {student?.pendingFees || 0}</p>
              <p className="text-sm text-slate-700">Attendance: {student?.attendance || 0}%</p>
              <button
                type="button"
                onClick={() => {
                  if (canEdit) {
                    setEditMode(true);
                    setError('');
                    setMessage('');
                  }
                }}
                disabled={!canEdit}
                className="mt-3 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Edit Student Details
              </button>
              {!canEdit && (
                <p className="mt-2 text-xs text-amber-700">This account has no linked student profile yet, so editing is unavailable.</p>
              )}
            </>
          ) : (
            <form onSubmit={onSaveEdit} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Name" value={editForm.name} onChange={onEditChange('name')} required className="h-10" />
                <Input label="Email" type="email" value={editForm.email} onChange={onEditChange('email')} required className="h-10" />
                <Input label="Admission No" value={editForm.admissionNo} onChange={onEditChange('admissionNo')} required className="h-10" />
                <Select label="Class" value={editForm.classId} onChange={onEditChange('classId')} required className="h-10" options={classSelectOptions} />
                <Select label="Gender" value={editForm.gender} onChange={onEditChange('gender')} required className="h-10" options={genderOptions} />
                <Input label="Date of Birth" type="date" value={editForm.dob} onChange={onEditChange('dob')} required className="h-10" />
                <Input label="Guardian Contact" value={editForm.guardianContact} onChange={onEditChange('guardianContact')} required className="h-10" />
                <Input label="Address" value={editForm.address} onChange={onEditChange('address')} required className="h-10" />
                <Input
                  label="Pending Fees (INR)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.pendingFees}
                  onChange={onEditChange('pendingFees')}
                  required
                  className="h-10"
                />
                <Input
                  label="Attendance (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={editForm.attendance}
                  onChange={onEditChange('attendance')}
                  required
                  className="h-10"
                />
                <Input
                  label="Set New Password (optional)"
                  type="password"
                  value={editForm.password}
                  onChange={onEditChange('password')}
                  className="h-10"
                />
              </div>

              <p
                className={`rounded-md px-3 py-2 text-xs ${
                  missingStudentFields.length === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                Mandatory fields remaining: {missingStudentFields.length === 0 ? 'None' : missingStudentFields.join(', ')}
              </p>

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
          rows={(profile.fees || []).map((item) => ({
            id: item._id,
            month: formatMonth(item.dueDate),
            amountDue: `INR ${item.amountDue || 0}`,
            amountPaid: `INR ${item.amountPaid || 0}`
          }))}
        />
      </div>

      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-900">Payment History</h3>
        <Table
          columns={paymentColumns}
          rows={groupedPayments.map((item) => ({
            id: item.id,
            createdAt: item.createdAt,
            amount: `INR ${item.amount}`,
            paymentMethod: [
              item.viaCash > 0 ? `${item.viaCash} Via Cash` : '',
              item.viaOnline > 0 ? `${item.viaOnline} Via Online` : ''
            ]
              .filter(Boolean)
              .join(' and ') || '-'
          }))}
        />
      </div>
    </div>
  );
}
