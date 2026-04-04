'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import InfoCard from '@/components/InfoCard';
import Table from '@/components/Table';
import DetailsGrid from '@/components/DetailsGrid';
import { get, post, put } from '@/lib/api';
import { formatClassLabel, formatClassLabelList } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import Input from '@/components/Input';
import { useToast } from '@/lib/toast-context';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_REGEX = /^\d{7,15}$/;

const salaryColumns = [
  { key: 'month', label: 'Month' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
  { key: 'paidOn', label: 'Paid On' },
  { key: 'paymentMethod', label: 'Method' },
  { key: 'receiptNumber', label: 'Receipt Number' }
];

const getTeacherFormFromProfile = (teacher) => ({
  name: teacher?.userId?.name || '',
  email: teacher?.userId?.email || '',
  contactNumber: teacher?.contactNumber || '',
  classIds: (teacher?.classIds || []).map((item) => String(item?._id || item)).filter(Boolean),
  subjects: (teacher?.subjects || []).map((item) => String(item?._id || item)).filter(Boolean),
  password: ''
});

export default function TeacherProfilePage() {
  const params = useParams();
  const teacherId = params?.teacherId;
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [classOptions, setClassOptions] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [otherAssignedSubjectIds, setOtherAssignedSubjectIds] = useState([]);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    contactNumber: '',
    classIds: [],
    subjects: [],
    password: ''
  });
  const [paying, setPaying] = useState(false);
  const [form, setForm] = useState({ month: '', amount: '', paymentMethod: 'BANK_TRANSFER', pendingSalaryCleared: '' });

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

  const classNameMap = useMemo(
    () =>
      classOptions.reduce((acc, item) => {
        acc[item.id] = formatClassLabel(item, 'Class');
        return acc;
      }, {}),
    [classOptions]
  );

  const otherAssignedSubjectIdSet = useMemo(
    () => new Set(otherAssignedSubjectIds),
    [otherAssignedSubjectIds]
  );

  const availableSubjects = useMemo(
    () =>
      subjectOptions.filter(
        (subject) => editForm.classIds.includes(subject.classId)
      ),
    [editForm.classIds, editForm.subjects, otherAssignedSubjectIdSet, subjectOptions]
  );

  const availableSubjectsByClass = useMemo(
    () =>
      editForm.classIds
        .map((classId) => ({
          classId,
          className: classNameMap[classId] || 'Class',
          subjects: availableSubjects.filter((subject) => subject.classId === classId)
        }))
        .filter((item) => item.subjects.length > 0),
    [availableSubjects, classNameMap, editForm.classIds]
  );

  const loadProfile = async () => {
    if (!teacherId) {
      return;
    }
    const response = await get(`/teachers/${teacherId}/profile`, getToken());
    setProfile(response.data);
  };

  const loadClassAndSubjectOptions = async () => {
    const [classResponse, subjectResponse, teacherResponse] = await Promise.all([
      get('/classes', getToken()),
      get('/subjects', getToken()),
      get('/teachers', getToken())
    ]);

    setClassOptions(
      (classResponse.data || []).map((item) => ({
        id: String(item._id),
        name: item.name || 'Class',
        section: item.section || ''
      }))
    );

    setSubjectOptions(
      (subjectResponse.data || []).map((item) => ({
        id: String(item._id),
        classId: String(item.classId?._id || item.classId || ''),
        name: item.name,
        code: item.code
      }))
    );

    const currentTeacherId = String(teacherId || '');
    const assignedByOthers = Array.from(
      new Set(
        (teacherResponse.data || [])
          .filter((item) => String(item?._id || '') !== currentTeacherId)
          .flatMap((item) =>
            (item.subjects || [])
              .map((entry) => String(entry?._id || entry || '').trim())
              .filter(Boolean)
          )
      )
    );
    setOtherAssignedSubjectIds(assignedByOthers);
  };

  useEffect(() => {
    Promise.all([loadProfile(), loadClassAndSubjectOptions()]).catch((apiError) => setError(apiError.message));
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

  const onToggleEditClass = (classId) => {
    setEditForm((prev) => {
      const exists = prev.classIds.includes(classId);
      const nextClassIds = exists ? prev.classIds.filter((item) => item !== classId) : [...prev.classIds, classId];
      const allowedSubjectIds = new Set(
        subjectOptions
          .filter(
            (subject) =>
              nextClassIds.includes(subject.classId) &&
              (!otherAssignedSubjectIdSet.has(subject.id) || prev.subjects.includes(subject.id))
          )
          .map((subject) => subject.id)
      );

      return {
        ...prev,
        classIds: nextClassIds,
        subjects: prev.subjects.filter((subjectId) => allowedSubjectIds.has(subjectId))
      };
    });
  };

  const onToggleEditSubject = (subjectId) => {
    setEditForm((prev) => {
      const exists = prev.subjects.includes(subjectId);
      if (!exists && otherAssignedSubjectIdSet.has(subjectId)) {
        return prev;
      }

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
    if (!String(editForm.contactNumber || '').trim()) {
      missing.push('Contact Number');
    }
    if (editForm.classIds.length === 0) {
      missing.push('Classes');
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

    if (!CONTACT_REGEX.test(String(editForm.contactNumber || '').trim())) {
      setError('Contact number must contain only digits (7 to 15 digits).');
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
        contactNumber: String(editForm.contactNumber || '').trim(),
        classIds: editForm.classIds,
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

  if (!profile) {
    return <p className="text-sm text-slate-500">{error ? 'Unable to load teacher profile right now.' : 'Loading teacher profile...'}</p>;
  }

  const teacher = profile.teacher;
  const teacherDetailItems = [
    { label: 'Name', value: teacher?.userId?.name || '-' },
    { label: 'Email', value: teacher?.userId?.email || '-' },
    { label: 'Teacher ID', value: teacher?.teacherId || '-' },
    { label: 'Contact Number', value: teacher?.contactNumber || '-' },
    { label: 'Joining Date', value: teacher?.joiningDate ? new Date(teacher.joiningDate).toLocaleDateString() : '-' },
    {
      label: 'Classes',
      value: formatClassLabelList(teacher?.classIds || [])
    },
    {
      label: 'Subjects',
      value: (teacher?.subjects || []).map((item) => item?.name).filter(Boolean).join(', ') || '-'
    }
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title={teacher?.userId?.name || 'Teacher Profile'}
        description="Full teacher details, salary status, and salary history."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Teacher Details">
          {!editMode ? (
            <>
              <DetailsGrid items={teacherDetailItems} />
              <button
                type="button"
                onClick={() => {
                  setEditMode(true);
                  setError('');
                  setMessage('');
                }}
                className="mt-4 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Edit Teacher Details
              </button>
            </>
          ) : (
            <form onSubmit={onSaveEdit} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Name" value={editForm.name} onChange={onEditChange('name')} required className="h-10" />
                <Input label="Email" type="email" value={editForm.email} onChange={onEditChange('email')} required className="h-10" />
                <Input
                  label="Contact Number"
                  value={editForm.contactNumber}
                  onChange={onEditChange('contactNumber')}
                  required
                  className="h-10"
                  placeholder="Digits only"
                />
                <Input
                  label="Set New Password (optional)"
                  type="password"
                  value={editForm.password}
                  onChange={onEditChange('password')}
                  className="h-10"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">Classes</p>
                {classOptions.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">No classes found. Add classes first.</p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {classOptions.map((classOption) => (
                      <label key={classOption.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editForm.classIds.includes(classOption.id)}
                          onChange={() => onToggleEditClass(classOption.id)}
                          className="h-4 w-4"
                        />
                        <span>{formatClassLabel(classOption, 'Class')}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">Subjects</p>
                {editForm.classIds.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">Select at least one class first to view subjects.</p>
                ) : availableSubjects.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">No available subjects under selected classes. They may already be assigned to other teachers.</p>
                ) : (
                  <div className="mt-2 space-y-3">
                    <p className="text-xs text-slate-500">Subjects tagged as "Already assigned" are reserved for another teacher and cannot be selected.</p>
                    {availableSubjectsByClass.map((group) => (
                      <div key={group.classId}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.className}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {group.subjects.map((subject) => (
                            <label key={subject.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${otherAssignedSubjectIdSet.has(subject.id) && !editForm.subjects.includes(subject.id) ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                              <input
                                type="checkbox"
                                checked={editForm.subjects.includes(subject.id)}
                                onChange={() => onToggleEditSubject(subject.id)}
                                disabled={otherAssignedSubjectIdSet.has(subject.id) && !editForm.subjects.includes(subject.id)}
                                className="h-4 w-4"
                              />
                              <span className="flex items-center gap-2">
                                <span>
                                  {subject.name}
                                  {subject.code ? ` (${subject.code})` : ''}
                                </span>
                                {otherAssignedSubjectIdSet.has(subject.id) && !editForm.subjects.includes(subject.id) && (
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
          scrollY
          maxHeightClass="max-h-[340px]"
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
          <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {profile.receipts.map((receipt) => (
              <div key={receipt._id} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {receipt.receiptNumber} - INR {receipt.amount} - {new Date(receipt.paymentDate).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}