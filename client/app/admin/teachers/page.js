'use client';

import { useEffect, useMemo, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import { del, get, post } from '@/lib/api';
import { getToken } from '@/lib/session';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const columns = [
  { key: 'teacherId', label: 'Teacher ID' },
  { key: 'name', label: 'Name' },
  { key: 'department', label: 'Department' },
  { key: 'email', label: 'Email' },
  { key: 'actions', label: 'Actions' }
];

const getInitialTeacherForm = () => ({
  name: '',
  email: '',
  password: '',
  teacherId: '',
  department: '',
  qualifications: '',
  joiningDate: '',
  subjects: []
});

const requiredLabel = (label) => (
  <>
    {label} <span className="text-red-600">*</span>
  </>
);

export default function AdminTeachersPage() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(getInitialTeacherForm());
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [typedTeacherId, setTypedTeacherId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadTeachers = async () => {
    const response = await get('/teachers', getToken());
    setRows(
      response.data.map((item) => {
        const row = {
          id: String(item._id),
          teacherId: item.teacherId,
          name: item.userId?.name,
          department: item.department,
          email: item.userId?.email
        };

        return {
          ...row,
          actions: (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteTeacher(row);
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove
            </button>
          )
        };
      })
    );
  };

  const loadSubjects = async () => {
    const response = await get('/subjects', getToken());
    const options = (response.data || []).map((item) => ({
      id: String(item._id),
      name: item.name,
      code: item.code
    }));
    setSubjectOptions(options);
  };

  useEffect(() => {
    Promise.all([loadTeachers(), loadSubjects()]).catch((apiError) => setError(apiError.message));
  }, []);

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onToggleSubject = (subjectId) => {
    setForm((prev) => {
      const exists = prev.subjects.includes(subjectId);
      return {
        ...prev,
        subjects: exists ? prev.subjects.filter((item) => item !== subjectId) : [...prev.subjects, subjectId]
      };
    });
  };

  const onCreate = async (event) => {
    event.preventDefault();

    if (!EMAIL_REGEX.test(String(form.email || '').trim())) {
      setError('Please enter a valid email address.');
      setMessage('');
      return;
    }

    if (!String(form.department || '').trim() || !String(form.qualifications || '').trim() || !form.joiningDate) {
      setError('Please enter all teacher details before creating the account.');
      setMessage('');
      return;
    }

    if (subjectOptions.length > 0 && form.subjects.length === 0) {
      setError('Please select at least one subject for this teacher.');
      setMessage('');
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      await post(
        '/teachers',
        {
          name: String(form.name || '').trim(),
          email: String(form.email || '').trim(),
          password: form.password,
          teacherId: String(form.teacherId || '').trim(),
          department: String(form.department || '').trim(),
          qualifications: String(form.qualifications || '').trim(),
          joiningDate: form.joiningDate,
          subjects: form.subjects
        },
        getToken()
      );
      setMessage('Teacher account created successfully');
      setForm(getInitialTeacherForm());
      await loadTeachers();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const onDeleteTeacher = async (row) => {
    setDeleteTarget(row);
    setTypedTeacherId('');
    setMessage('');
    setError('');
  };

  const onConfirmDeleteTeacher = async () => {
    if (!deleteTarget) {
      return;
    }

    const expectedTeacherId = deleteTarget.teacherId || deleteTarget.id;
    if (!typedTeacherId || typedTeacherId.trim() !== expectedTeacherId) {
      setError('Deletion cancelled. Teacher ID did not match.');
      return;
    }

    setDeletingId(deleteTarget.id);
    setMessage('');
    setError('');
    try {
      await del(`/teachers/${deleteTarget.id}`, getToken());
      setMessage('Teacher deleted successfully.');
      setDeleteTarget(null);
      setTypedTeacherId('');
      await loadTeachers();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Teachers"
        description="View all registered teachers. Click any row to open full profile and salary records."
      />
      <form onSubmit={onCreate} className="card-hover animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="mb-1 text-lg font-semibold text-slate-900">Register Teacher</h3>
        <p className="mb-4 text-sm text-slate-600">Admin must register each teacher one by one with all profile details.</p>
        {message && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <p className="mb-3 text-xs text-slate-500">Fields marked with <span className="font-semibold text-red-600">*</span> are mandatory.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label={requiredLabel('Name')} value={form.name} onChange={onChange('name')} required className="h-11" />
          <Input label={requiredLabel('Email')} type="email" value={form.email} onChange={onChange('email')} required className="h-11" />
          <Input label={requiredLabel('Teacher ID')} value={form.teacherId} onChange={onChange('teacherId')} required className="h-11" />
          <Input label={requiredLabel('Department')} value={form.department} onChange={onChange('department')} required className="h-11" />
          <Input label={requiredLabel('Qualifications')} value={form.qualifications} onChange={onChange('qualifications')} required className="h-11" />
          <Input label={requiredLabel('Joining Date')} type="date" value={form.joiningDate} onChange={onChange('joiningDate')} required className="h-11" />
          <Input
            label={requiredLabel('Password')}
            type="password"
            value={form.password}
            onChange={onChange('password')}
            required
            className="h-11"
          />
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">Subjects <span className="text-red-600">*</span></p>
          {subjectOptions.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">No subjects found. Add subjects first, then select them here.</p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {subjectOptions.map((subject) => (
                <label key={subject.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.subjects.includes(subject.id)}
                    onChange={() => onToggleSubject(subject.id)}
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

        <button
          type="submit"
          disabled={loading}
          className="mt-2 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create Teacher'}
        </button>
      </form>
      <Table columns={columns} rows={rows} getRowHref={(row) => `/admin/teachers/${row.id}`} />

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Teacher Deletion</h3>
            <p className="mt-2 text-sm text-slate-600">
              Type Teacher ID <span className="font-semibold text-slate-900">{deleteTarget.teacherId || deleteTarget.id}</span> to permanently delete{' '}
              <span className="font-semibold text-slate-900">{deleteTarget.name}</span>.
            </p>

            <input
              type="text"
              value={typedTeacherId}
              onChange={(event) => setTypedTeacherId(event.target.value)}
              placeholder="Enter Teacher ID"
              className="mt-3 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setTypedTeacherId('');
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDeleteTeacher}
                disabled={
                  deletingId === deleteTarget.id ||
                  typedTeacherId.trim() !== (deleteTarget.teacherId || deleteTarget.id)
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? 'Deleting...' : 'Delete Teacher'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}