'use client';

import { useEffect, useMemo, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { del, get, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const classColumns = [
  { key: 'name', label: 'Class' },
  { key: 'section', label: 'Section' },
  { key: 'subjectCount', label: 'Subjects' },
  { key: 'teacherPerSubject', label: 'Teachers By Subject' }
];

const getInitialClassForm = () => ({
  name: '',
  section: ''
});

const getInitialSubjectForm = () => ({
  name: '',
  code: ''
});

const isClassDuplicateResponse = (apiError) => {
  const statusCode = Number(apiError?.statusCode || 0);
  if (statusCode === 409) {
    return true;
  }

  const normalizedMessage = String(apiError?.message || '').toLowerCase();
  const normalizedRawMessage = String(apiError?.rawMessage || '').toLowerCase();

  return (
    normalizedMessage.includes('same name and section') ||
    normalizedRawMessage.includes('same name and section') ||
    normalizedRawMessage.includes('duplicate key')
  );
};

const normalizeConfirmationLabel = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')');

const isConfirmationLabelMatch = (typedValue, expectedValue) =>
  normalizeConfirmationLabel(typedValue) === normalizeConfirmationLabel(expectedValue);

export default function AdminClassesPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [classesData, setClassesData] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [subjectRows, setSubjectRows] = useState([]);
  const [enrichingRows, setEnrichingRows] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classForm, setClassForm] = useState(getInitialClassForm());
  const [editClassId, setEditClassId] = useState('');
  const [editClassForm, setEditClassForm] = useState(getInitialClassForm());
  const [subjectForm, setSubjectForm] = useState(getInitialSubjectForm());
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editSubjectForm, setEditSubjectForm] = useState(getInitialSubjectForm());
  const [loading, setLoading] = useState(false);
  const [submittingClass, setSubmittingClass] = useState(false);
  const [savingClass, setSavingClass] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState('');
  const [deleteClassTarget, setDeleteClassTarget] = useState(null);
  const [typedClassLabel, setTypedClassLabel] = useState('');
  const [submittingSubject, setSubmittingSubject] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [deletingSubjectId, setDeletingSubjectId] = useState('');

  const buildClassRows = (classes, subjects, teacherNamesBySubjectId = {}) => {
    const subjectsByClass = subjects.reduce((acc, item) => {
      if (!item.classId) {
        return acc;
      }

      const key = String(item.classId);
      if (!acc[key]) {
        acc[key] = [];
      }

      acc[key].push(item);
      return acc;
    }, {});

    return classes.map((item) => {
      const classId = String(item._id);
      const classSubjects = subjectsByClass[classId] || [];

      return {
        id: classId,
        name: formatClassLabel(item),
        section: item.section || '-',
        subjectCount: String(classSubjects.length),
        teacherPerSubject: classSubjects.length === 0
          ? '-'
          : (
            <div className="space-y-1">
              {classSubjects.map((subject) => {
                const assignedTeacherNames = teacherNamesBySubjectId[subject.id] || [];
                return (
                  <p key={subject.id} className="text-xs text-slate-700">
                    {subject.name}: {assignedTeacherNames.length > 0 ? assignedTeacherNames.join(', ') : 'Not Assigned'}
                  </p>
                );
              })}
            </div>
          )
      };
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const classResponse = await get('/classes', token);
      const classes = classResponse.data || [];

      setClassesData(classes);

      // Render classes immediately; enrich subject/teacher counts in background.
      setRows(buildClassRows(classes, []));

      setClassOptions(
        classes.map((item) => ({
          value: String(item._id),
          label: formatClassLabel(item, 'Class')
        }))
      );
      setSubjectRows([]);

      const classIdSet = new Set(classes.map((item) => String(item._id)));
      setSelectedClassId((previous) => {
        if (previous && classIdSet.has(previous)) {
          return previous;
        }
        return classes[0]?._id ? String(classes[0]._id) : '';
      });

      setEnrichingRows(true);
      const [subjectResult, teacherResult] = await Promise.allSettled([
        get('/subjects', token),
        get('/teachers', token)
      ]);

      const subjects = subjectResult.status === 'fulfilled'
        ? (subjectResult.value.data || []).map((item) => ({
          id: String(item._id),
          classId: String(item.classId?._id || item.classId || ''),
          name: item.name || '-',
          code: item.code || ''
        }))
        : [];

      const teacherNamesBySubjectId = teacherResult.status === 'fulfilled'
        ? (teacherResult.value.data || []).reduce((acc, teacher) => {
          const teacherLabel = String(teacher?.userId?.name || teacher?.teacherId || '').trim();
          (teacher.subjects || [])
            .map((item) => String(item?._id || item || ''))
            .filter(Boolean)
            .forEach((subjectId) => {
              if (!acc[subjectId]) {
                acc[subjectId] = [];
              }

              if (teacherLabel && !acc[subjectId].includes(teacherLabel)) {
                acc[subjectId].push(teacherLabel);
              }
            });

          return acc;
        }, {})
        : {};

      setSubjectRows(subjects);
      setRows(buildClassRows(classes, subjects, teacherNamesBySubjectId));

      if (subjectResult.status === 'rejected' || teacherResult.status === 'rejected') {
        toast.info('Some class insights are delayed. Please refresh in a moment.');
      }
    } catch (apiError) {
      setRows([]);
      setClassesData([]);
      setClassOptions([]);
      setSubjectRows([]);
      setSelectedClassId('');
      toast.error(apiError.message);
    } finally {
      setLoading(false);
      setEnrichingRows(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedClassSubjects = useMemo(
    () => subjectRows.filter((item) => item.classId === selectedClassId),
    [subjectRows, selectedClassId]
  );

  const subjectCountByClassId = useMemo(
    () => subjectRows.reduce((acc, item) => {
      if (!item.classId) {
        return acc;
      }

      acc[item.classId] = (acc[item.classId] || 0) + 1;
      return acc;
    }, {}),
    [subjectRows]
  );

  const onClassFormChange = (field) => (event) => {
    setClassForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onEditClassFormChange = (field) => (event) => {
    setEditClassForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onSubjectFormChange = (field) => (event) => {
    setSubjectForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onEditSubjectFormChange = (field) => (event) => {
    setEditSubjectForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onStartEditClass = (classItem) => {
    setEditClassId(String(classItem?._id || ''));
    setEditClassForm({
      name: classItem?.name || '',
      section: classItem?.section || ''
    });
  };

  const onCancelEditClass = () => {
    setEditClassId('');
    setEditClassForm(getInitialClassForm());
  };

  const onSaveClass = async (classId) => {
    const normalizedName = String(editClassForm.name || '').trim();
    if (!normalizedName) {
      toast.error('Class name is required.');
      return;
    }

    setSavingClass(true);

    try {
      await put(
        `/classes/${classId}`,
        {
          name: normalizedName,
          section: String(editClassForm.section || '').trim() || undefined
        },
        getToken()
      );

      toast.success('Class updated successfully.');
      onCancelEditClass();
      await loadData();
    } catch (apiError) {
      if (isClassDuplicateResponse(apiError)) {
        toast.error('Class with the same name and section already exists. Try a different section.');
      } else {
        toast.error(apiError.message);
      }
    } finally {
      setSavingClass(false);
    }
  };

  const onDeleteClass = (classItem) => {
    setDeleteClassTarget(classItem);
    setTypedClassLabel('');
  };

  const onConfirmDeleteClass = async () => {
    if (!deleteClassTarget?._id) {
      return;
    }

    const expectedClassLabel = formatClassLabel(deleteClassTarget, 'Class');
    if (!isConfirmationLabelMatch(typedClassLabel, expectedClassLabel)) {
      toast.error('Deletion cancelled. Class name and section did not match.');
      return;
    }

    const classId = String(deleteClassTarget._id);
    setDeletingClassId(classId);

    try {
      await del(`/classes/${classId}`, getToken());
      toast.success('Class deleted successfully.');
      if (editClassId === classId) {
        onCancelEditClass();
      }
      setDeleteClassTarget(null);
      setTypedClassLabel('');
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setDeletingClassId('');
    }
  };

  const onCreateClass = async (event) => {
    event.preventDefault();
    const normalizedName = String(classForm.name || '').trim();
    if (!normalizedName) {
      toast.error('Class name is required.');
      return;
    }

    setSubmittingClass(true);

    try {
      await post(
        '/classes',
        {
          name: normalizedName,
          section: String(classForm.section || '').trim() || undefined
        },
        getToken()
      );

      setClassForm(getInitialClassForm());
      toast.success('Class added successfully.');
      await loadData();
    } catch (apiError) {
      if (isClassDuplicateResponse(apiError)) {
        toast.error('Class with the same name and section already exists. Try a different section.');
      } else {
        toast.error(apiError.message);
      }
    } finally {
      setSubmittingClass(false);
    }
  };

  const onCreateSubject = async (event) => {
    event.preventDefault();
    if (!selectedClassId) {
      toast.error('Create at least one class before adding subjects.');
      return;
    }

    const normalizedName = String(subjectForm.name || '').trim();
    if (!normalizedName) {
      toast.error('Subject name is required.');
      return;
    }

    setSubmittingSubject(true);

    try {
      await post(
        '/subjects',
        {
          classId: selectedClassId,
          name: normalizedName,
          code: String(subjectForm.code || '').trim() || undefined
        },
        getToken()
      );
      setSubjectForm(getInitialSubjectForm());
      toast.success('Subject added successfully.');
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setSubmittingSubject(false);
    }
  };

  const onStartEditSubject = (subject) => {
    setEditSubjectId(subject.id);
    setEditSubjectForm({
      name: subject.name || '',
      code: subject.code || ''
    });
  };

  const onCancelEditSubject = () => {
    setEditSubjectId('');
    setEditSubjectForm(getInitialSubjectForm());
  };

  const onSaveSubject = async (subjectId) => {
    const normalizedName = String(editSubjectForm.name || '').trim();
    if (!normalizedName) {
      toast.error('Subject name is required.');
      return;
    }

    setSavingSubject(true);

    try {
      await put(
        `/subjects/${subjectId}`,
        {
          name: normalizedName,
          code: String(editSubjectForm.code || '').trim() || undefined
        },
        getToken()
      );
      toast.success('Subject updated successfully.');
      setEditSubjectId('');
      setEditSubjectForm(getInitialSubjectForm());
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setSavingSubject(false);
    }
  };

  const onDeleteSubject = async (subjectId) => {
    setDeletingSubjectId(subjectId);

    try {
      await del(`/subjects/${subjectId}`, getToken());
      toast.success('Subject deleted successfully.');
      if (editSubjectId === subjectId) {
        onCancelEditSubject();
      }
      await loadData();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setDeletingSubjectId('');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Classes & Subjects"
        description="Create classes and manage subjects under each class from one place."
      />

      <form onSubmit={onCreateClass} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Add Class</h3>
        <p className="mb-4 text-sm text-slate-600">Create classes first. Same class name is allowed across different sections.</p>

        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Class Name *" value={classForm.name} onChange={onClassFormChange('name')} required className="h-11" />
          <Input label="Section" value={classForm.section} onChange={onClassFormChange('section')} className="h-11" placeholder="A / B" />
        </div>

        <button
          type="submit"
          disabled={submittingClass}
          className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingClass ? 'Adding...' : 'Add Class'}
        </button>
      </form>

      <Table columns={classColumns} rows={rows} loading={loading} getRowHref={(row) => `/admin/classes/${row.id}`} />
      <p className="text-xs text-slate-500">Click any class row to view all students registered in that class.</p>
      {enrichingRows && !loading && (
        <p className="text-xs text-slate-500">Refreshing subject and teacher insights...</p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Edit Or Delete Classes</h3>
        <p className="mb-4 text-sm text-slate-600">Update class names/sections or delete classes that are no longer needed.</p>

        {classesData.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">No classes found yet.</p>
        ) : (
          <div className="space-y-2">
            {classesData.map((classItem) => {
              const classId = String(classItem._id);
              const isEditing = editClassId === classId;

              return (
                <div key={classId} className="rounded-lg border border-slate-200 bg-white p-3">
                  {isEditing ? (
                    <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
                      <Input
                        label="Class Name"
                        value={editClassForm.name}
                        onChange={onEditClassFormChange('name')}
                        className="h-10"
                      />
                      <Input
                        label="Section"
                        value={editClassForm.section}
                        onChange={onEditClassFormChange('section')}
                        className="h-10"
                        placeholder="A / B"
                      />
                      <button
                        type="button"
                        onClick={() => onSaveClass(classId)}
                        disabled={savingClass}
                        className="mt-7 h-10 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingClass ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={onCancelEditClass}
                        className="mt-7 h-10 rounded-md border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{formatClassLabel(classItem, 'Class')}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {subjectCountByClassId[classId] || 0} subjects
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onStartEditClass(classItem)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteClass(classItem)}
                          disabled={deletingClassId === classId}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingClassId === classId ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Manage Subjects By Class</h3>
        <p className="mb-4 text-sm text-slate-600">Each subject belongs to exactly one class. Duplicate subjects inside the same class are blocked.</p>

        {classOptions.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">No classes found. Add a class first to manage subjects.</p>
        ) : (
          <>
            <Select
              label="Select Class"
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value);
                setEditSubjectId('');
              }}
              options={classOptions}
              className="h-11"
            />

            <form onSubmit={onCreateSubject} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_1fr_auto]">
              <Input
                label="Subject Name *"
                value={subjectForm.name}
                onChange={onSubjectFormChange('name')}
                required
                className="h-11"
                placeholder="Mathematics"
              />
              <Input
                label="Subject Code"
                value={subjectForm.code}
                onChange={onSubjectFormChange('code')}
                className="h-11"
                placeholder="MATH"
              />
              <button
                type="submit"
                disabled={submittingSubject || !selectedClassId}
                className="mt-7 h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingSubject ? 'Adding...' : 'Add Subject'}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {selectedClassSubjects.length === 0 ? (
                <p className="text-sm text-slate-500">No subjects found for this class yet.</p>
              ) : (
                selectedClassSubjects.map((subject) => (
                  <div key={subject.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    {editSubjectId === subject.id ? (
                      <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
                        <Input
                          label="Subject Name"
                          value={editSubjectForm.name}
                          onChange={onEditSubjectFormChange('name')}
                          className="h-10"
                        />
                        <Input
                          label="Subject Code"
                          value={editSubjectForm.code}
                          onChange={onEditSubjectFormChange('code')}
                          className="h-10"
                        />
                        <button
                          type="button"
                          onClick={() => onSaveSubject(subject.id)}
                          disabled={savingSubject}
                          className="mt-7 h-10 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingSubject ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEditSubject}
                          className="mt-7 h-10 rounded-md border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">{subject.name}</span>
                          {subject.code ? ` (${subject.code})` : ''}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onStartEditSubject(subject)}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSubject(subject.id)}
                            disabled={deletingSubjectId === subject.id}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingSubjectId === subject.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {deleteClassTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Class Deletion</h3>
            <p className="mt-2 text-sm text-slate-600">
              Type class label{' '}
              <span className="font-semibold text-slate-900">{formatClassLabel(deleteClassTarget, 'Class')}</span>{' '}
              to permanently delete this class.
            </p>

            <input
              type="text"
              value={typedClassLabel}
              onChange={(event) => setTypedClassLabel(event.target.value)}
              placeholder="Enter class label"
              className="mt-3 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteClassTarget(null);
                  setTypedClassLabel('');
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDeleteClass}
                disabled={
                  deletingClassId === String(deleteClassTarget._id) ||
                  !isConfirmationLabelMatch(typedClassLabel, formatClassLabel(deleteClassTarget, 'Class'))
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingClassId === String(deleteClassTarget._id) ? 'Deleting...' : 'Delete Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}