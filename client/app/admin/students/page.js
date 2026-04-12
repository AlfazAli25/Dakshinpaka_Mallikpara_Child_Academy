'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { del, get, postForm } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Administration',
    title: 'Students',
    description: 'View all registered students. Click any row to open full student profile and payment history.',
    registerTitle: 'Register Student',
    labels: {
      name: 'Name',
      email: 'Email (optional)',
      class: 'Class',
      section: 'Section',
      rollNo: 'Roll No',
      gender: 'Gender',
      dob: 'Date of Birth',
      guardianContact: 'Guardian Contact',
      address: 'Address',
      pendingFees: 'Pending Fees (INR)',
      attendance: 'Attendance (%)',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      picture: 'Student Picture (optional)',
      pictureHint: 'If no photo is uploaded, a default profile picture will be assigned. You can crop after selecting an image.',
      pictureSelected: 'Selected',
      pictureDefault: 'Using default profile picture'
    },
    placeholders: {
      selectGender: 'Select Gender',
      male: 'Male',
      female: 'Female',
      other: 'Other',
      selectClass: 'Select Class',
      noClasses: 'No classes found',
      selectClassFirst: 'Select Class First',
      selectSection: 'Select Section',
      noSection: 'No Section Required',
      search: 'Search Student (ID / Name)',
      searchPlaceholder: 'Type exact Student ID or similar name',
      enterId: 'Enter Student ID'
    },
    buttons: {
      create: 'Create Student',
      creating: 'Creating...',
      edit: 'Edit',
      remove: 'Remove',
      cancel: 'Cancel',
      applyCrop: 'Apply Crop',
      applying: 'Applying...',
      delete: 'Delete Student',
      deleting: 'Deleting...'
    },
    alerts: {
      passMismatch: 'Password and confirm password must match.',
      reqFields: 'Name, guardian contact, password, and confirm password are required.',
      invalidEmail: 'Please enter a valid email address.',
      rollPositive: 'Roll number must be a positive whole number.',
      feesNonNegative: 'Pending fees must be 0 or greater.',
      attendanceRange: 'Attendance must be between 0 and 100.',
      classUnavailable: 'Selected class is not available. Please reload and try again.',
      sectionReq: 'Please select a section for the selected class.',
      invalidCombo: 'Selected class and section combination is invalid.',
      createSuccess: 'Student account created successfully.',
      idSuffix: 'Student ID',
      deleteSuccess: 'Student deleted successfully.',
      deleteCancel: 'Deletion cancelled. Student ID did not match.',
      imgDimError: 'Unable to read image dimensions for cropping.',
      cropFail: 'Failed to crop selected image.',
      canvasError: 'Image crop canvas is not available in this browser.',
      blobError: 'Failed to generate cropped image.',
      loadImgError: 'Failed to load selected image for cropping.'
    },
    crop: {
      title: 'Crop Student Picture',
      subtitle: 'Adjust zoom and position, then apply crop before registration.',
      zoom: 'Zoom',
      posX: 'Horizontal Position',
      posY: 'Vertical Position',
      preview: 'Square avatar crop preview',
      tip: 'Tip: zoom in for a tighter face crop.'
    },
    delete: {
      title: 'Confirm Student Deletion',
      textPrefix: 'Type Student ID',
      textMid: 'to permanently delete'
    },
    columns: {
      id: 'Student ID',
      roll: 'Roll No',
      name: 'Name',
      class: 'Class',
      section: 'Section',
      contact: 'Guardian Contact',
      actions: 'Actions'
    }
  },
  bn: {
    eyebrow: 'প্রশাসন',
    title: 'শিক্ষার্থীরা',
    description: 'সমস্ত নিবন্ধিত শিক্ষার্থীদের দেখুন। পূর্ণ শিক্ষার্থী প্রোফাইল এবং পেমেন্ট ইতিহাস খুলতে যেকোনো সারিতে ক্লিক করুন।',
    registerTitle: 'শিক্ষার্থী নিবন্ধন করুন',
    labels: {
      name: 'নাম',
      email: 'ইমেল (ঐচ্ছিক)',
      class: 'ক্লাস',
      section: 'সেকশন',
      rollNo: 'রোল নম্বর',
      gender: 'লিঙ্গ',
      dob: 'জন্ম তারিখ',
      guardianContact: 'অভিভাবকের যোগাযোগ',
      address: 'ঠিকানা',
      pendingFees: 'বকেয়া ফি (টাকা)',
      attendance: 'উপস্থিতি (%)',
      password: 'পাসওয়ার্ড',
      confirmPassword: 'পাসওয়ার্ড নিশ্চিত করুন',
      picture: 'শিক্ষার্থীর ছবি (ঐচ্ছিক)',
      pictureHint: 'যদি কোনো ছবি আপলোড না করা হয়, তবে একটি ডিফল্ট প্রোফাইল ছবি বরাদ্দ করা হবে। ছবি নির্বাচনের পরে আপনি ক্রপ করতে পারেন।',
      pictureSelected: 'নির্বাচিত',
      pictureDefault: 'ডিফল্ট প্রোফাইল ছবি ব্যবহার করা হচ্ছে'
    },
    placeholders: {
      selectGender: 'লিঙ্গ নির্বাচন করুন',
      male: 'পুরুষ',
      female: 'মহিলা',
      other: 'অন্যান্য',
      selectClass: 'ক্লাস নির্বাচন করুন',
      noClasses: 'কোনো ক্লাস পাওয়া যায়নি',
      selectClassFirst: 'প্রথমে ক্লাস নির্বাচন করুন',
      selectSection: 'সেকশন নির্বাচন করুন',
      noSection: 'কোনো সেকশন প্রয়োজন নেই',
      search: 'শিক্ষার্থী খুঁজুন (আইডি / নাম)',
      searchPlaceholder: 'সঠিক স্টুডেন্ট আইডি বা নাম টাইপ করুন',
      enterId: 'স্টুডেন্ট আইডি লিখুন'
    },
    buttons: {
      create: 'শিক্ষার্থী তৈরি করুন',
      creating: 'তৈরি হচ্ছে...',
      edit: 'সম্পাদনা',
      remove: 'সরান',
      cancel: 'বাতিল',
      applyCrop: 'ক্রপ প্রয়োগ করুন',
      applying: 'প্রয়োগ হচ্ছে...',
      delete: 'শিক্ষার্থী মুছুন',
      deleting: 'মুছে ফেলা হচ্ছে...'
    },
    alerts: {
      passMismatch: 'পাসওয়ার্ড এবং নিশ্চিত পাসওয়ার্ড মিলতে হবে।',
      reqFields: 'নাম, অভিভাবকের যোগাযোগ, পাসওয়ার্ড এবং নিশ্চিত পাসওয়ার্ড প্রয়োজন।',
      invalidEmail: 'অনুগ্রহ করে একটি সঠিক ইমেল ঠিকানা লিখুন।',
      rollPositive: 'রোল নম্বর অবশ্যই একটি ধনাত্মক পূর্ণসংখ্যা হতে হবে।',
      feesNonNegative: 'বকেয়া ফি অবশ্যই ০ বা তার বেশি হতে হবে।',
      attendanceRange: 'উপস্থিতি অবশ্যই ০ থেকে ১০০ এর মধ্যে হতে হবে।',
      classUnavailable: 'নির্বাচিত ক্লাসটি উপলব্ধ নেই। অনুগ্রহ করে রিলোড করে আবার চেষ্টা করুন।',
      sectionReq: 'নির্বাচিত ক্লাসের জন্য একটি সেকশন নির্বাচন করুন।',
      invalidCombo: 'নির্বাচিত ক্লাস এবং সেকশন সংমিশ্রণটি অবৈধ।',
      createSuccess: 'শিক্ষার্থীর অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে।',
      idSuffix: 'স্টুডেন্ট আইডি',
      deleteSuccess: 'শিক্ষার্থী সফলভাবে মুছে ফেলা হয়েছে।',
      deleteCancel: 'মুছে ফেলা বাতিল করা হয়েছে। স্টুডেন্ট আইডি মেলেনি।',
      imgDimError: 'ক্রপ করার জন্য ছবির মাত্রা পড়তে অক্ষম।',
      cropFail: 'নির্বাচিত ছবি ক্রপ করতে ব্যর্থ হয়েছে।',
      canvasError: 'এই ব্রাউজারে ছবি ক্রপ ক্যানভাস উপলব্ধ নেই।',
      blobError: 'ক্রপ করা ছবি তৈরি করতে ব্যর্থ হয়েছে।',
      loadImgError: 'ক্রপ করার জন্য নির্বাচিত ছবি লোড করতে ব্যর্থ হয়েছে।'
    },
    crop: {
      title: 'শিক্ষার্থীর ছবি ক্রপ করুন',
      subtitle: 'জুম এবং অবস্থান সামঞ্জস্য করুন, তারপর নিবন্ধনের আগে ক্রপ প্রয়োগ করুন।',
      zoom: 'জুম',
      posX: 'অনুভূমিক অবস্থান',
      posY: 'উলম্ব অবস্থান',
      preview: 'বর্গাকার প্রোফাইল ছবি ক্রপ প্রিভিউ',
      tip: 'পরামর্শ: মুখের আরও ভালো ক্রপের জন্য জুম ইন করুন।'
    },
    delete: {
      title: 'শিক্ষার্থী মুছে ফেলার নিশ্চিতকরণ',
      textPrefix: 'স্টুডেন্ট আইডি',
      textMid: 'টাইপ করুন স্থায়ীভাবে মুছতে'
    },
    columns: {
      id: 'স্টুডেন্ট আইডি',
      roll: 'রোল নং',
      name: 'নাম',
      class: 'ক্লাস',
      section: 'সেকশন',
      contact: 'অভিভাবকের যোগাযোগ',
      actions: 'অ্যাকশন'
    }
  }
};

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CROP_VIEW_SIZE = 288;
const MIN_CROP_ZOOM = 1;
const MAX_CROP_ZOOM = 3;

