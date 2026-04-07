'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { del, get, postForm } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const columns = [
  { key: 'admissionNo', label: 'Student ID' },
  { key: 'rollNo', label: 'Roll No' },
  { key: 'name', label: 'Name' },
  { key: 'className', label: 'Class' },
  { key: 'guardianContact', label: 'Guardian Contact' },
  { key: 'actions', label: 'Actions' }
];

const getInitialStudentForm = () => ({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  classId: '',
  rollNo: '',
  gender: '',
  dob: '',
  guardianContact: '',
  address: '',
  pendingFees: '',
  attendance: ''
});

const genderOptions = [
  { value: '', label: 'Select Gender' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' }
];

const requiredLabel = (label) => (
  <>
    {label} <span className="text-red-600">*</span>
  </>
);

export default function AdminStudentsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(getInitialStudentForm());
  const [studentPhotoFile, setStudentPhotoFile] = useState(null);
  const [studentPhotoPreview, setStudentPhotoPreview] = useState('');
  const [classOptions, setClassOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [typedStudentId, setTypedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const latestStudentsRequestIdRef = useRef(0);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (message) {
      toast.success(message);
    }
  }, [message, toast]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error, toast]);

  useEffect(() => () => {
    if (studentPhotoPreview) {
      URL.revokeObjectURL(studentPhotoPreview);
    }
  }, [studentPhotoPreview]);

  const openDeleteDialog = useCallback((row) => {
    setDeleteTarget(row);
    setTypedStudentId('');
    setMessage('');
    setError('');
  }, []);

  const loadStudents = useCallback(async ({ forceRefresh = false } = {}) => {
    const requestId = latestStudentsRequestIdRef.current + 1;
    latestStudentsRequestIdRef.current = requestId;
    setLoadingStudents(true);
    const token = getToken();
    try {
      const response = await get('/students/admin/all', token, {
        forceRefresh,
        retryCount: 2,
        retryDelayMs: 250
      });
      const mapped = (response.data || []).map((item) => ({
        id: String(item._id),
        profileId: item.isLinkedRecord ? String(item._id) : '',
        userProfileId: item.userId?._id ? String(item.userId._id) : '',
        profileHref: item.isLinkedRecord
          ? `/admin/students/${String(item._id)}`
          : item.userId?._id
            ? `/admin/students/user/${String(item.userId._id)}`
            : '',
        admissionNo: item.admissionNo || '-',
        rollNo: item.rollNo || '-',
        name: item.userId?.name || '-',
        className: formatClassLabel(item.classId),
        guardianContact: item.guardianContact || '-',
        isLinkedRecord: Boolean(item.isLinkedRecord)
      }));
      setRows(
        mapped.map((row) => ({
          ...row,
          actions: (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!row.profileHref) {
                    return;
                  }
                  router.push(row.profileHref);
                }}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!row.userProfileId) {
                    return;
                  }
                  openDeleteDialog(row);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          )
        }))
      );
      if (latestStudentsRequestIdRef.current === requestId) {
        setError('');
      }
    } catch (apiError) {
      if (latestStudentsRequestIdRef.current === requestId) {
        setError(apiError.message);
      }
    } finally {
      if (latestStudentsRequestIdRef.current === requestId) {
        setLoadingStudents(false);
      }
    }
  }, [openDeleteDialog, router]);

  const loadClasses = useCallback(async () => {
    const response = await get('/classes', getToken(), {
      retryCount: 1,
      retryDelayMs: 200
    });
    const options = (response.data || []).map((item) => ({
      value: item._id,
      label: item.section ? `${item.name} (${item.section})` : item.name
    }));
    setClassOptions(options);
  }, []);

  const onConfirmDeleteStudent = async () => {
    if (!deleteTarget) {
      return;
    }

    const expectedStudentId =
      deleteTarget.admissionNo && deleteTarget.admissionNo !== '-' ? deleteTarget.admissionNo : deleteTarget.userProfileId;

    if (!typedStudentId || typedStudentId.trim() !== expectedStudentId) {
      setError('Deletion cancelled. Student ID did not match.');
      return;
    }

    setDeletingId(deleteTarget.id);
    setMessage('');
    setError('');
    try {
      if (deleteTarget.isLinkedRecord && deleteTarget.profileId) {
        await del(`/students/${deleteTarget.profileId}`, getToken());
      } else {
        await del(`/students/by-user/${deleteTarget.userProfileId}`, getToken());
      }
      setMessage('Student deleted successfully.');
      setDeleteTarget(null);
      setTypedStudentId('');
      await loadStudents();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setDeletingId('');
    }
  };

  useEffect(() => {
    if (pathname === '/admin/students') {
      Promise.all([loadStudents(), loadClasses()]).catch((apiError) => setError(apiError.message));
    }
  }, [loadClasses, loadStudents, pathname]);

  useEffect(() => {
    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 1200) {
        return;
      }

      lastRefreshAtRef.current = now;
      loadStudents({ forceRefresh: true }).catch((apiError) => setError(apiError.message));
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && pathname === '/admin/students') {
        triggerRefresh();
      }
    };

    const refreshOnFocus = () => {
      if (pathname === '/admin/students') {
        triggerRefresh();
      }
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadStudents, pathname]);

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onStudentPhotoChange = (event) => {
    const nextFile = event.target.files?.[0] || null;

    if (studentPhotoPreview) {
      URL.revokeObjectURL(studentPhotoPreview);
    }

    setStudentPhotoFile(nextFile);
    setStudentPhotoPreview(nextFile ? URL.createObjectURL(nextFile) : '');
  };

  const onCreate = async (event) => {
    event.preventDefault();

    if (String(form.password || '') !== String(form.confirmPassword || '')) {
      setError('Password and confirm password must match.');
      setMessage('');
      return;
    }

    if (!EMAIL_REGEX.test(String(form.email || '').trim())) {
      setError('Please enter a valid email address.');
      setMessage('');
      return;
    }

    if (
      !form.classId ||
      String(form.rollNo || '').trim() === '' ||
      !form.gender ||
      !form.dob ||
      !String(form.guardianContact || '').trim() ||
      !String(form.address || '').trim() ||
      String(form.pendingFees || '').trim() === '' ||
      String(form.attendance || '').trim() === ''
    ) {
      setError('Please enter all student details before creating the account.');
      setMessage('');
      return;
    }

    const normalizedPendingFees = Number(form.pendingFees);
    const normalizedRollNo = Number(form.rollNo);
    const normalizedAttendance = Number(form.attendance);
    if (!Number.isInteger(normalizedRollNo) || normalizedRollNo <= 0) {
      setError('Roll number must be a positive whole number.');
      setMessage('');
      return;
    }

    if (!Number.isFinite(normalizedPendingFees) || normalizedPendingFees < 0) {
      setError('Pending fees must be 0 or greater.');
      setMessage('');
      return;
    }

    if (!Number.isFinite(normalizedAttendance) || normalizedAttendance < 0 || normalizedAttendance > 100) {
      setError('Attendance must be between 0 and 100.');
      setMessage('');
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const formData = new FormData();
      formData.append('name', String(form.name || '').trim());
      formData.append('email', String(form.email || '').trim());
      formData.append('password', form.password);
      formData.append('classId', form.classId);
      formData.append('rollNo', String(normalizedRollNo));
      formData.append('gender', form.gender);
      formData.append('dob', form.dob);
      formData.append('guardianContact', String(form.guardianContact || '').trim());
      formData.append('address', String(form.address || '').trim());
      formData.append('pendingFees', String(normalizedPendingFees));
      formData.append('attendance', String(normalizedAttendance));

      if (studentPhotoFile) {
        formData.append('studentPhoto', studentPhotoFile);
      }

      const response = await postForm('/students', formData, getToken(), { timeoutMs: 90000 });
      const generatedStudentId = String(response?.data?.admissionNo || '').trim();
      setMessage(
        generatedStudentId
          ? `Student account created successfully. Student ID: ${generatedStudentId}`
          : 'Student account created successfully'
      );
      setForm(getInitialStudentForm());

      if (studentPhotoPreview) {
        URL.revokeObjectURL(studentPhotoPreview);
      }
      setStudentPhotoFile(null);
      setStudentPhotoPreview('');
      await loadStudents();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const query = String(studentSearch || '').trim().toLowerCase();
    if (!query) {
      return rows;
    }

    const exactIdMatches = rows.filter((row) => String(row.admissionNo || '').toLowerCase() === query);
    if (exactIdMatches.length > 0) {
      return exactIdMatches;
    }

    return rows.filter((row) => String(row.name || '').toLowerCase().includes(query));
  }, [rows, studentSearch]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Students"
        description="View all registered students. Click any row to open full student profile and payment history."
      />
      <form onSubmit={onCreate} className="card-hover animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="mb-1 text-lg font-semibold text-slate-900">Register Student</h3>
        <p className="mb-2 text-sm text-slate-600">Admin must register each student one by one with all profile details.</p>
        <p className="mb-4 text-xs text-slate-500">Student ID is generated automatically after account creation.</p>
        <p className="mb-3 text-xs text-slate-500">Fields marked with <span className="font-semibold text-red-600">*</span> are mandatory.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label={requiredLabel('Name')} value={form.name} onChange={onChange('name')} required className="h-11" />
          <Input label={requiredLabel('Email')} type="email" value={form.email} onChange={onChange('email')} required className="h-11" />
          <Select
            label={requiredLabel('Class')}
            value={form.classId}
            onChange={onChange('classId')}
            required
            className="h-11"
            options={[{ value: '', label: classOptions.length > 0 ? 'Select Class' : 'No classes found' }, ...classOptions]}
          />
          <Input
            label={requiredLabel('Roll No')}
            type="number"
            min="1"
            step="1"
            value={form.rollNo}
            onChange={onChange('rollNo')}
            required
            className="h-11"
          />
          <Select
            label={requiredLabel('Gender')}
            value={form.gender}
            onChange={onChange('gender')}
            required
            className="h-11"
            options={genderOptions}
          />
          <Input label={requiredLabel('Date of Birth')} type="date" value={form.dob} onChange={onChange('dob')} required className="h-11" />
          <Input
            label={requiredLabel('Guardian Contact')}
            value={form.guardianContact}
            onChange={onChange('guardianContact')}
            required
            className="h-11"
          />
          <Input
            label={requiredLabel('Address')}
            value={form.address}
            onChange={onChange('address')}
            required
            className="h-11"
          />
          <Input
            label={requiredLabel('Pending Fees (INR)')}
            type="number"
            min="0"
            step="0.01"
            value={form.pendingFees}
            onChange={onChange('pendingFees')}
            required
            className="h-11"
          />
          <Input
            label={requiredLabel('Attendance (%)')}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.attendance}
            onChange={onChange('attendance')}
            required
            className="h-11"
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
            label={requiredLabel('Confirm Password')}
            type="password"
            value={form.confirmPassword}
            onChange={onChange('confirmPassword')}
            required
            className="h-11"
          />
        </div>

        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 text-sm font-medium text-slate-700">Student Picture (optional)</p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/heic,image/heif"
            onChange={onStudentPhotoChange}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">If no photo is uploaded, a default profile picture will be assigned.</p>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-full border border-slate-300 bg-white">
              <img
                src={studentPhotoPreview || '/default-student-avatar.svg'}
                alt="Student profile preview"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="text-xs text-slate-600">
              {studentPhotoFile ? `Selected: ${studentPhotoFile.name}` : 'Using default profile picture'}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create Student'}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Input
          label="Search Student (ID / Name)"
          value={studentSearch}
          onChange={(event) => setStudentSearch(event.target.value)}
          className="h-11"
          placeholder="Type exact Student ID or similar name"
        />
      </div>

      <Table
        columns={columns}
        rows={filteredRows}
        loading={loadingStudents}
        getRowHref={(row) => row.profileHref || ''}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Student Deletion</h3>
            <p className="mt-2 text-sm text-slate-600">
              Type Student ID <span className="font-semibold text-slate-900">{deleteTarget.admissionNo && deleteTarget.admissionNo !== '-' ? deleteTarget.admissionNo : deleteTarget.userProfileId}</span> to permanently delete {deleteTarget.name}.
            </p>

            <input
              type="text"
              value={typedStudentId}
              onChange={(event) => setTypedStudentId(event.target.value)}
              placeholder="Enter Student ID"
              className="mt-3 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setTypedStudentId('');
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDeleteStudent}
                disabled={
                  deletingId === deleteTarget.id ||
                  typedStudentId.trim() !==
                    (deleteTarget.admissionNo && deleteTarget.admissionNo !== '-' ? deleteTarget.admissionNo : deleteTarget.userProfileId)
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? 'Deleting...' : 'Delete Student'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}