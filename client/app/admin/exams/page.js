'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { del, get, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const EXAM_TYPES = ['Unit Test', 'Mid Term', 'Final', 'Practical', 'Assignment'];
const EXAM_STATUS = ['Scheduled', 'Ongoing', 'Completed'];
const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{4}$/;

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0
};

const DEFAULT_FORM = {
  examName: '',
  examType: 'Unit Test',
  classId: '',
  subjects: [],
  academicYear: '',
  startDate: '',
  endDate: '',
  description: '',
  status: 'Scheduled'
};

const toId = (value) => String(value?._id || value || '');

const toDateInputValue = (value) => {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateLabel = (value) => {
  const input = toDateInputValue(value);
  if (!input) {
    return '-';
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString();
};

const getSubjectIdsFromExam = (exam) => {
  const subjectIds = Array.isArray(exam?.subjects)
    ? exam.subjects.map((item) => toId(item)).filter(Boolean)
    : [];

  if (subjectIds.length > 0) {
    return subjectIds;
  }

  const legacySubjectId = toId(exam?.subjectId);
  return legacySubjectId ? [legacySubjectId] : [];
};

const columns = [
  { key: 'examName', label: 'Exam Name' },
  { key: 'examType', label: 'Exam Type' },
  { key: 'className', label: 'Class' },
  { key: 'academicYear', label: 'Academic Year' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'endDate', label: 'End Date' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' }
];

export default function AdminExamsPage() {
  const toast = useToast();

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingExams, setLoadingExams] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingExamId, setDeletingExamId] = useState('');

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingExamId, setEditingExamId] = useState('');

  const [search, setSearch] = useState('');
  const [filterClassId, setFilterClassId] = useState('');
  const [filterAcademicYear, setFilterAcademicYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [examRecords, setExamRecords] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const classOptions = useMemo(
    () =>
      classes.map((item) => ({
        value: toId(item),
        label: formatClassLabel(item)
      })),
    [classes]
  );

  const subjectsForSelectedClass = useMemo(
    () => subjects.filter((item) => toId(item?.classId) === form.classId),
    [subjects, form.classId]
  );

  const tableRows = useMemo(
    () =>
      examRecords.map((item) => ({
        id: toId(item),
        examName: item.examName || '-',
        examType: item.examType || '-',
        className: formatClassLabel(item.classId),
        academicYear: item.academicYear || '-',
        startDate: toDateLabel(item.startDate || item.date || item.examDate),
        endDate: toDateLabel(item.endDate),
        status: item.status || 'Scheduled',
        actions: (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStartEdit(item);
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteTarget(item);
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        )
      })),
    [examRecords]
  );

  const clearForm = () => {
    setForm(DEFAULT_FORM);
    setEditingExamId('');
  };

  const loadSetup = async () => {
    setLoadingSetup(true);
    try {
      const token = getToken();
      const [classesRes, subjectsRes] = await Promise.all([
        get('/classes', token),
        get('/subjects', token)
      ]);

      setClasses(Array.isArray(classesRes.data) ? classesRes.data : []);
      setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);
    } finally {
      setLoadingSetup(false);
    }
  };

  const loadExams = async (pageToLoad = pagination.page) => {
    setLoadingExams(true);

    try {
      const query = new URLSearchParams();
      query.set('page', String(pageToLoad));
      query.set('limit', String(pagination.limit));

      if (search.trim()) {
        query.set('search', search.trim());
      }
      if (filterClassId) {
        query.set('classId', filterClassId);
      }
      if (filterAcademicYear.trim()) {
        query.set('academicYear', filterAcademicYear.trim());
      }
      if (filterStatus) {
        query.set('status', filterStatus);
      }

      const response = await get(`/exams?${query.toString()}`, getToken());

      setExamRecords(Array.isArray(response.data) ? response.data : []);
      const nextPagination = response.pagination || {};
      setPagination((prev) => ({
        ...prev,
        page: Number(nextPagination.page || pageToLoad || 1),
        total: Number(nextPagination.total || 0),
        totalPages: Number(nextPagination.totalPages || 0)
      }));
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to load exams');
      setExamRecords([]);
    } finally {
      setLoadingExams(false);
    }
  };

  useEffect(() => {
    loadSetup().catch((apiError) => {
      toast.error(apiError.message || 'Failed to initialize exam management');
    });
  }, []);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [search, filterClassId, filterAcademicYear, filterStatus]);

  useEffect(() => {
    loadExams(pagination.page).catch((apiError) => {
      toast.error(apiError.message || 'Failed to load exams');
    });
  }, [pagination.page, search, filterClassId, filterAcademicYear, filterStatus]);

  useEffect(() => {
    if (!form.classId) {
      if (form.subjects.length > 0) {
        setForm((prev) => ({ ...prev, subjects: [] }));
      }
      return;
    }

    const allowedSubjectIdSet = new Set(
      subjects
        .filter((item) => toId(item?.classId) === form.classId)
        .map((item) => toId(item))
        .filter(Boolean)
    );

    const nextSubjects = form.subjects.filter((subjectId) => allowedSubjectIdSet.has(subjectId));
    if (nextSubjects.length !== form.subjects.length) {
      setForm((prev) => ({ ...prev, subjects: nextSubjects }));
    }
  }, [form.classId, form.subjects, subjects]);

  const onChangeForm = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const onToggleSubject = (subjectId) => {
    setForm((prev) => {
      const exists = prev.subjects.includes(subjectId);
      return {
        ...prev,
        subjects: exists
          ? prev.subjects.filter((item) => item !== subjectId)
          : [...prev.subjects, subjectId]
      };
    });
  };

  function onStartEdit(exam) {
    setEditingExamId(toId(exam));
    setForm({
      examName: String(exam?.examName || '').trim(),
      examType: String(exam?.examType || 'Unit Test').trim() || 'Unit Test',
      classId: toId(exam?.classId),
      subjects: getSubjectIdsFromExam(exam),
      academicYear: String(exam?.academicYear || '').trim(),
      startDate: toDateInputValue(exam?.startDate || exam?.date || exam?.examDate),
      endDate: toDateInputValue(exam?.endDate),
      description: String(exam?.description || '').trim(),
      status: String(exam?.status || 'Scheduled').trim() || 'Scheduled'
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const validateForm = () => {
    if (!form.examName.trim()) {
      return 'Exam name is required';
    }

    if (!form.classId) {
      return 'Class is required';
    }

    if (form.subjects.length === 0) {
      return 'Select at least one subject';
    }

    if (!form.academicYear.trim()) {
      return 'Academic year is required';
    }

    if (!ACADEMIC_YEAR_REGEX.test(form.academicYear.trim())) {
      return 'Academic year must be in YYYY-YYYY format';
    }

    if (!form.startDate) {
      return 'Start date is required';
    }

    const startDate = new Date(form.startDate);
    if (Number.isNaN(startDate.getTime())) {
      return 'Valid start date is required';
    }

    if (form.endDate) {
      const endDate = new Date(form.endDate);
      if (Number.isNaN(endDate.getTime())) {
        return 'Invalid end date selected';
      }

      if (endDate.getTime() < startDate.getTime()) {
        return 'Start date must be before or equal to end date';
      }
    }

    if (!EXAM_TYPES.includes(form.examType)) {
      return 'Invalid exam type selected';
    }

    if (!EXAM_STATUS.includes(form.status)) {
      return 'Invalid exam status selected';
    }

    return '';
  };

  const onSubmitExam = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setSubmitting(true);

    const payload = {
      examName: form.examName.trim(),
      examType: form.examType,
      classId: form.classId,
      subjects: form.subjects,
      academicYear: form.academicYear.trim(),
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      description: form.description.trim(),
      status: form.status
    };

    try {
      if (editingExamId) {
        await put(`/exams/${editingExamId}`, payload, getToken());
        toast.success('Exam updated successfully');
      } else {
        await post('/exams', payload, getToken());
        toast.success('Exam created successfully');
      }

      clearForm();
      await loadExams(1);
    } catch (apiError) {
      if (apiError?.statusCode === 409) {
        toast.error('Exam already exists');
      } else {
        toast.error(apiError.message || 'Failed to save exam');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onDeleteExam = async () => {
    if (!deleteTarget?._id) {
      return;
    }

    setDeletingExamId(toId(deleteTarget));

    try {
      await del(`/exams/${toId(deleteTarget)}`, getToken());
      toast.success('Exam deleted successfully');
      setDeleteTarget(null);

      const shouldMoveToPreviousPage = examRecords.length === 1 && pagination.page > 1;
      const nextPage = shouldMoveToPreviousPage ? pagination.page - 1 : pagination.page;
      setPagination((prev) => ({ ...prev, page: nextPage }));

      await loadExams(nextPage);
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to delete exam');
    } finally {
      setDeletingExamId('');
    }
  };

  const hasPrevious = pagination.page > 1;
  const hasNext = pagination.totalPages > 0 && pagination.page < pagination.totalPages;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Exam Management"
        description="Create, update, delete, and monitor exam schedules by class and academic year."
        rightSlot={
          <button
            type="button"
            onClick={clearForm}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Create Exam
          </button>
        }
      />

      <form onSubmit={onSubmitExam} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{editingExamId ? 'Edit Exam' : 'Create Exam'}</h3>
        <p className="mb-4 text-sm text-slate-600">Manage exam setup by class, subjects, date range, and status.</p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            label="Exam Name"
            value={form.examName}
            onChange={onChangeForm('examName')}
            required
            className="h-11"
            placeholder="Example: Mid Term Science"
          />

          <Select
            label="Exam Type"
            value={form.examType}
            onChange={onChangeForm('examType')}
            className="h-11"
            options={EXAM_TYPES.map((item) => ({ value: item, label: item }))}
          />

          <Select
            label="Select Class"
            value={form.classId}
            onChange={onChangeForm('classId')}
            required
            className="h-11"
            options={[{ value: '', label: 'Select class' }, ...classOptions]}
            disabled={loadingSetup}
          />

          <Input
            label="Academic Year"
            value={form.academicYear}
            onChange={onChangeForm('academicYear')}
            required
            className="h-11"
            placeholder="2025-2026"
          />

          <Input
            label="Start Date"
            type="date"
            value={form.startDate}
            onChange={onChangeForm('startDate')}
            required
            className="h-11"
          />

          <Input
            label="End Date"
            type="date"
            value={form.endDate}
            onChange={onChangeForm('endDate')}
            className="h-11"
          />

          <Select
            label="Status"
            value={form.status}
            onChange={onChangeForm('status')}
            className="h-11"
            options={EXAM_STATUS.map((item) => ({ value: item, label: item }))}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Select Subjects</label>
            <div className="rounded-lg border border-slate-300 p-2">
              {!form.classId ? (
                <p className="px-1 py-1 text-sm text-slate-500">Select a class first to choose subjects.</p>
              ) : subjectsForSelectedClass.length === 0 ? (
                <p className="px-1 py-1 text-sm text-slate-500">No subjects found for selected class.</p>
              ) : (
                <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {subjectsForSelectedClass.map((subject) => {
                    const subjectId = toId(subject);
                    return (
                      <label key={subjectId} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={form.subjects.includes(subjectId)}
                          onChange={() => onToggleSubject(subjectId)}
                        />
                        <span>{subject?.name || '-'}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Description</span>
          <textarea
            value={form.description}
            onChange={onChangeForm('description')}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
            placeholder="Optional exam details"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving...' : editingExamId ? 'Update Exam' : 'Submit Exam'}
          </button>

          {editingExamId ? (
            <button
              type="button"
              onClick={clearForm}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            label="Search Exam"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11"
            placeholder="Type exam name"
          />

          <Select
            label="Filter by Class"
            value={filterClassId}
            onChange={(event) => setFilterClassId(event.target.value)}
            className="h-11"
            options={[{ value: '', label: 'All classes' }, ...classOptions]}
          />

          <Input
            label="Filter by Academic Year"
            value={filterAcademicYear}
            onChange={(event) => setFilterAcademicYear(event.target.value)}
            className="h-11"
            placeholder="2025-2026"
          />

          <Select
            label="Filter by Status"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className="h-11"
            options={[{ value: '', label: 'All statuses' }, ...EXAM_STATUS.map((item) => ({ value: item, label: item }))]}
          />
        </div>
      </div>

      <Table columns={columns} rows={tableRows} loading={loadingExams} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-slate-600">
          Page {pagination.page} of {pagination.totalPages || 0} | Total records: {pagination.total}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
            disabled={!hasPrevious || loadingExams}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={!hasNext || loadingExams}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete Exam</h3>
            <p className="mt-2 text-sm text-slate-600">
              This action will permanently delete <span className="font-semibold text-slate-900">{deleteTarget.examName || 'this exam'}</span>.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDeleteExam}
                disabled={deletingExamId === toId(deleteTarget)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingExamId === toId(deleteTarget) ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
