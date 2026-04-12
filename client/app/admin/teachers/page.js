'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import { del, get, post } from '@/lib/api';
import { formatClassLabel, formatClassLabelList } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Administration',
    title: 'Teachers',
    description: 'Register teachers with class-wise subject assignment and open any row for full profile and salary records.',
    registerTitle: 'Register Teacher',
    labels: {
      name: 'Name',
      email: 'Email',
      contactNumber: 'Contact Number',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      qualifications: 'Qualifications',
      monthlySalary: 'Monthly Salary',
      pendingSalary: 'Pending Salary'
    },
    placeholders: {
      contactHints: 'Digits only',
      qualHints: 'e.g. B.Ed, M.Sc',
      salaryZero: '0',
      enterId: 'Enter Teacher ID'
    },
    classes: {
      title: 'Classes',
      empty: 'No classes found. You can register now and assign classes later.',
      defaultLabel: 'Class'
    },
    subjects: {
      title: 'Subjects',
      selectClassFirst: 'Select at least one class first to view subjects.',
      empty: 'No available subjects under selected classes. They may already be assigned to other teachers.',
      assignedHint: 'Subjects tagged as "Already assigned" are reserved and cannot be selected.',
      alreadyAssigned: 'Already assigned'
    },
    buttons: {
      create: 'Create Teacher',
      creating: 'Creating...',
      remove: 'Remove',
      cancel: 'Cancel',
      delete: 'Delete Teacher',
      deleting: 'Deleting...'
    },
    alerts: {
      passMismatch: 'Password and confirm password must match.',
      invalidEmail: 'Please enter a valid email address.',
      invalidContact: 'Contact number must contain only digits (7 to 15 digits).',
      qualReq: 'Qualifications are required.',
      salaryPositive: 'Monthly salary must be greater than zero.',
      salaryNonNegative: 'Pending salary must be 0 or greater.',
      createSuccess: 'Teacher account created successfully',
      deleteCancel: 'Deletion cancelled. Teacher ID did not match.',
      deleteSuccess: 'Teacher deleted successfully.'
    },
    delete: {
      title: 'Confirm Teacher Deletion',
      textPrefix: 'Type Teacher ID',
      textMid: 'to permanently delete'
    },
    columns: {
      teacherId: 'Teacher ID',
      name: 'Name',
      contact: 'Contact',
      classes: 'Classes',
      subjects: 'Subject Codes',
      email: 'Email',
      actions: 'Actions'
    }
  },
  bn: {
    eyebrow: 'প্রশাসন',
    title: 'শিক্ষকবৃন্দ',
    description: 'ক্লাস ভিত্তিক বিষয় অ্যাসাইনমেন্ট সহ শিক্ষকদের নিবন্ধন করুন এবং সম্পূর্ণ প্রোফাইল এবং বেতন রেকর্ডের জন্য যেকোনো সারি খুলুন।',
    registerTitle: 'শিক্ষক নিবন্ধন করুন',
    labels: {
      name: 'নাম',
      email: 'ইমেল',
      contactNumber: 'যোগাযোগ নম্বর',
      password: 'পাসওয়ার্ড',
      confirmPassword: 'পাসওয়ার্ড নিশ্চিত করুন',
      qualifications: 'যোগ্যতা',
      monthlySalary: 'মাসিক বেতন',
      pendingSalary: 'বকেয়া বেতন'
    },
    placeholders: {
      contactHints: 'শুধুমাত্র সংখ্যা',
      qualHints: 'যেমন: বি.এড, এম.এসসি',
      salaryZero: '০',
      enterId: 'শিক্ষক আইডি লিখুন'
    },
    classes: {
      title: 'ক্লাসসমূহ',
      empty: 'কোনো ক্লাস পাওয়া যায়নি। আপনি এখন নিবন্ধন করতে পারেন এবং পরে ক্লাস অ্যাসাইন করতে পারেন।',
      defaultLabel: 'ক্লাস'
    },
    subjects: {
      title: 'বিষয়সমূহ',
      selectClassFirst: 'বিষয়গুলো দেখতে প্রথমে অন্তত একটি ক্লাস নির্বাচন করুন।',
      empty: 'নির্বাচিত ক্লাসের অধীনে কোনো বিষয় উপলব্ধ নেই। সেগুলো ইতিমধ্যে অন্য শিক্ষকদের অ্যাসাইন করা হতে পারে।',
      assignedHint: '"ইতিমধ্যে অ্যাসাইন করা" হিসেবে চিহ্নিত বিষয়গুলো সংরক্ষিত এবং নির্বাচন করা যাবে না।',
      alreadyAssigned: 'ইতিমধ্যে অ্যাসাইন করা'
    },
    buttons: {
      create: 'শিক্ষক তৈরি করুন',
      creating: 'তৈরি হচ্ছে...',
      remove: 'সরান',
      cancel: 'বাতিল',
      delete: 'শিক্ষক মুছে ফেলুন',
      deleting: 'মুছে ফেলা হচ্ছে...'
    },
    alerts: {
      passMismatch: 'পাসওয়ার্ড এবং নিশ্চিত পাসওয়ার্ড মিলছে না।',
      invalidEmail: 'অনুগ্রহ করে একটি সঠিক ইমেল ঠিকানা লিখুন।',
      invalidContact: 'যোগাযোগ নম্বরে শুধুমাত্র সংখ্যা থাকতে হবে (৭ থেকে ১৫ টি সংখ্যা)।',
      qualReq: 'যোগ্যতা প্রয়োজন।',
      salaryPositive: 'মাসিক বেতন শূন্যের চেয়ে বেশি হতে হবে।',
      salaryNonNegative: 'বকেয়া বেতন ০ বা তার বেশি হতে হবে।',
      createSuccess: 'শিক্ষক অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে',
      deleteCancel: 'মুছে ফেলা বাতিল হয়েছে। শিক্ষক আইডি মেলেনি।',
      deleteSuccess: 'শিক্ষক সফলভাবে মুছে ফেলা হয়েছে।'
    },
    delete: {
      title: 'শিক্ষক মুছে ফেলার নিশ্চিতকরণ',
      textPrefix: 'শিক্ষক আইডি',
      textMid: 'স্থায়ীভাবে মুছতে টাইপ করুন'
    },
    columns: {
      teacherId: 'শিক্ষক আইডি',
      name: 'নাম',
      contact: 'যোগাযোগ',
      classes: 'ক্লাসসমূহ',
      subjects: 'বিষয় কোড',
      email: 'ইমেল',
      actions: 'অ্যাকশন'
    }
  }
};

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_REGEX = /^\d{7,15}$/;

