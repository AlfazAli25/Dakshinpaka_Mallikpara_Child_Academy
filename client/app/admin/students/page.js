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
const CROP_VIEW_SIZE = 288;
const MIN_CROP_ZOOM = 1;
const MAX_CROP_ZOOM = 3;

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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeStudentEmail = (value) => String(value || '').trim().toLowerCase();

const loadImageFromObjectUrl = (objectUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load selected image for cropping.'));
    image.src = objectUrl;
  });

const createCroppedProfilePhoto = async ({
  imageUrl,
  sourceFileName,
  sourceWidth,
  sourceHeight,
  zoom,
  offsetX,
  offsetY,
  viewSize = CROP_VIEW_SIZE
}) => {
  const image = await loadImageFromObjectUrl(imageUrl);
  const width = Number(sourceWidth || image.naturalWidth || image.width || 0);
  const height = Number(sourceHeight || image.naturalHeight || image.height || 0);

  if (!width || !height) {
    throw new Error('Unable to read image dimensions for cropping.');
  }

  const boundedZoom = clamp(Number(zoom) || MIN_CROP_ZOOM, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
  const baseScale = Math.max(viewSize / width, viewSize / height);
  const scaledWidth = width * baseScale * boundedZoom;
  const scaledHeight = height * baseScale * boundedZoom;

  const maxOffsetX = Math.max(0, (scaledWidth - viewSize) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - viewSize) / 2);
  const boundedOffsetX = clamp(Number(offsetX) || 0, -maxOffsetX, maxOffsetX);
  const boundedOffsetY = clamp(Number(offsetY) || 0, -maxOffsetY, maxOffsetY);

  const imageLeft = (viewSize - scaledWidth) / 2 + boundedOffsetX;
  const imageTop = (viewSize - scaledHeight) / 2 + boundedOffsetY;

  const cropSourceX = clamp((-imageLeft / scaledWidth) * width, 0, width - 1);
  const cropSourceY = clamp((-imageTop / scaledHeight) * height, 0, height - 1);
  const cropSourceWidth = clamp((viewSize / scaledWidth) * width, 1, width - cropSourceX);
  const cropSourceHeight = clamp((viewSize / scaledHeight) * height, 1, height - cropSourceY);

  const outputSize = 640;
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Image crop canvas is not available in this browser.');
  }

  context.drawImage(
    image,
    cropSourceX,
    cropSourceY,
    cropSourceWidth,
    cropSourceHeight,
    0,
    0,
    outputSize,
    outputSize
  );

  const croppedBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to generate cropped image.'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      0.92
    );
  });

  const baseFileName = String(sourceFileName || 'student-photo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .trim() || 'student-photo';

  return new File([croppedBlob], `${baseFileName}-cropped.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
};

export default function AdminStudentsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(getInitialStudentForm());
  const [studentPhotoFile, setStudentPhotoFile] = useState(null);
  const [studentPhotoPreview, setStudentPhotoPreview] = useState('');
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState('');
  const [cropSourceFileName, setCropSourceFileName] = useState('');
  const [cropImageMeta, setCropImageMeta] = useState({ width: 0, height: 0 });
  const [cropZoom, setCropZoom] = useState(MIN_CROP_ZOOM);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [applyingCrop, setApplyingCrop] = useState(false);
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

  useEffect(() => () => {
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }
  }, [cropSourceUrl]);

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

  const cropBounds = useMemo(() => {
    const sourceWidth = Number(cropImageMeta.width || 0);
    const sourceHeight = Number(cropImageMeta.height || 0);

    if (!sourceWidth || !sourceHeight) {
      return {
        displayWidth: 0,
        displayHeight: 0,
        maxOffsetX: 0,
        maxOffsetY: 0
      };
    }

    const baseScale = Math.max(CROP_VIEW_SIZE / sourceWidth, CROP_VIEW_SIZE / sourceHeight);
    const scaledWidth = sourceWidth * baseScale * cropZoom;
    const scaledHeight = sourceHeight * baseScale * cropZoom;

    return {
      displayWidth: scaledWidth,
      displayHeight: scaledHeight,
      maxOffsetX: Math.max(0, (scaledWidth - CROP_VIEW_SIZE) / 2),
      maxOffsetY: Math.max(0, (scaledHeight - CROP_VIEW_SIZE) / 2)
    };
  }, [cropImageMeta.height, cropImageMeta.width, cropZoom]);

  useEffect(() => {
    setCropOffsetX((prev) => clamp(prev, -cropBounds.maxOffsetX, cropBounds.maxOffsetX));
    setCropOffsetY((prev) => clamp(prev, -cropBounds.maxOffsetY, cropBounds.maxOffsetY));
  }, [cropBounds.maxOffsetX, cropBounds.maxOffsetY]);

  const resetCropEditor = useCallback(() => {
    setCropModalOpen(false);
    setCropSourceUrl('');
    setCropSourceFileName('');
    setCropImageMeta({ width: 0, height: 0 });
    setCropZoom(MIN_CROP_ZOOM);
    setCropOffsetX(0);
    setCropOffsetY(0);
  }, []);

  const onStudentPhotoChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    event.target.value = '';

    if (!nextFile) {
      return;
    }

    const sourceUrl = URL.createObjectURL(nextFile);

    loadImageFromObjectUrl(sourceUrl)
      .then((image) => {
        const width = Number(image.naturalWidth || image.width || 0);
        const height = Number(image.naturalHeight || image.height || 0);
        if (!width || !height) {
          throw new Error('Unable to read image dimensions for cropping.');
        }

        setCropSourceUrl(sourceUrl);
        setCropSourceFileName(nextFile.name || 'student-photo');
        setCropImageMeta({ width, height });
        setCropZoom(MIN_CROP_ZOOM);
        setCropOffsetX(0);
        setCropOffsetY(0);
        setCropModalOpen(true);
      })
      .catch((cropError) => {
        URL.revokeObjectURL(sourceUrl);
        setError(cropError.message || 'Failed to open crop tool for selected image.');
      });
  };

  const onApplyPhotoCrop = async () => {
    if (!cropSourceUrl) {
      return;
    }

    setApplyingCrop(true);
    setMessage('');

    try {
      const croppedFile = await createCroppedProfilePhoto({
        imageUrl: cropSourceUrl,
        sourceFileName: cropSourceFileName,
        sourceWidth: cropImageMeta.width,
        sourceHeight: cropImageMeta.height,
        zoom: cropZoom,
        offsetX: cropOffsetX,
        offsetY: cropOffsetY,
        viewSize: CROP_VIEW_SIZE
      });

      setStudentPhotoFile(croppedFile);
      setStudentPhotoPreview((previousPreview) => {
        if (previousPreview) {
          URL.revokeObjectURL(previousPreview);
        }

        return URL.createObjectURL(croppedFile);
      });

      setError('');
      resetCropEditor();
    } catch (cropError) {
      setError(cropError.message || 'Failed to crop selected image.');
    } finally {
      setApplyingCrop(false);
    }
  };

  const onCreate = async (event) => {
    event.preventDefault();

    if (String(form.password || '') !== String(form.confirmPassword || '')) {
      setError('Password and confirm password must match.');
      setMessage('');
      return;
    }

    const normalizedEmail = normalizeStudentEmail(form.email);

    if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
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

      if (normalizedEmail) {
        formData.append('email', normalizedEmail);
      }

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
      setForm((previousForm) => ({
        ...getInitialStudentForm(),
        classId: previousForm.classId,
        attendance: previousForm.attendance
      }));

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
        <p className="mb-2 text-xs text-blue-700">After each create, Class and Attendance are kept for the next student entry.</p>
        <p className="mb-3 text-xs text-slate-500">Fields marked with <span className="font-semibold text-red-600">*</span> are mandatory.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label={requiredLabel('Name')} value={form.name} onChange={onChange('name')} required className="h-11" />
          <Input label="Email (optional)" type="email" value={form.email} onChange={onChange('email')} className="h-11" />
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
          <p className="mt-1 text-xs text-slate-500">If no photo is uploaded, a default profile picture will be assigned. You can crop after selecting an image.</p>

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
          disabled={loading || applyingCrop}
          className="mt-2 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create Student'}
        </button>
      </form>

      {cropModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Crop Student Picture</h3>
            <p className="mt-1 text-sm text-slate-600">Adjust zoom and position, then apply crop before registration.</p>

            <div className="mt-4 grid gap-4 md:grid-cols-[320px,1fr]">
              <div className="flex flex-col items-center">
                <div className="relative h-[288px] w-[288px] overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
                  {cropSourceUrl ? (
                    <img
                      src={cropSourceUrl}
                      alt="Student crop preview"
                      draggable={false}
                      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                      style={{
                        width: `${cropBounds.displayWidth}px`,
                        height: `${cropBounds.displayHeight}px`,
                        transform: `translate(-50%, -50%) translate(${cropOffsetX}px, ${cropOffsetY}px)`
                      }}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 border-2 border-white/80" />
                </div>
                <p className="mt-2 text-xs text-slate-500">Square avatar crop preview</p>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Zoom</span>
                  <input
                    type="range"
                    min={MIN_CROP_ZOOM}
                    max={MAX_CROP_ZOOM}
                    step="0.01"
                    value={cropZoom}
                    onChange={(event) => setCropZoom(Number(event.target.value))}
                    className="w-full"
                  />
                  <span className="text-xs text-slate-500">{cropZoom.toFixed(2)}x</span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Horizontal Position</span>
                  <input
                    type="range"
                    min={-cropBounds.maxOffsetX}
                    max={cropBounds.maxOffsetX}
                    step="1"
                    value={cropOffsetX}
                    onChange={(event) => setCropOffsetX(Number(event.target.value))}
                    className="w-full"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Vertical Position</span>
                  <input
                    type="range"
                    min={-cropBounds.maxOffsetY}
                    max={cropBounds.maxOffsetY}
                    step="1"
                    value={cropOffsetY}
                    onChange={(event) => setCropOffsetY(Number(event.target.value))}
                    className="w-full"
                  />
                </label>

                <p className="text-xs text-slate-500">Tip: zoom in for a tighter face crop.</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetCropEditor}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onApplyPhotoCrop}
                disabled={applyingCrop}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {applyingCrop ? 'Applying...' : 'Apply Crop'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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