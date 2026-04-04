'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import { del, get, post } from '@/lib/api';
import { getToken } from '@/lib/session';

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_REGEX = /^\d{7,15}$/;

const columns = [
  { key: 'teacherId', label: 'Teacher ID' },
  { key: 'name', label: 'Name' },
  { key: 'contactNumber', label: 'Contact' },
  { key: 'classes', label: 'Classes' },
  { key: 'subjectCount', label: 'Subjects' },
  { key: 'email', label: 'Email' },
  { key: 'actions', label: 'Actions' }
];

const getInitialTeacherForm = () => ({
  name: '',
  email: '',
  password: '',
  contactNumber: '',
  monthlySalary: '',
  pendingSalary: '0',
  classIds: [],
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
  const [classOptions, setClassOptions] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [assignedSubjectIds, setAssignedSubjectIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [typedTeacherId, setTypedTeacherId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const classNameMap = useMemo(
    () =>
      classOptions.reduce((acc, item) => {
        acc[item.id] = item.name;
        return acc;
      }, {}),
    [classOptions]
  );

  const assignedSubjectIdSet = useMemo(() => new Set(assignedSubjectIds), [assignedSubjectIds]);

  const availableSubjects = useMemo(
    () =>
      subjectOptions.filter(
        (subject) => form.classIds.includes(subject.classId)
      ),
    [assignedSubjectIdSet, form.classIds, subjectOptions]
  );

  const availableSubjectsByClass = useMemo(
    () =>
      form.classIds
        .map((classId) => ({
          classId,
          className: classNameMap[classId] || 'Class',
          subjects: availableSubjects.filter((subject) => subject.classId === classId)
        }))
        .filter((item) => item.subjects.length > 0),
    [availableSubjects, classNameMap, form.classIds]
  );

  const loadTeachers = useCallback(async () => {
    setLoadingTeachers(true);
    try {
      const response = await get('/teachers', getToken());
      const teacherRows = response.data || [];
      setAssignedSubjectIds(
        Array.from(
          new Set(
            teacherRows.flatMap((item) =>
              (item.subjects || [])
                .map((entry) => String(entry?._id || entry || '').trim())
                .filter(Boolean)
            )
          )
        )
      );
      setRows(
        teacherRows.map((item) => {
          const row = {
            id: String(item._id),
            teacherId: item.teacherId,
            name: item.userId?.name,
            contactNumber: item.contactNumber || '-',
            classes: (item.classIds || []).map((entry) => entry?.name).filter(Boolean).join(', ') || '-',
            subjectCount: String((item.subjects || []).length || 0),
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
      setError('');
    } catch (apiError) {
      setRows([]);
      setError(apiError.message);
    } finally {
      setLoadingTeachers(false);
    }
  }, []);

  const loadClassAndSubjectOptions = useCallback(async () => {
    const [classResponse, subjectResponse] = await Promise.all([
      get('/classes', getToken()),
      get('/subjects', getToken())
    ]);

    const classes = (classResponse.data || []).map((item) => ({
      id: String(item._id),
      name: item.name || 'Class',
      section: item.section || ''
    }));

    const subjects = (subjectResponse.data || []).map((item) => ({
      id: String(item._id),
      classId: String(item.classId?._id || item.classId || ''),
      name: item.name || '-',
      code: item.code || ''
    }));

    setClassOptions(classes);
    setSubjectOptions(subjects);
  }, []);

  useEffect(() => {
    Promise.all([loadTeachers(), loadClassAndSubjectOptions()]).catch((apiError) => setError(apiError.message));
  }, [loadClassAndSubjectOptions, loadTeachers]);

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onToggleClass = (classId) => {
    setForm((prev) => {
      const exists = prev.classIds.includes(classId);
      const nextClassIds = exists ? prev.classIds.filter((item) => item !== classId) : [...prev.classIds, classId];
      const allowedSubjectIds = new Set(
        subjectOptions
          .filter((subject) => nextClassIds.includes(subject.classId) && !assignedSubjectIdSet.has(subject.id))
          .map((subject) => subject.id)
      );

      return {
        ...prev,
        classIds: nextClassIds,
        subjects: prev.subjects.filter((subjectId) => allowedSubjectIds.has(subjectId))
      };
    });
  };

  const onToggleSubject = (subjectId) => {
    setForm((prev) => {
      const exists = prev.subjects.includes(subjectId);
      if (!exists && assignedSubjectIdSet.has(subjectId)) {
        return prev;
      }

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

    if (!CONTACT_REGEX.test(String(form.contactNumber || '').trim())) {
      setError('Contact number must contain only digits (7 to 15 digits).');
      setMessage('');
      return;
    }

    const monthlySalaryValue = Number(form.monthlySalary);
    if (!Number.isFinite(monthlySalaryValue) || monthlySalaryValue <= 0) {
      setError('Monthly salary must be greater than zero.');
      setMessage('');
      return;
    }

    const pendingSalaryValue =
      form.pendingSalary === '' || form.pendingSalary === null || form.pendingSalary === undefined
        ? 0
        : Number(form.pendingSalary);
    if (!Number.isFinite(pendingSalaryValue) || pendingSalaryValue < 0) {
      setError('Pending salary must be 0 or greater.');
      setMessage('');
      return;
    }

    if (form.classIds.length === 0) {
      setError('Please select at least one class for this teacher.');
      setMessage('');
      return;
    }

    if (form.subjects.length === 0) {
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
          contactNumber: String(form.contactNumber || '').trim(),
          monthlySalary: monthlySalaryValue,
          pendingSalary: pendingSalaryValue,
          classIds: form.classIds,
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
        description="Register teachers with class-wise subject assignment and open any row for full profile and salary records. Teacher ID is generated automatically."
      />
      <form onSubmit={onCreate} className="card-hover animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="mb-1 text-lg font-semibold text-slate-900">Register Teacher</h3>
        <p className="mb-4 text-sm text-slate-600">Assign classes first, then pick subjects from those classes only.</p>
        {message && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <p className="mb-3 text-xs text-slate-500">Fields marked with <span className="font-semibold text-red-600">*</span> are mandatory.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label={requiredLabel('Name')} value={form.name} onChange={onChange('name')} required className="h-11" />
          <Input label={requiredLabel('Email')} type="email" value={form.email} onChange={onChange('email')} required className="h-11" />
          <Input
            label={requiredLabel('Contact Number')}
            value={form.contactNumber}
            onChange={onChange('contactNumber')}
            required
            className="h-11"
            placeholder="Digits only"
          />
          <Input
            label={requiredLabel('Password')}
            type="password"
            value={form.password}
            onChange={onChange('password')}
            required
            className="h-11"
          />
          <Input
            label={requiredLabel('Monthly Salary')}
            type="number"
            value={form.monthlySalary}
            onChange={onChange('monthlySalary')}
            required
            className="h-11"
          />
          <Input
            label="Pending Salary"
            type="number"
            value={form.pendingSalary}
            onChange={onChange('pendingSalary')}
            className="h-11"
            placeholder="0"
          />
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">Classes <span className="text-red-600">*</span></p>
          {classOptions.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">No classes found. Add classes before registering teachers.</p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {classOptions.map((classOption) => (
                <label key={classOption.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.classIds.includes(classOption.id)}
                    onChange={() => onToggleClass(classOption.id)}
                    className="h-4 w-4"
                  />
                  <span>{classOption.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">Subjects <span className="text-red-600">*</span></p>
          {form.classIds.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">Select at least one class first to view subjects.</p>
          ) : availableSubjects.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">No available subjects under selected classes. They may already be assigned to other teachers.</p>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-xs text-slate-500">Subjects tagged as "Already assigned" are reserved and cannot be selected.</p>
              {availableSubjectsByClass.map((group) => (
                <div key={group.classId}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.className}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.subjects.map((subject) => (
                      <label key={subject.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${assignedSubjectIdSet.has(subject.id) ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={form.subjects.includes(subject.id)}
                          onChange={() => onToggleSubject(subject.id)}
                          disabled={assignedSubjectIdSet.has(subject.id)}
                          className="h-4 w-4"
                        />
                        <span className="flex items-center gap-2">
                          <span>
                            {subject.name}
                            {subject.code ? ` (${subject.code})` : ''}
                          </span>
                          {assignedSubjectIdSet.has(subject.id) && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              Already assigned
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
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
      <Table columns={columns} rows={rows} loading={loadingTeachers} getRowHref={(row) => `/admin/teachers/${row.id}`} />

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