'use client';

import { useEffect, useMemo, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { del, get, post, put } from '@/lib/api';
import { getToken } from '@/lib/session';

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

export default function AdminClassesPage() {
  const [rows, setRows] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [subjectRows, setSubjectRows] = useState([]);
  const [enrichingRows, setEnrichingRows] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classForm, setClassForm] = useState(getInitialClassForm());
  const [subjectForm, setSubjectForm] = useState(getInitialSubjectForm());
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editSubjectForm, setEditSubjectForm] = useState(getInitialSubjectForm());
  const [loading, setLoading] = useState(false);
  const [submittingClass, setSubmittingClass] = useState(false);
  const [submittingSubject, setSubmittingSubject] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [deletingSubjectId, setDeletingSubjectId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const buildClassRows = (classes, subjects, teacherCountBySubjectId = {}) => {
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
        name: item.name || '-',
        section: item.section || '-',
        subjectCount: String(classSubjects.length),
        teacherPerSubject: classSubjects.length === 0
          ? '-'
          : (
            <div className="space-y-1">
              {classSubjects.map((subject) => {
                const teacherCount = Number(teacherCountBySubjectId[subject.id] || 0);
                return (
                  <p key={subject.id} className="text-xs text-slate-700">
                    {subject.name}: {teacherCount}
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

      // Render classes immediately; enrich subject/teacher counts in background.
      setRows(buildClassRows(classes, []));

      setClassOptions(
        classes.map((item) => ({
          value: String(item._id),
          label: `${item.name || 'Class'}${item.section ? ` (${item.section})` : ''}`
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

      setError('');

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

      const teacherCountBySubjectId = teacherResult.status === 'fulfilled'
        ? (teacherResult.value.data || []).reduce((acc, teacher) => {
          (teacher.subjects || [])
            .map((item) => String(item?._id || item || ''))
            .filter(Boolean)
            .forEach((subjectId) => {
              acc[subjectId] = (acc[subjectId] || 0) + 1;
            });

          return acc;
        }, {})
        : {};

      setSubjectRows(subjects);
      setRows(buildClassRows(classes, subjects, teacherCountBySubjectId));

      if (subjectResult.status === 'rejected' || teacherResult.status === 'rejected') {
        setError('Some class insights are delayed. Please refresh in a moment.');
      }
    } catch (apiError) {
      setRows([]);
      setClassOptions([]);
      setSubjectRows([]);
      setSelectedClassId('');
      setError(apiError.message);
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

  const onClassFormChange = (field) => (event) => {
    setClassForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onSubjectFormChange = (field) => (event) => {
    setSubjectForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onEditSubjectFormChange = (field) => (event) => {
    setEditSubjectForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onCreateClass = async (event) => {
    event.preventDefault();
    const normalizedName = String(classForm.name || '').trim();
    if (!normalizedName) {
      setError('Class name is required.');
      setMessage('');
      return;
    }

    setSubmittingClass(true);
    setMessage('');
    setError('');

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
      setMessage('Class added successfully.');
      await loadData();
    } catch (apiError) {
      if (
        String(apiError.message || '').toLowerCase().includes('duplicate key') ||
        String(apiError.message || '').toLowerCase().includes('same name and section')
      ) {
        setError('Class with the same name and section already exists. Try a different section.');
      } else {
        setError(apiError.message);
      }
    } finally {
      setSubmittingClass(false);
    }
  };

  const onCreateSubject = async (event) => {
    event.preventDefault();
    if (!selectedClassId) {
      setError('Create at least one class before adding subjects.');
      setMessage('');
      return;
    }

    const normalizedName = String(subjectForm.name || '').trim();
    if (!normalizedName) {
      setError('Subject name is required.');
      setMessage('');
      return;
    }

    setSubmittingSubject(true);
    setMessage('');
    setError('');

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
      setMessage('Subject added successfully.');
      await loadData();
    } catch (apiError) {
      setError(apiError.message);
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
    setMessage('');
    setError('');
  };

  const onCancelEditSubject = () => {
    setEditSubjectId('');
    setEditSubjectForm(getInitialSubjectForm());
  };

  const onSaveSubject = async (subjectId) => {
    const normalizedName = String(editSubjectForm.name || '').trim();
    if (!normalizedName) {
      setError('Subject name is required.');
      return;
    }

    setSavingSubject(true);
    setMessage('');
    setError('');

    try {
      await put(
        `/subjects/${subjectId}`,
        {
          name: normalizedName,
          code: String(editSubjectForm.code || '').trim() || undefined
        },
        getToken()
      );
      setMessage('Subject updated successfully.');
      setEditSubjectId('');
      setEditSubjectForm(getInitialSubjectForm());
      await loadData();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSavingSubject(false);
    }
  };

  const onDeleteSubject = async (subjectId) => {
    setDeletingSubjectId(subjectId);
    setMessage('');
    setError('');

    try {
      await del(`/subjects/${subjectId}`, getToken());
      setMessage('Subject deleted successfully.');
      if (editSubjectId === subjectId) {
        onCancelEditSubject();
      }
      await loadData();
    } catch (apiError) {
      setError(apiError.message);
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
        {message && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

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

      <Table columns={classColumns} rows={rows} loading={loading} />
      {enrichingRows && !loading && (
        <p className="text-xs text-slate-500">Refreshing subject and teacher insights...</p>
      )}

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
    </div>
  );
}