// columns and genderOptions moved inside component for localization

const getInitialStudentForm = () => ({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  className: '',
  section: '',
  rollNo: '',
  gender: '',
  dob: '',
  guardianContact: '',
  address: '',
  pendingFees: '',
  attendance: ''
});

// genderOptions moved inside component for localization

const requiredLabel = (label) => (
  <>
    {label} <span className="text-red-600">*</span>
  </>
);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeStudentEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeClassToken = (value) => String(value || '').trim().toLowerCase();
const normalizeSectionToken = (value) => String(value || '').trim().toUpperCase();

const loadImageFromObjectUrl = (objectUrl, errorMsg) =>
  new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMsg || 'Failed to load selected image for cropping.'));
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
  viewSize = CROP_VIEW_SIZE,
  alerts
}) => {
  const image = await loadImageFromObjectUrl(imageUrl, alerts.loadImgError);
  const width = Number(sourceWidth || image.naturalWidth || image.width || 0);
  const height = Number(sourceHeight || image.naturalHeight || image.height || 0);

  if (!width || !height) {
    throw new Error(alerts.imgDimError);
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
    throw new Error(alerts.canvasError);
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
          reject(new Error(alerts.blobError));
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
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const columns = useMemo(() => [
    { key: 'admissionNo', label: t.columns.id },
    { key: 'rollNo', label: t.columns.roll },
    { key: 'name', label: t.columns.name },
    { key: 'className', label: t.columns.class },
    { key: 'section', label: t.columns.section },
    { key: 'guardianContact', label: t.columns.contact },
    { key: 'actions', label: t.columns.actions }
  ], [t]);

  const genderOptions = useMemo(() => [
    { value: '', label: t.placeholders.selectGender },
    { value: 'MALE', label: t.placeholders.male },
    { value: 'FEMALE', label: t.placeholders.female },
    { value: 'OTHER', label: t.placeholders.other }
  ], [t]);

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
  const [classRecords, setClassRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [typedStudentId, setTypedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('');
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

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedStudentSearch(studentSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [studentSearch]);

  const openDeleteDialog = useCallback((row) => {
    setDeleteTarget(row);
    setTypedStudentId('');
    setMessage('');
    setError('');
  }, []);

  const classNameOptions = useMemo(() => {
    const uniqueClassNames = new Map();

    (Array.isArray(classRecords) ? classRecords : []).forEach((item) => {
      const className = String(item?.name || '').trim();
      if (!className) {
        return;
      }

      const token = normalizeClassToken(className);
      if (!token || uniqueClassNames.has(token)) {
        return;
      }

      uniqueClassNames.set(token, {
        value: className,
        label: className
      });
    });

    return Array.from(uniqueClassNames.values()).sort((left, right) =>
      String(left.label).localeCompare(String(right.label), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    );
  }, [classRecords]);

  const selectedClassRecords = useMemo(() => {
    const selectedClassToken = normalizeClassToken(form.className);
    if (!selectedClassToken) {
      return [];
    }

    return (Array.isArray(classRecords) ? classRecords : []).filter(
      (item) => normalizeClassToken(item?.name) === selectedClassToken
    );
  }, [classRecords, form.className]);

  const sectionOptions = useMemo(() => {
    const uniqueSections = new Map();

    selectedClassRecords.forEach((item) => {
      const sectionValue = String(item?.section || '').trim();
      if (!sectionValue) {
        return;
      }

      const token = normalizeSectionToken(sectionValue);
      if (!token || uniqueSections.has(token)) {
        return;
      }

      uniqueSections.set(token, {
        value: sectionValue,
        label: sectionValue
      });
    });

    return Array.from(uniqueSections.values()).sort((left, right) =>
      String(left.label).localeCompare(String(right.label), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    );
  }, [selectedClassRecords]);

  useEffect(() => {
    if (!form.className) {
      if (form.section) {
        setForm((prev) => ({ ...prev, section: '' }));
      }
      return;
    }

    if (sectionOptions.length === 0) {
      if (form.section) {
        setForm((prev) => ({ ...prev, section: '' }));
      }
      return;
    }

    if (sectionOptions.length === 1 && !form.section) {
      setForm((prev) => ({ ...prev, section: sectionOptions[0].value }));
      return;
    }

    const sectionExists = sectionOptions.some((item) => item.value === form.section);
    if (!sectionExists && form.section) {
      setForm((prev) => ({ ...prev, section: '' }));
    }
  }, [form.className, form.section, sectionOptions]);

  const loadStudents = useCallback(async ({ forceRefresh = false, searchTerm = '' } = {}) => {
    const requestId = latestStudentsRequestIdRef.current + 1;
    latestStudentsRequestIdRef.current = requestId;
    setLoadingStudents(true);
    const token = getToken();
    const normalizedSearch = String(searchTerm || '').trim();
    const studentListPath = normalizedSearch
      ? `/students/admin/all?search=${encodeURIComponent(normalizedSearch)}`
      : '/students/admin/all';

    try {
      const response = await get(studentListPath, token, {
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
        className: item.classId?.name || '-',
        section: item.classId?.section || '-',
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
                {t.buttons.edit}
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
                {t.buttons.remove}
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
    setClassRecords(Array.isArray(response.data) ? response.data : []);
  }, []);

  const onConfirmDeleteStudent = async () => {
    if (!deleteTarget) {
      return;
    }

    const expectedStudentId =
      deleteTarget.admissionNo && deleteTarget.admissionNo !== '-' ? deleteTarget.admissionNo : deleteTarget.userProfileId;

    if (!typedStudentId || typedStudentId.trim() !== expectedStudentId) {
      setError(t.alerts.deleteCancel);
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
      setMessage(t.alerts.deleteSuccess);
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
      loadClasses().catch((apiError) => setError(apiError.message));
    }
  }, [loadClasses, pathname]);

  useEffect(() => {
    if (pathname === '/admin/students') {
      loadStudents({ searchTerm: debouncedStudentSearch }).catch((apiError) => setError(apiError.message));
    }
  }, [debouncedStudentSearch, loadStudents, pathname]);

  useEffect(() => {
    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 1200) {
        return;
      }

      lastRefreshAtRef.current = now;
      loadStudents({ forceRefresh: true, searchTerm: debouncedStudentSearch }).catch((apiError) => setError(apiError.message));
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
  }, [debouncedStudentSearch, loadStudents, pathname]);

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onClassNameChange = (event) => {
    const nextClassName = String(event.target.value || '');
    setForm((prev) => ({
      ...prev,
      className: nextClassName,
      section: ''
    }));
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

    loadImageFromObjectUrl(sourceUrl, t.alerts.loadImgError)
      .then((image) => {
        const width = Number(image.naturalWidth || image.width || 0);
        const height = Number(image.naturalHeight || image.height || 0);
        if (!width || !height) {
          throw new Error(t.alerts.imgDimError);
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
        viewSize: CROP_VIEW_SIZE,
        alerts: t.alerts
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

    const normalizedName = String(form.name || '').trim();
    const normalizedGuardianContact = String(form.guardianContact || '').trim();
    const normalizedClassName = String(form.className || '').trim();
    const normalizedSection = String(form.section || '').trim();

    if (String(form.password || '') !== String(form.confirmPassword || '')) {
      setError(t.alerts.passMismatch);
      setMessage('');
      return;
    }

    if (!normalizedName || !normalizedGuardianContact || !String(form.password || '')) {
      setError(t.alerts.reqFields);
      setMessage('');
      return;
    }

    const normalizedEmail = normalizeStudentEmail(form.email);

    if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
      setError(t.alerts.invalidEmail);
      setMessage('');
      return;
    }

    const hasRollNo = String(form.rollNo || '').trim() !== '';
    const hasPendingFees = String(form.pendingFees || '').trim() !== '';
    const hasAttendance = String(form.attendance || '').trim() !== '';

    const normalizedRollNo = hasRollNo ? Number(form.rollNo) : null;
    if (hasRollNo && (!Number.isInteger(normalizedRollNo) || normalizedRollNo <= 0)) {
      setError(t.alerts.rollPositive);
      setMessage('');
      return;
    }

    const normalizedPendingFees = hasPendingFees ? Number(form.pendingFees) : null;
    if (hasPendingFees && (!Number.isFinite(normalizedPendingFees) || normalizedPendingFees < 0)) {
      setError(t.alerts.feesNonNegative);
      setMessage('');
      return;
    }

    const normalizedAttendance = hasAttendance ? Number(form.attendance) : null;
    if (hasAttendance && (!Number.isFinite(normalizedAttendance) || normalizedAttendance < 0 || normalizedAttendance > 100)) {
      setError(t.alerts.attendanceRange);
      setMessage('');
      return;
    }

    let selectedClassId = '';
    if (normalizedClassName) {
      const matchingClassRecords = (Array.isArray(classRecords) ? classRecords : []).filter(
        (item) => normalizeClassToken(item?.name) === normalizeClassToken(normalizedClassName)
      );

      if (matchingClassRecords.length === 0) {
        setError(t.alerts.classUnavailable);
        setMessage('');
        return;
      }

      const classHasSections = matchingClassRecords.some((item) => String(item?.section || '').trim());
      if (classHasSections && !normalizedSection) {
        setError(t.alerts.sectionReq);
        setMessage('');
        return;
      }

      const selectedClassRecord = classHasSections
        ? matchingClassRecords.find(
            (item) => normalizeSectionToken(item?.section) === normalizeSectionToken(normalizedSection)
          )
        : matchingClassRecords[0];

      if (!selectedClassRecord?._id) {
        setError(t.alerts.invalidCombo);
        setMessage('');
        return;
      }

      selectedClassId = String(selectedClassRecord._id);
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const formData = new FormData();
      formData.append('name', normalizedName);

      if (normalizedEmail) {
        formData.append('email', normalizedEmail);
      }

      formData.append('password', form.password);
      if (selectedClassId) {
        formData.append('classId', selectedClassId);
      }

      if (hasRollNo) {
        formData.append('rollNo', String(normalizedRollNo));
      }

      if (String(form.gender || '').trim()) {
        formData.append('gender', String(form.gender || '').trim());
      }

      if (String(form.dob || '').trim()) {
        formData.append('dob', String(form.dob || '').trim());
      }

      formData.append('guardianContact', normalizedGuardianContact);

      if (String(form.address || '').trim()) {
        formData.append('address', String(form.address || '').trim());
      }

      if (hasPendingFees) {
        formData.append('pendingFees', String(normalizedPendingFees));
      }

      if (hasAttendance) {
        formData.append('attendance', String(normalizedAttendance));
      }

      if (studentPhotoFile) {
        formData.append('studentPhoto', studentPhotoFile);
      }

      const response = await postForm('/students', formData, getToken(), { timeoutMs: 90000 });
      const generatedStudentId = String(response?.data?.admissionNo || '').trim();
      setMessage(
        generatedStudentId
          ? `${t.alerts.createSuccess} ${t.alerts.idSuffix}: ${generatedStudentId}`
          : t.alerts.createSuccess
      );
      setForm((previousForm) => ({
        ...getInitialStudentForm(),
        className: previousForm.className,
        section: previousForm.section,
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />
      <form onSubmit={onCreate} className="card-hover animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="mb-1 text-lg font-semibold text-slate-900">{t.registerTitle}</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label={requiredLabel(t.labels.name)} value={form.name} onChange={onChange('name')} required className="h-11" />
          <Input label={t.labels.email} type="email" value={form.email} onChange={onChange('email')} className="h-11" />
          <Select
            label={t.labels.class}
            value={form.className}
            onChange={onClassNameChange}
            className="h-11"
            options={[
              { value: '', label: classNameOptions.length > 0 ? t.placeholders.selectClass : t.placeholders.noClasses },
              ...classNameOptions
            ]}
          />
          <Select
            label={t.labels.section}
            value={form.section}
            onChange={onChange('section')}
            className="h-11"
            disabled={!form.className || sectionOptions.length === 0}
            options={[
              {
                value: '',
                label: !form.className
                  ? t.placeholders.selectClassFirst
                  : sectionOptions.length > 0
                    ? t.placeholders.selectSection
                    : t.placeholders.noSection
              },
              ...sectionOptions
            ]}
          />
          <Input
            label={t.labels.rollNo}
            type="number"
            min="1"
            step="1"
            value={form.rollNo}
            onChange={onChange('rollNo')}
            className="h-11"
          />
          <Select
            label={t.labels.gender}
            value={form.gender}
            onChange={onChange('gender')}
            className="h-11"
            options={genderOptions}
          />
          <Input label={t.labels.dob} type="date" value={form.dob} onChange={onChange('dob')} className="h-11" />
          <Input
            label={requiredLabel(t.labels.guardianContact)}
            value={form.guardianContact}
            onChange={onChange('guardianContact')}
            required
            className="h-11"
          />
          <Input
            label={t.labels.address}
            value={form.address}
            onChange={onChange('address')}
            className="h-11"
          />
          <Input
            label={t.labels.pendingFees}
            type="number"
            min="0"
            step="0.01"
            value={form.pendingFees}
            onChange={onChange('pendingFees')}
            className="h-11"
          />
          <Input
            label={t.labels.attendance}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.attendance}
            onChange={onChange('attendance')}
            className="h-11"
          />
          <Input
            label={requiredLabel(t.labels.password)}
            type="password"
            value={form.password}
            onChange={onChange('password')}
            required
            className="h-11"
          />
          <Input
            label={requiredLabel(t.labels.confirmPassword)}
            type="password"
            value={form.confirmPassword}
            onChange={onChange('confirmPassword')}
            required
            className="h-11"
          />
        </div>

        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 text-sm font-medium text-slate-700">{t.labels.picture}</p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/heic,image/heif"
            onChange={onStudentPhotoChange}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">{t.labels.pictureHint}</p>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-full border border-slate-300 bg-white">
              <img
                src={studentPhotoPreview || '/default-student-avatar.svg'}
                alt="Student profile preview"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="text-xs text-slate-600">
              {studentPhotoFile ? `${t.labels.pictureSelected}: ${studentPhotoFile.name}` : t.labels.pictureDefault}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || applyingCrop}
          className="mt-2 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? t.buttons.creating : t.buttons.create}
        </button>
      </form>

      {cropModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{t.crop.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{t.crop.subtitle}</p>

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
                <p className="mt-2 text-xs text-slate-500">{t.crop.preview}</p>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">{t.crop.zoom}</span>
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
                  <span className="mb-1 block text-sm font-medium text-slate-700">{t.crop.posX}</span>
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
                  <span className="mb-1 block text-sm font-medium text-slate-700">{t.crop.posY}</span>
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

                <p className="text-xs text-slate-500">{t.crop.tip}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetCropEditor}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t.buttons.cancel}
              </button>
              <button
                type="button"
                onClick={onApplyPhotoCrop}
                disabled={applyingCrop}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {applyingCrop ? t.buttons.applying : t.buttons.applyCrop}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Input
          label={t.placeholders.search}
          value={studentSearch}
          onChange={(event) => setStudentSearch(event.target.value)}
          className="h-11"
          placeholder={t.placeholders.searchPlaceholder}
        />
      </div>

      <Table
        columns={columns}
        rows={rows}
        loading={loadingStudents}
        virtualize
        virtualizationThreshold={80}
        virtualHeight={460}
        getRowHref={(row) => row.profileHref || ''}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{t.delete.title}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {t.delete.textPrefix} <span className="font-semibold text-slate-900">{deleteTarget.admissionNo && deleteTarget.admissionNo !== '-' ? deleteTarget.admissionNo : deleteTarget.userProfileId}</span> {t.delete.textMid} {deleteTarget.name}.
            </p>

            <input
              type="text"
              value={typedStudentId}
              onChange={(event) => setTypedStudentId(event.target.value)}
              placeholder={t.placeholders.enterId}
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
                {t.buttons.cancel}
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
                {deletingId === deleteTarget.id ? t.buttons.deleting : t.buttons.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}