// columns moved inside components for localization

const getInitialTeacherForm = () => ({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  contactNumber: '',
  qualifications: '',
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
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const columns = useMemo(() => [
    { key: 'teacherId', label: t.columns.teacherId },
    { key: 'name', label: t.columns.name },
    { key: 'contactNumber', label: t.columns.contact },
    { key: 'classes', label: t.columns.classes },
    { key: 'subjectCodes', label: t.columns.subjects },
    { key: 'email', label: t.columns.email },
    { key: 'actions', label: t.columns.actions }
  ], [t]);

  const toast = useToast();
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

  const classNameMap = useMemo(
    () =>
      classOptions.reduce((acc, item) => {
        acc[item.id] = formatClassLabel(item, t.classes.defaultLabel);
        return acc;
      }, {}),
    [classOptions, t.classes.defaultLabel]
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
          className: classNameMap[classId] || t.classes.defaultLabel,
          subjects: availableSubjects.filter((subject) => subject.classId === classId)
        }))
        .filter((item) => item.subjects.length > 0),
    [availableSubjects, classNameMap, form.classIds, t.classes.defaultLabel]
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
            classes: formatClassLabelList(item.classIds || []),
            subjectCodes:
              (item.subjects || []).map((subject) => subject?.code || subject?.name).filter(Boolean).join(', ') || '-',
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
                {t.buttons.remove}
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
      name: item.name || t.classes.defaultLabel,
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

    if (loading) {
      return;
    }

    if (String(form.password || '') !== String(form.confirmPassword || '')) {
      setError(t.alerts.passMismatch);
      setMessage('');
      return;
    }

    if (!EMAIL_REGEX.test(String(form.email || '').trim())) {
      setError(t.alerts.invalidEmail);
      setMessage('');
      return;
    }

    if (!CONTACT_REGEX.test(String(form.contactNumber || '').trim())) {
      setError(t.alerts.invalidContact);
      setMessage('');
      return;
    }

    if (!String(form.qualifications || '').trim()) {
      setError(t.alerts.qualReq);
      setMessage('');
      return;
    }

    const monthlySalaryValue = Number(form.monthlySalary);
    if (!Number.isFinite(monthlySalaryValue) || monthlySalaryValue <= 0) {
      setError(t.alerts.salaryPositive);
      setMessage('');
      return;
    }

    const pendingSalaryValue =
      form.pendingSalary === '' || form.pendingSalary === null || form.pendingSalary === undefined
        ? 0
        : Number(form.pendingSalary);
    if (!Number.isFinite(pendingSalaryValue) || pendingSalaryValue < 0) {
      setError(t.alerts.salaryNonNegative);
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
          qualifications: String(form.qualifications || '').trim(),
          monthlySalary: monthlySalaryValue,
          pendingSalary: pendingSalaryValue,
          classIds: form.classIds,
          subjects: form.subjects
        },
        getToken()
      );
      setMessage(t.alerts.createSuccess);
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
      setError(t.alerts.deleteCancel);
      return;
    }

    setDeletingId(deleteTarget.id);
    setMessage('');
    setError('');
    try {
      await del(`/teachers/${deleteTarget.id}`, getToken());
      setMessage(t.alerts.deleteSuccess);
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
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />
      <form onSubmit={onCreate} className="card-hover animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="mb-1 text-lg font-semibold text-slate-900">{t.registerTitle}</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label={requiredLabel(t.labels.name)} value={form.name} onChange={onChange('name')} required className="h-11" />
          <Input label={requiredLabel(t.labels.email)} type="email" value={form.email} onChange={onChange('email')} required className="h-11" />
          <Input
            label={requiredLabel(t.labels.contactNumber)}
            value={form.contactNumber}
            onChange={onChange('contactNumber')}
            required
            className="h-11"
            placeholder={t.placeholders.contactHints}
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
          <Input
            label={requiredLabel(t.labels.qualifications)}
            value={form.qualifications}
            onChange={onChange('qualifications')}
            required
            className="h-11"
            placeholder={t.placeholders.qualHints}
          />
          <Input
            label={requiredLabel(t.labels.monthlySalary)}
            type="number"
            value={form.monthlySalary}
            onChange={onChange('monthlySalary')}
            required
            className="h-11"
          />
          <Input
            label={t.labels.pendingSalary}
            type="number"
            value={form.pendingSalary}
            onChange={onChange('pendingSalary')}
            className="h-11"
            placeholder={t.placeholders.salaryZero}
          />
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">{t.classes.title}</p>
          {classOptions.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">{t.classes.empty}</p>
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
                  <span>{formatClassLabel(classOption, t.classes.defaultLabel)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">{t.subjects.title}</p>
          {form.classIds.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">{t.subjects.selectClassFirst}</p>
          ) : availableSubjects.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">{t.subjects.empty}</p>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-xs text-slate-500">{t.subjects.assignedHint}</p>
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
                              {t.subjects.alreadyAssigned}
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
          {loading ? t.buttons.creating : t.buttons.create}
        </button>
      </form>
      <Table
        columns={columns}
        rows={rows}
        loading={loadingTeachers}
        virtualize
        virtualizationThreshold={60}
        virtualHeight={420}
        getRowHref={(row) => `/admin/teachers/${row.id}`}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{t.delete.title}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {t.delete.textPrefix} <span className="font-semibold text-slate-900">{deleteTarget.teacherId || deleteTarget.id}</span> {t.delete.textMid}{' '}
              <span className="font-semibold text-slate-900">{deleteTarget.name}</span>.
            </p>

            <input
              type="text"
              value={typedTeacherId}
              onChange={(event) => setTypedTeacherId(event.target.value)}
              placeholder={t.placeholders.enterId}
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
                {t.buttons.cancel}
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
                {deletingId === deleteTarget.id ? t.buttons.deleting : t.buttons.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}