'use client';

import { useEffect, useMemo, useState } from 'react';
import Input from '@/components/Input';
import PageHeader from '@/components/PageHeader';
import { del, get, patch, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const NOTICE_TYPES = ['General', 'Payment'];
const RECIPIENT_ROLES = [
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' }
];

const getInitialForm = () => ({
  title: '',
  description: '',
  recipientRole: 'student',
  classIds: [],
  noticeType: 'General',
  amount: '',
  dueDate: '',
  isImportant: false,
  status: 'Active'
});

const toId = (value) => String(value?._id || value || '');
const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const toDateInputValue = (value) => {
  if (!value) {
    return '';
  }

  const asText = String(value);
  if (asText.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(asText)) {
    return asText.slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
};

const formatDateLabel = (value) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
};

const formatDateTimeLabel = (value) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleString('en-GB');
};

const normalizeNoticePaymentStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PAID') {
    return 'VERIFIED';
  }
  if (normalized === 'PENDING') {
    return 'PENDING_VERIFICATION';
  }
  if (['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(normalized)) {
    return normalized;
  }
  return String(status || '').trim();
};

export default function AdminNoticesPage() {
  const toast = useToast();
  const [form, setForm] = useState(getInitialForm());
  const [editingId, setEditingId] = useState('');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [pendingNoticePayments, setPendingNoticePayments] = useState([]);
  const [selectedNoticePayments, setSelectedNoticePayments] = useState([]);
  const [loadingSelectedNoticePayments, setLoadingSelectedNoticePayments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState('');
  const [verifyingPaymentId, setVerifyingPaymentId] = useState('');
  const [recordingCashPayment, setRecordingCashPayment] = useState(false);
  const [cashPaymentForm, setCashPaymentForm] = useState({
    noticeId: '',
    studentId: '',
    transactionReference: '',
    notes: ''
  });

  const paymentNoticeOptions = useMemo(
    () => notices.filter(
      (item) =>
        String(item?.noticeType || '') === 'Payment' &&
        String(item?.status || '') === 'Active' &&
        String(item?.recipientRole || 'student') === 'student'
    ),
    [notices]
  );

  const studentOptions = useMemo(
    () => students.filter((item) => item?.isLinkedRecord && isMongoId(toId(item))),
    [students]
  );

  const selectedCashNotice = useMemo(
    () => paymentNoticeOptions.find((item) => toId(item) === cashPaymentForm.noticeId) || null,
    [cashPaymentForm.noticeId, paymentNoticeOptions]
  );

  const selectedNoticeClassIds = useMemo(() => {
    const ids = Array.isArray(selectedCashNotice?.classIds)
      ? selectedCashNotice.classIds.map((item) => toId(item)).filter(Boolean)
      : [];

    return Array.from(new Set(ids));
  }, [selectedCashNotice]);

  const paidStudentIdsForSelectedNotice = useMemo(() => {
    const paidStudentIds = new Set();
    selectedNoticePayments.forEach((item) => {
      const normalizedStatus = normalizeNoticePaymentStatus(item?.paymentStatus);
      if (normalizedStatus === 'VERIFIED') {
        paidStudentIds.add(toId(item?.studentId));
      }
    });

    return paidStudentIds;
  }, [selectedNoticePayments]);

  const scopedStudentOptions = useMemo(() => {
    if (!selectedCashNotice) {
      return [];
    }

    // Empty classIds means notice is published for all classes.
    if (selectedNoticeClassIds.length === 0) {
      return studentOptions.filter((item) => !paidStudentIdsForSelectedNotice.has(toId(item)));
    }

    const allowedClassIds = new Set(selectedNoticeClassIds);
    return studentOptions.filter((item) => {
      const classId = toId(item?.classId);
      const studentId = toId(item);
      return allowedClassIds.has(classId) && !paidStudentIdsForSelectedNotice.has(studentId);
    });
  }, [selectedCashNotice, selectedNoticeClassIds, studentOptions, paidStudentIdsForSelectedNotice]);

  const classLabelMap = useMemo(
    () => classes.reduce((acc, item) => {
      acc[toId(item)] = formatClassLabel(item, 'Class');
      return acc;
    }, {}),
    [classes]
  );

  const allClassesSelected = form.classIds.length === 0;

  const loadData = async () => {
    setLoading(true);

    try {
      const token = getToken();
      const [classResult, noticeResult, pendingPaymentResult, studentResult] = await Promise.allSettled([
        get('/classes', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/notices?page=1&limit=100', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/notices/payments/pending', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/students/admin/all', token, { forceRefresh: true, cacheTtlMs: 0 })
      ]);

      if (classResult.status === 'fulfilled') {
        setClasses(Array.isArray(classResult.value?.data) ? classResult.value.data : []);
      } else {
        toast.error(classResult.reason?.message || 'Failed to load classes');
      }

      if (noticeResult.status === 'fulfilled') {
        setNotices(Array.isArray(noticeResult.value?.data) ? noticeResult.value.data : []);
      } else {
        setNotices([]);
        toast.error(noticeResult.reason?.message || 'Failed to load notices');
      }

      if (pendingPaymentResult.status === 'fulfilled') {
        setPendingNoticePayments(Array.isArray(pendingPaymentResult.value?.data) ? pendingPaymentResult.value.data : []);
      } else {
        setPendingNoticePayments([]);
        toast.error(pendingPaymentResult.reason?.message || 'Failed to load pending notice payments');
      }

      if (studentResult.status === 'fulfilled') {
        setStudents(Array.isArray(studentResult.value?.data) ? studentResult.value.data : []);
      } else {
        setStudents([]);
        toast.error(studentResult.reason?.message || 'Failed to load students');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const noticeId = String(cashPaymentForm.noticeId || '').trim();
    if (!noticeId) {
      setSelectedNoticePayments([]);
      setLoadingSelectedNoticePayments(false);
      return;
    }

    let cancelled = false;

    const loadNoticePayments = async () => {
      setLoadingSelectedNoticePayments(true);
      try {
        const response = await get(`/notices/payments/by-notice?noticeId=${noticeId}`, getToken(), {
          forceRefresh: true,
          cacheTtlMs: 0
        });

        if (!cancelled) {
          setSelectedNoticePayments(Array.isArray(response?.data) ? response.data : []);
        }
      } catch (apiError) {
        if (!cancelled) {
          setSelectedNoticePayments([]);
          toast.error(apiError.message || 'Failed to load notice payment records');
        }
      } finally {
        if (!cancelled) {
          setLoadingSelectedNoticePayments(false);
        }
      }
    };

    loadNoticePayments();

    return () => {
      cancelled = true;
    };
  }, [cashPaymentForm.noticeId, toast]);

  useEffect(() => {
    const selectedStudentId = String(cashPaymentForm.studentId || '').trim();
    if (!selectedStudentId) {
      return;
    }

    const isStillValid = scopedStudentOptions.some((item) => toId(item) === selectedStudentId);
    if (!isStillValid) {
      setCashPaymentForm((prev) => ({
        ...prev,
        studentId: ''
      }));
    }
  }, [cashPaymentForm.studentId, scopedStudentOptions]);

  const resetForm = () => {
    setForm(getInitialForm());
    setEditingId('');
  };

  const onFieldChange = (field) => (event) => {
    const nextValue = event.target.type === 'checkbox'
      ? event.target.checked
      : event.target.value;

    setForm((prev) => {
      if (field === 'noticeType') {
        const nextType = String(nextValue || 'General');
        return {
          ...prev,
          noticeType: nextType,
          amount: nextType === 'Payment' ? prev.amount : '',
          dueDate: nextType === 'Payment' ? prev.dueDate : ''
        };
      }

      if (field === 'recipientRole') {
        const nextRecipientRole = String(nextValue || 'student');
        const enforceGeneralType = nextRecipientRole === 'teacher' && prev.noticeType === 'Payment';

        return {
          ...prev,
          recipientRole: nextRecipientRole,
          noticeType: enforceGeneralType ? 'General' : prev.noticeType,
          amount: enforceGeneralType ? '' : prev.amount,
          dueDate: enforceGeneralType ? '' : prev.dueDate
        };
      }

      return {
        ...prev,
        [field]: nextValue
      };
    });
  };

  const onToggleAllClasses = (event) => {
    const checked = Boolean(event.target.checked);

    setForm((prev) => ({
      ...prev,
      classIds: checked
        ? []
        : classes.length > 0
          ? [toId(classes[0])]
          : []
    }));
  };

  const onToggleClass = (classId) => {
    setForm((prev) => {
      const exists = prev.classIds.includes(classId);
      const nextClassIds = exists
        ? prev.classIds.filter((item) => item !== classId)
        : [...prev.classIds, classId];

      return {
        ...prev,
        classIds: nextClassIds
      };
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    const title = String(form.title || '').trim();
    const description = String(form.description || '').trim();
    const amount = Number(form.amount || 0);

    if (!title || !description) {
      toast.error('Title and description are required');
      return;
    }

    if (form.noticeType === 'Payment' && (!Number.isFinite(amount) || amount <= 0)) {
      toast.error('Amount is required for payment notices');
      return;
    }

    if (form.recipientRole === 'teacher' && form.noticeType === 'Payment') {
      toast.error('Payment notices can only be issued to students');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        title,
        description,
        recipientRole: form.recipientRole,
        classIds: form.classIds,
        noticeType: form.noticeType,
        amount: form.noticeType === 'Payment' ? amount : undefined,
        dueDate: form.noticeType === 'Payment' && form.dueDate ? form.dueDate : undefined,
        isImportant: Boolean(form.isImportant),
        status: editingId ? form.status : undefined
      };

      if (editingId) {
        await put(`/notices/${editingId}`, payload, getToken());
      } else {
        await post('/notices', payload, getToken());
      }

      toast.success(editingId ? 'Notice updated successfully' : 'Notice created successfully');
      resetForm();
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to save notice');
    } finally {
      setSaving(false);
    }
  };

  const onEditNotice = (notice) => {
    const nextRecipientRole = String(notice?.recipientRole || 'student');
    const nextNoticeType = String(notice?.noticeType || 'General');

    setEditingId(toId(notice));
    setForm({
      title: String(notice?.title || ''),
      description: String(notice?.description || ''),
      recipientRole: nextRecipientRole,
      classIds: Array.isArray(notice?.classIds)
        ? notice.classIds.map((item) => toId(item)).filter(Boolean)
        : [],
      noticeType: nextRecipientRole === 'teacher' && nextNoticeType === 'Payment' ? 'General' : nextNoticeType,
      amount: notice?.amount !== undefined && notice?.amount !== null ? String(notice.amount) : '',
      dueDate: toDateInputValue(notice?.dueDate),
      isImportant: Boolean(notice?.isImportant),
      status: String(notice?.status || 'Active')
    });
  };

  const onDeleteNotice = async (notice) => {
    const noticeId = toId(notice);
    if (!noticeId) {
      return;
    }

    const confirmed = window.confirm('Delete this notice?');
    if (!confirmed) {
      return;
    }

    setProcessingId(noticeId);
    try {
      await del(`/notices/${noticeId}`, getToken());
      toast.success('Notice deleted successfully');

      if (editingId === noticeId) {
        resetForm();
      }

      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to delete notice');
    } finally {
      setProcessingId('');
    }
  };

  const onExpireNotice = async (notice) => {
    const noticeId = toId(notice);
    if (!noticeId) {
      return;
    }

    setProcessingId(noticeId);
    try {
      await patch(`/notices/expire/${noticeId}`, {}, getToken());
      toast.success('Notice marked as expired');

      if (editingId === noticeId) {
        setForm((prev) => ({ ...prev, status: 'Expired' }));
      }

      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to expire notice');
    } finally {
      setProcessingId('');
    }
  };

  const onPublishNotice = async (notice) => {
    const noticeId = toId(notice);
    if (!noticeId) {
      return;
    }

    setProcessingId(noticeId);
    try {
      await put(`/notices/${noticeId}`, { status: 'Active' }, getToken());
      toast.success('Notice published successfully');

      if (editingId === noticeId) {
        setForm((prev) => ({ ...prev, status: 'Active' }));
      }

      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to publish notice');
    } finally {
      setProcessingId('');
    }
  };

  const onVerifyNoticePayment = async (paymentId, decision) => {
    if (!paymentId) {
      return;
    }

    const notes = decision === 'REJECT'
      ? window.prompt('Optional reason for rejection:', '') || ''
      : '';

    setVerifyingPaymentId(paymentId);
    try {
      await post(`/notices/payments/${paymentId}/verify`, {
        decision,
        notes: String(notes).trim()
      }, getToken());

      toast.success(decision === 'APPROVE' ? 'Notice payment verified' : 'Notice payment rejected');
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to update notice payment verification');
    } finally {
      setVerifyingPaymentId('');
    }
  };

  const onCashPaymentFieldChange = (field) => (event) => {
    const nextValue = String(event.target.value || '');
    setCashPaymentForm((prev) => ({
      ...prev,
      [field]: nextValue,
      ...(field === 'noticeId' ? { studentId: '' } : {})
    }));
  };

  const resetCashPaymentForm = () => {
    setCashPaymentForm({
      noticeId: '',
      studentId: '',
      transactionReference: '',
      notes: ''
    });
  };

  const onRecordCashNoticePayment = async (event) => {
    event.preventDefault();

    const noticeId = String(cashPaymentForm.noticeId || '').trim();
    const studentId = String(cashPaymentForm.studentId || '').trim();
    if (!noticeId || !studentId) {
      toast.error('Select both notice and student');
      return;
    }

    const selectedNoticeAmount = Number(selectedCashNotice?.amount || 0);
    if (!Number.isFinite(selectedNoticeAmount) || selectedNoticeAmount <= 0) {
      toast.error('Selected notice amount is invalid');
      return;
    }

    setRecordingCashPayment(true);
    try {
      await post('/notices/payments/cash', {
        noticeId,
        studentId,
        amount: selectedNoticeAmount,
        transactionReference: String(cashPaymentForm.transactionReference || '').trim() || undefined,
        notes: String(cashPaymentForm.notes || '').trim() || undefined
      }, getToken());

      toast.success('Cash notice payment recorded successfully');
      resetCashPaymentForm();
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to record cash notice payment');
    } finally {
      setRecordingCashPayment(false);
    }
  };

  const getClassLabelForNotice = (notice) => {
    const ids = Array.isArray(notice?.classIds)
      ? notice.classIds.map((item) => toId(item)).filter(Boolean)
      : [];
    const isTeacherNotice = String(notice?.recipientRole || 'student') === 'teacher';

    if (ids.length === 0) {
      return isTeacherNotice ? 'All Teachers' : 'All Classes';
    }

    return ids.map((id) => classLabelMap[id] || 'Class').join(', ');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Notice Management"
        description="Create notices for students or teachers, mark important updates, and collect notice-specific payments."
      />

      <form onSubmit={onSubmit} className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm md:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="Title"
            value={form.title}
            onChange={onFieldChange('title')}
            required
            disabled={saving}
          />

          <div className="mb-3 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Notice Type</span>
            <select
              value={form.noticeType}
              onChange={onFieldChange('noticeType')}
              disabled={saving}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
            >
              {NOTICE_TYPES.map((item) => {
                const disabled = form.recipientRole === 'teacher' && item === 'Payment';
                return (
                  <option key={item} value={item} disabled={disabled}>
                    {disabled ? 'Payment (Students only)' : item}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="mb-3 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Audience</span>
            <select
              value={form.recipientRole}
              onChange={onFieldChange('recipientRole')}
              disabled={saving}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
            >
              {RECIPIENT_ROLES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Description</span>
          <textarea
            value={form.description}
            onChange={onFieldChange('description')}
            disabled={saving}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
            placeholder="Write a short notice description"
            required
          />
        </label>

        <div className="mb-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              {form.recipientRole === 'teacher' ? 'Target Teacher Classes' : 'Target Classes'}
            </p>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allClassesSelected}
                onChange={onToggleAllClasses}
                disabled={saving}
                className="h-4 w-4"
              />
              {form.recipientRole === 'teacher' ? 'All Teachers' : 'All Classes'}
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((classItem) => {
              const classId = toId(classItem);
              const checked = form.classIds.includes(classId);

              return (
                <label key={classId} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleClass(classId)}
                    disabled={saving}
                    className="h-4 w-4"
                  />
                  <span>{formatClassLabel(classItem, 'Class')}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {form.recipientRole === 'teacher'
              ? 'Leave class selection empty (All Teachers checked) to publish to every teacher.'
              : 'Leave class selection empty (All Classes checked) to publish to every class.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {form.noticeType === 'Payment' ? (
            <>
              <Input
                label="Amount"
                type="number"
                min="1"
                value={form.amount}
                onChange={onFieldChange('amount')}
                required
                disabled={saving}
              />
              <Input
                label="Due Date"
                type="date"
                value={form.dueDate}
                onChange={onFieldChange('dueDate')}
                disabled={saving}
              />
            </>
          ) : null}

          {editingId ? (
            <div className="mb-3 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Status</span>
              <select
                value={form.status}
                onChange={onFieldChange('status')}
                disabled={saving}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
              >
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 md:col-span-3">
              New notices are created as Active by default. Use the expire action later when needed.
            </div>
          )}
        </div>

        <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(form.isImportant)}
            onChange={onFieldChange('isImportant')}
            disabled={saving}
            className="h-4 w-4"
          />
          Mark as important notice
        </label>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? 'Saving...' : editingId ? 'Update Notice' : 'Create Notice'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Clear
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="border-b border-red-100 px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-slate-900">Published Notices</h2>
          <p className="text-xs text-slate-600">Review, edit, expire, publish, or delete notices.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-red-700 text-red-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Title</th>
                <th className="px-3 py-3 text-left font-semibold">Audience</th>
                <th className="px-3 py-3 text-left font-semibold">Type</th>
                <th className="px-3 py-3 text-left font-semibold">Classes</th>
                <th className="px-3 py-3 text-left font-semibold">Amount</th>
                <th className="px-3 py-3 text-left font-semibold">Due Date</th>
                <th className="px-3 py-3 text-left font-semibold">Important</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">Loading notices...</td>
                </tr>
              ) : notices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">No notices found.</td>
                </tr>
              ) : notices.map((notice, rowIndex) => {
                const noticeId = toId(notice);
                const isRowBusy = processingId === noticeId;
                const isActive = String(notice?.status || '') === 'Active';

                return (
                  <tr key={noticeId} className={rowIndex % 2 === 1 ? 'bg-red-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{notice?.title || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">{notice?.description || '-'}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {String(notice?.recipientRole || 'student') === 'teacher' ? 'Teachers' : 'Students'}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">{notice?.noticeType || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{getClassLabelForNotice(notice)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {notice?.noticeType === 'Payment' ? `INR ${notice?.amount || 0}` : '-'}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">{formatDateLabel(notice?.dueDate)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{notice?.isImportant ? 'Yes' : 'No'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{notice?.status || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => onEditNotice(notice)}
                          disabled={isRowBusy}
                          className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Edit
                        </button>

                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => onExpireNotice(notice)}
                            disabled={isRowBusy}
                            className="rounded bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Expire
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onPublishNotice(notice)}
                            disabled={isRowBusy}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Publish
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteNotice(notice)}
                          disabled={isRowBusy}
                          className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-white shadow-sm">
        <div className="border-b border-emerald-100 px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-slate-900">Record Notice Payment by Cash (Admin)</h2>
          <p className="text-xs text-slate-600">Use this when a student pays notice amount at the admin desk in cash.</p>
        </div>

        <form onSubmit={onRecordCashNoticePayment} className="space-y-3 px-4 py-4 md:px-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="mb-1 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Payment Notice</span>
              <select
                value={cashPaymentForm.noticeId}
                onChange={onCashPaymentFieldChange('noticeId')}
                disabled={loading || recordingCashPayment}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Select payment notice</option>
                {paymentNoticeOptions.map((notice) => (
                  <option key={toId(notice)} value={toId(notice)}>
                    {`${notice?.title || 'Payment Notice'} | INR ${Number(notice?.amount || 0)} | Due ${formatDateLabel(notice?.dueDate)}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-1 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Student</span>
              <select
                value={cashPaymentForm.studentId}
                onChange={onCashPaymentFieldChange('studentId')}
                disabled={loading || recordingCashPayment || loadingSelectedNoticePayments || !cashPaymentForm.noticeId}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
              >
                <option value="">
                  {!cashPaymentForm.noticeId
                    ? 'Select payment notice first'
                    : loadingSelectedNoticePayments
                      ? 'Loading students...'
                      : 'Select student'}
                </option>
                {scopedStudentOptions.map((student) => (
                  <option key={toId(student)} value={toId(student)}>
                    {`${student?.userId?.name || '-'} | ID ${student?.admissionNo || '-'} | ${formatClassLabel(student?.classId, 'Class')}`}
                  </option>
                ))}
                {cashPaymentForm.noticeId && !loadingSelectedNoticePayments && scopedStudentOptions.length === 0 ? (
                  <option value="" disabled>No students found for selected notice classes</option>
                ) : null}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Cash Reference (optional)"
              value={cashPaymentForm.transactionReference}
              onChange={onCashPaymentFieldChange('transactionReference')}
              disabled={loading || recordingCashPayment}
              placeholder="Receipt no / voucher no"
            />

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold text-slate-600">Selected Notice Amount</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedCashNotice ? `INR ${Number(selectedCashNotice?.amount || 0)}` : '-'}
              </p>
            </div>
          </div>

          <label className="mb-1 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Notes (optional)</span>
            <textarea
              value={cashPaymentForm.notes}
              onChange={onCashPaymentFieldChange('notes')}
              disabled={loading || recordingCashPayment}
              rows={2}
              placeholder="Optional note for this cash collection"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={loading || recordingCashPayment || loadingSelectedNoticePayments}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {recordingCashPayment ? 'Recording...' : 'Record Cash Payment'}
            </button>
            <button
              type="button"
              onClick={resetCashPaymentForm}
              disabled={loading || recordingCashPayment}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-amber-100 bg-white shadow-sm">
        <div className="border-b border-amber-100 px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-slate-900">Notice Payment Verification Queue</h2>
          <p className="text-xs text-slate-600">Approve or reject screenshots submitted for payment-related notices.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-amber-600 text-amber-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Notice</th>
                <th className="px-3 py-3 text-left font-semibold">Student</th>
                <th className="px-3 py-3 text-left font-semibold">Amount</th>
                <th className="px-3 py-3 text-left font-semibold">Submitted At</th>
                <th className="px-3 py-3 text-left font-semibold">Reference</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-left font-semibold">Screenshot</th>
                <th className="px-3 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">Loading payment submissions...</td>
                </tr>
              ) : pendingNoticePayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">No pending notice payments.</td>
                </tr>
              ) : pendingNoticePayments.map((payment, rowIndex) => {
                const paymentId = toId(payment);
                const isRowBusy = verifyingPaymentId === paymentId;
                const student = payment?.studentId || {};
                const studentUser = student?.userId || {};
                const classInfo = student?.classId || {};
                const status = normalizeNoticePaymentStatus(payment?.paymentStatus);
                const screenshotPath = String(payment?.screenshotPath || '').trim();

                return (
                  <tr key={paymentId} className={rowIndex % 2 === 1 ? 'bg-amber-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{payment?.noticeId?.title || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">Due: {formatDateLabel(payment?.noticeId?.dueDate)}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <p className="font-semibold text-slate-900">{studentUser?.name || '-'}</p>
                      <p className="mt-1 text-xs text-slate-600">ID: {student?.admissionNo || '-'} | Class: {formatClassLabel(classInfo, 'Class')}</p>
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">INR {Number(payment?.amount || 0)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{formatDateTimeLabel(payment?.paymentDate || payment?.createdAt)}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{payment?.transactionReference || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">{status || '-'}</td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {screenshotPath ? (
                        <a
                          href={screenshotPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-900"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">Not available</span>
                      )}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => onVerifyNoticePayment(paymentId, 'APPROVE')}
                          disabled={isRowBusy}
                          className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onVerifyNoticePayment(paymentId, 'REJECT')}
                          disabled={isRowBusy}
                          className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
