'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import InfoCard from '@/components/InfoCard';
import Table from '@/components/Table';
import { get, post, put } from '@/lib/api';
import { getToken } from '@/lib/session';
import Input from '@/components/Input';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const salaryColumns = [
  { key: 'month', label: 'Month' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
  { key: 'paidOn', label: 'Paid On' },
  { key: 'paymentMethod', label: 'Method' },
  { key: 'receiptNumber', label: 'Receipt Number' }
];

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

const getTeacherFormFromProfile = (teacher) => ({
  name: teacher?.userId?.name || '',
  email: teacher?.userId?.email || '',
  teacherId: teacher?.teacherId || '',
  department: teacher?.department || '',
  qualifications: teacher?.qualifications || '',
  joiningDate: teacher?.joiningDate ? String(teacher.joiningDate).slice(0, 10) : '',
  subjects: (teacher?.subjects || []).map((item) => String(item._id)).filter(Boolean),
  password: ''
});

export default function TeacherProfilePage() {
  const params = useParams();
  const teacherId = params?.teacherId;
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    teacherId: '',
    department: '',
    qualifications: '',
    joiningDate: '',
    subjects: [],
    password: ''
  });
  const [paying, setPaying] = useState(false);
  const [form, setForm] = useState({ month: '', amount: '', paymentMethod: 'BANK_TRANSFER', pendingSalaryCleared: '' });

  const loadProfile = async () => {
    if (!teacherId) {
      return;
    }
    const response = await get(`/teachers/${teacherId}/profile`, getToken());
    setProfile(response.data);
  };

  const loadSubjects = async () => {
    const response = await get('/subjects', getToken());
    setSubjectOptions(
      (response.data || []).map((item) => ({
        id: String(item._id),
        name: item.name,
        code: item.code
      }))
    );
  };

  useEffect(() => {
    Promise.all([loadProfile(), loadSubjects()]).catch((apiError) => setError(apiError.message));
  }, [teacherId]);

  useEffect(() => {
    if (profile?.teacher) {
      setEditForm(getTeacherFormFromProfile(profile.teacher));
    }
  }, [profile]);

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onEditChange = (field) => (event) => {
    setEditForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onToggleEditSubject = (subjectId) => {
    setEditForm((prev) => {
      const exists = prev.subjects.includes(subjectId);
      return {
        ...prev,
        subjects: exists ? prev.subjects.filter((item) => item !== subjectId) : [...prev.subjects, subjectId]
      };
    });
  };

  const missingTeacherFields = useMemo(() => {
    const missing = [];
    if (!String(editForm.name || '').trim()) {
      missing.push('Name');
    }
    if (!String(editForm.email || '').trim()) {
      missing.push('Email');
    }
    if (!String(editForm.teacherId || '').trim()) {
      missing.push('Teacher ID');
    }
    if (!String(editForm.department || '').trim()) {
      missing.push('Department');
    }
    if (!String(editForm.qualifications || '').trim()) {
      missing.push('Qualifications');
    }
    if (!String(editForm.joiningDate || '').trim()) {
      missing.push('Joining Date');
    }
    if (editForm.subjects.length === 0) {
      missing.push('Subjects');
    }
    return missing;
  }, [editForm]);

  const onCancelEdit = () => {
    if (profile?.teacher) {
      setEditForm(getTeacherFormFromProfile(profile.teacher));
    }
    setEditMode(false);
    setError('');
  };

  const onSaveEdit = async (event) => {
    event.preventDefault();
    const teacherRecordId = profile?.teacher?._id ? String(profile.teacher._id) : '';
    if (!teacherRecordId) {
      return;
    }

    if (!EMAIL_REGEX.test(String(editForm.email || '').trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    if (missingTeacherFields.length > 0) {
      setError(`Please complete all mandatory fields: ${missingTeacherFields.join(', ')}`);
      return;
    }

    if (editForm.password && String(editForm.password).length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSavingEdit(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        name: String(editForm.name || '').trim(),
        email: String(editForm.email || '').trim(),
        teacherId: String(editForm.teacherId || '').trim(),
        department: String(editForm.department || '').trim(),
        qualifications: String(editForm.qualifications || '').trim(),
        joiningDate: editForm.joiningDate,
        subjects: editForm.subjects
      };

      if (editForm.password) {
        payload.password = editForm.password;
      }

      await put(`/teachers/${teacherRecordId}`, payload, getToken());
      setMessage('Teacher profile updated successfully.');
      setEditMode(false);
      await loadProfile();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const onPaySalary = async (event) => {
    event.preventDefault();
    setPaying(true);
    setError('');
    setMessage('');

    try {
      await post(`/payroll/teacher/${teacherId}/pay`, {
        month: form.month || undefined,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        pendingSalaryCleared: form.pendingSalaryCleared ? Number(form.pendingSalaryCleared) : undefined
      }, getToken());

      setMessage('Salary marked as paid and receipt generated successfully.');
      setForm({ month: '', amount: '', paymentMethod: 'BANK_TRANSFER', pendingSalaryCleared: '' });
      await loadProfile();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setPaying(false);
    }
  };

  if (error && !profile) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
  }

  if (!profile) {
    return <p className="text-sm text-slate-500">Loading teacher profile...</p>;
  }

  const teacher = profile.teacher;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title={teacher?.userId?.name || 'Teacher Profile'}
        description="Full teacher details, salary status, and salary history."
      />

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Teacher Details">
          {!editMode ? (
            <>
              <p className="text-sm text-slate-700">Name: {teacher?.userId?.name || '-'}</p>
              <p className="text-sm text-slate-700">Subject(s): {(teacher?.subjects || []).map((item) => item.name).filter(Boolean).join(', ') || '-'}</p>
              <p className="text-sm text-slate-700">Email: {teacher?.userId?.email || '-'}</p>
              <p className="text-sm text-slate-700">Department: {teacher?.department || '-'}</p>
              <p className="text-sm text-slate-700">Qualifications: {teacher?.qualifications || '-'}</p>
              <p className="text-sm text-slate-700">Joining Date: {teacher?.joiningDate ? new Date(teacher.joiningDate).toLocaleDateString() : '-'}</p>
              <p className="text-sm text-slate-700">Teacher ID: {teacher?.teacherId || '-'}</p>
              <button
                type="button"
                onClick={() => {
                  setEditMode(true);
                  setError('');
                  setMessage('');
                }}
                className="mt-3 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Edit Teacher Details
              </button>
            </>
          ) : (
            <form onSubmit={onSaveEdit} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Name" value={editForm.name} onChange={onEditChange('name')} required className="h-10" />
                <Input label="Email" type="email" value={editForm.email} onChange={onEditChange('email')} required className="h-10" />
                <Input label="Teacher ID" value={editForm.teacherId} onChange={onEditChange('teacherId')} required className="h-10" />
                <Input label="Department" value={editForm.department} onChange={onEditChange('department')} required className="h-10" />
                <Input label="Qualifications" value={editForm.qualifications} onChange={onEditChange('qualifications')} required className="h-10" />
                <Input label="Joining Date" type="date" value={editForm.joiningDate} onChange={onEditChange('joiningDate')} required className="h-10" />
                <Input
                  label="Set New Password (optional)"
                  type="password"
                  value={editForm.password}
                  onChange={onEditChange('password')}
                  className="h-10"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">Subjects</p>
                {subjectOptions.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">No subjects found. Add subjects first, then select them here.</p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {subjectOptions.map((subject) => (
                      <label key={subject.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editForm.subjects.includes(subject.id)}
                          onChange={() => onToggleEditSubject(subject.id)}
                          className="h-4 w-4"
                        />
                        <span>
                          {subject.name} ({subject.code})
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <p
                className={`rounded-md px-3 py-2 text-xs ${
                  missingTeacherFields.length === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                Mandatory fields remaining: {missingTeacherFields.length === 0 ? 'None' : missingTeacherFields.join(', ')}
              </p>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
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

        <InfoCard title="Salary Status">
          <p className="text-sm text-slate-700">Total Paid: INR {profile.salaryStatus?.totalPaid || 0}</p>
          <p className="text-sm text-slate-700">Pending Salary: INR {profile.salaryStatus?.totalPending || 0}</p>
          <p className="text-sm font-semibold text-slate-900">Status: {profile.salaryStatus?.state || 'PENDING'}</p>
        </InfoCard>
      </div>

      <form onSubmit={onPaySalary} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Pay Salary</h3>
        <p className="mb-4 text-sm text-slate-600">Mark teacher salary as paid and generate receipt automatically.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Month (YYYY-MM)" value={form.month} onChange={onChange('month')} className="h-11" placeholder="2026-03" />
          <Input label="Salary Amount" type="number" value={form.amount} onChange={onChange('amount')} required className="h-11" />
          <Input
            label="Payment Method"
            value={form.paymentMethod}
            onChange={onChange('paymentMethod')}
            className="h-11"
            placeholder="BANK_TRANSFER"
          />
          <Input
            label="Pending Salary Cleared"
            type="number"
            value={form.pendingSalaryCleared}
            onChange={onChange('pendingSalaryCleared')}
            className="h-11"
          />
        </div>
        <button
          type="submit"
          disabled={paying}
          className="mt-4 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {paying ? 'Processing...' : 'Mark Salary Paid'}
        </button>
      </form>

      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-900">Salary History</h3>
        <Table
          columns={salaryColumns}
          rows={(profile.salaryHistory || []).map((item) => ({
            id: item._id,
            month: item.month,
            amount: `INR ${item.amount || 0}`,
            status: item.status,
            paidOn: item.paidOn?.slice(0, 10) || '-',
            paymentMethod: item.paymentMethod || '-',
            receiptNumber: item.receiptId?.receiptNumber || '-'
          }))}
        />
      </div>

      {(profile.receipts || []).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Salary Receipts</h3>
          <div className="mt-3 space-y-2">
            {profile.receipts.map((receipt) => (
              <div key={receipt._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {receipt.receiptNumber} - INR {receipt.amount} - {new Date(receipt.paymentDate).toLocaleDateString()}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(`${receipt.receiptNumber}.txt`, [
                      `Receipt Number: ${receipt.receiptNumber}`,
                      `Teacher Name: ${receipt.teacherName || '-'}`,
                      `Salary Amount: INR ${receipt.amount}`,
                      `Payment Date: ${new Date(receipt.paymentDate).toLocaleString()}`,
                      `Payment Method: ${receipt.paymentMethod}`,
                      `Pending Salary Cleared: INR ${receipt.pendingSalaryCleared || 0}`,
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
        </div>
      )}
    </div>
  );
}
