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

const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{4}$/;

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0
};

const DEFAULT_FORM = {
  examName: '',
  classIds: [],
  schedule: [],
  academicYear: '',
  description: ''
};

const toId = (value) => String(value?._id || value || '');
const getScheduleKey = (classId, subjectId) => `${classId}:${subjectId}`;

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toDateTimeInputValue = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return '';
  }

  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const toDateLabel = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString();
};

const toDateTimeLabel = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleString();
};

const toExamWindowLabel = (startDate, endDate) => {
  const startLabel = toDateLabel(startDate);
  const endLabel = toDateLabel(endDate);

  if (startLabel === '-' && endLabel === '-') {
    return '-';
  }

  if (startLabel === '-' || startLabel === endLabel) {
    return endLabel;
  }

  if (endLabel === '-') {
    return startLabel;
  }

  return `${startLabel} - ${endLabel}`;
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

const getScheduleFromExam = (exam) => {
  const examClassId = toId(exam?.classId);
  const examStartDate = exam?.startDate || exam?.date || exam?.examDate;
  const examEndDate = exam?.endDate || examStartDate;

  const normalizedSchedule = Array.isArray(exam?.schedule)
    ? exam.schedule
        .map((item) => ({
          classId: toId(item?.classId) || examClassId,
          subjectId: toId(item?.subjectId),
          startDate: item?.startDate || examStartDate,
          endDate: item?.endDate || examEndDate
        }))
        .filter((item) => item.classId && item.subjectId)
    : [];

  if (normalizedSchedule.length > 0) {
    return normalizedSchedule;
  }

  return getSubjectIdsFromExam(exam).map((subjectId) => ({
    classId: examClassId,
    subjectId,
    startDate: examStartDate,
    endDate: examEndDate
  }));
};

const scheduleRowsEqual = (first = [], second = []) => {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((item, index) => {
    const peer = second[index];
    return (
      item.classId === peer.classId &&
      item.subjectId === peer.subjectId &&
      item.startDate === peer.startDate &&
      item.endDate === peer.endDate
    );
  });
};

const columns = [
  { key: 'examName', label: 'Exam Name' },
  { key: 'className', label: 'Class' },
  { key: 'subjects', label: 'Subject Schedule' },
  { key: 'examWindow', label: 'Exam Window' },
  { key: 'academicYear', label: 'Academic Year' },
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

  const allClassIds = useMemo(
    () => classOptions.map((item) => item.value).filter(Boolean),
    [classOptions]
  );

  const classLabelMap = useMemo(() => {
    return new Map(classOptions.map((item) => [item.value, item.label]));
  }, [classOptions]);

  const subjectMap = useMemo(() => {
    const map = new Map();
    subjects.forEach((item) => {
      map.set(toId(item), item);
    });

    return map;
  }, [subjects]);

  const subjectsByClassId = useMemo(() => {
    const map = new Map();

    subjects.forEach((item) => {
      const classId = toId(item?.classId);
      if (!classId) {
        return;
      }

      if (!map.has(classId)) {
        map.set(classId, []);
      }

      map.get(classId).push(item);
    });

    map.forEach((entries) => {
      entries.sort((first, second) => {
        const firstLabel = String(first?.name || first?.code || '').toLowerCase();
        const secondLabel = String(second?.name || second?.code || '').toLowerCase();
        return firstLabel.localeCompare(secondLabel);
      });
    });

    return map;
  }, [subjects]);

  const scheduleMap = useMemo(() => {
    const map = new Map();

    form.schedule.forEach((item) => {
      map.set(getScheduleKey(item.classId, item.subjectId), item);
    });

    return map;
  }, [form.schedule]);

  const isAllClassChecked =
    allClassIds.length > 0 && allClassIds.every((classId) => form.classIds.includes(classId));

  function onStartEdit(exam) {
    const classId = toId(exam?.classId);

    const normalizedSchedule = getScheduleFromExam(exam)
      .map((item) => ({
        classId: classId || String(item.classId || '').trim(),
        subjectId: String(item.subjectId || '').trim(),
        startDate: toDateTimeInputValue(item.startDate),
        endDate: toDateTimeInputValue(item.endDate)
      }))
      .filter((item) => item.classId && item.subjectId);

    setEditingExamId(toId(exam));
    setForm({
      examName: String(exam?.examName || '').trim(),
      classIds: classId ? [classId] : [],
      schedule: normalizedSchedule,
      academicYear: String(exam?.academicYear || '').trim(),
      description: String(exam?.description || '').trim()
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const tableRows = useMemo(
    () =>
      examRecords.map((item) => {
        const scheduleRows = getScheduleFromExam(item);
        const subjectCount = new Set(scheduleRows.map((entry) => entry.subjectId).filter(Boolean)).size;
        const previewRows = scheduleRows.slice(0, 2);

        return {
          id: toId(item),
          examName: item.examName || '-',
          className: formatClassLabel(item.classId),
          subjects:
            scheduleRows.length === 0 ? (
              '-'
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-700">
                  {subjectCount} subject slot{subjectCount === 1 ? '' : 's'}
                </p>
                {previewRows.map((entry, index) => {
                  const subjectId = toId(entry.subjectId);
                  const liveSubject = subjectMap.get(subjectId);
                  const subjectLabel =
                    entry.subjectId?.name ||
                    entry.subjectId?.code ||
                    liveSubject?.name ||
                    liveSubject?.code ||
                    'Subject';

                  return (
                    <p key={`${subjectId}-${index}`} className="text-xs text-slate-500">
                      {subjectLabel}: {toDateTimeLabel(entry.startDate)} to {toDateTimeLabel(entry.endDate)}
                    </p>
                  );
                })}
                {scheduleRows.length > previewRows.length ? (
                  <p className="text-xs text-slate-500">+{scheduleRows.length - previewRows.length} more slot(s)</p>
                ) : null}
              </div>
            ),
          examWindow: toExamWindowLabel(item.startDate || item.date || item.examDate, item.endDate),
          academicYear: item.academicYear || '-',
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
        };
      }),
    [examRecords, subjectMap]
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
  }, [search, filterClassId, filterAcademicYear]);

  useEffect(() => {
    loadExams(pagination.page).catch((apiError) => {
      toast.error(apiError.message || 'Failed to load exams');
    });
  }, [pagination.page, search, filterClassId, filterAcademicYear]);

  useEffect(() => {
    const validClassIdSet = new Set(allClassIds);
    const subjectClassMap = new Map(
      subjects
        .map((item) => [toId(item), toId(item?.classId)])
        .filter(([subjectId, classId]) => subjectId && classId)
    );

    setForm((prev) => {
      const nextClassIds = prev.classIds.filter((classId) => validClassIdSet.has(classId));
      const allowedClassIdSet = new Set(nextClassIds);

      const nextSchedule = prev.schedule.filter((row) => {
        const classId = String(row?.classId || '').trim();
        const subjectId = String(row?.subjectId || '').trim();

        if (!classId || !subjectId) {
          return false;
        }

        if (!allowedClassIdSet.has(classId)) {
          return false;
        }

        return subjectClassMap.get(subjectId) === classId;
      });

      const sameClassIds =
        nextClassIds.length === prev.classIds.length && nextClassIds.every((item, index) => item === prev.classIds[index]);

      if (sameClassIds && scheduleRowsEqual(nextSchedule, prev.schedule)) {
        return prev;
      }

      return {
        ...prev,
        classIds: nextClassIds,
        schedule: nextSchedule
      };
    });
  }, [allClassIds, subjects]);

  const sortClassIdsByOptionOrder = (classIds) => {
    const order = new Map(allClassIds.map((item, index) => [item, index]));

    return Array.from(new Set(classIds)).sort((first, second) => {
      const firstOrder = order.get(first) ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = order.get(second) ?? Number.MAX_SAFE_INTEGER;
      return firstOrder - secondOrder;
    });
  };

  const onChangeForm = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const onToggleClass = (classId) => {
    setForm((prev) => {
      const exists = prev.classIds.includes(classId);
      const nextClassIds = exists
        ? prev.classIds.filter((item) => item !== classId)
        : sortClassIdsByOptionOrder([...prev.classIds, classId]);

      const allowedClassIdSet = new Set(nextClassIds);

      return {
        ...prev,
        classIds: nextClassIds,
        schedule: prev.schedule.filter((row) => allowedClassIdSet.has(row.classId))
      };
    });
  };

  const onToggleAllClasses = () => {
    setForm((prev) => {
      const alreadySelectedAll = allClassIds.length > 0 && allClassIds.every((classId) => prev.classIds.includes(classId));

      if (alreadySelectedAll) {
        return {
          ...prev,
          classIds: [],
          schedule: []
        };
      }

      const allClassSet = new Set(allClassIds);

      return {
        ...prev,
        classIds: [...allClassIds],
        schedule: prev.schedule.filter((row) => allClassSet.has(row.classId))
      };
    });
  };

  const onToggleSubject = (classId, subjectId) => {
    setForm((prev) => {
      const targetKey = getScheduleKey(classId, subjectId);
      const exists = prev.schedule.some((row) => getScheduleKey(row.classId, row.subjectId) === targetKey);

      if (exists) {
        return {
          ...prev,
          schedule: prev.schedule.filter((row) => getScheduleKey(row.classId, row.subjectId) !== targetKey)
        };
      }

      const templateSlot = prev.schedule.find((row) => row.classId === classId && row.startDate && row.endDate);

      return {
        ...prev,
        schedule: [
          ...prev.schedule,
          {
            classId,
            subjectId,
            startDate: templateSlot?.startDate || '',
            endDate: templateSlot?.endDate || ''
          }
        ]
      };
    });
  };

  const onUpdateScheduleField = (classId, subjectId, field, value) => {
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.map((row) =>
        row.classId === classId && row.subjectId === subjectId
          ? {
              ...row,
              [field]: value
            }
          : row
      )
    }));
  };

  const onCopyTimingToClass = (classId) => {
    setForm((prev) => {
      const classRows = prev.schedule.filter((row) => row.classId === classId && row.startDate && row.endDate);
      if (classRows.length < 2) {
        return prev;
      }

      const baseSlot = classRows[0];

      return {
        ...prev,
        schedule: prev.schedule.map((row) =>
          row.classId !== classId
            ? row
            : {
                ...row,
                startDate: baseSlot.startDate,
                endDate: baseSlot.endDate
              }
        )
      };
    });
  };

  const validateForm = () => {
    if (!form.examName.trim()) {
      return 'Exam name is required';
    }

    if (form.classIds.length === 0) {
      return 'Select at least one class';
    }

    if (editingExamId && form.classIds.length !== 1) {
      return 'Edit mode supports one class at a time';
    }

    if (!form.academicYear.trim()) {
      return 'Academic year is required';
    }

    if (!ACADEMIC_YEAR_REGEX.test(form.academicYear.trim())) {
      return 'Academic year must be in YYYY-YYYY format';
    }

    for (const classId of form.classIds) {
      const classLabel = classLabelMap.get(classId) || 'selected class';
      const classRows = form.schedule.filter((row) => row.classId === classId);

      if (classRows.length === 0) {
        return `Select at least one subject for ${classLabel}`;
      }

      for (const row of classRows) {
        const subject = subjectMap.get(row.subjectId);
        const subjectLabel = subject?.name || subject?.code || 'subject';

        if (!row.startDate || !row.endDate) {
          return `Set start and end date-time for ${subjectLabel} (${classLabel})`;
        }

        const startDate = parseDateValue(row.startDate);
        const endDate = parseDateValue(row.endDate);

        if (!startDate || !endDate) {
          return `Invalid schedule date-time for ${subjectLabel} (${classLabel})`;
        }

        if (endDate.getTime() < startDate.getTime()) {
          return `End date-time must be after start date-time for ${subjectLabel} (${classLabel})`;
        }
      }
    }

    return '';
  };

  const buildPayloadForClass = (classId) => {
    const classRows = form.schedule.filter((row) => row.classId === classId);

    if (classRows.length === 0) {
      throw new Error('Select at least one subject for every selected class');
    }

    const subjectIdSet = new Set();
    const schedule = [];
    let minStartMs = Number.POSITIVE_INFINITY;
    let maxEndMs = 0;

    classRows.forEach((row) => {
      const subjectId = String(row.subjectId || '').trim();
      const startDate = parseDateValue(row.startDate);
      const endDate = parseDateValue(row.endDate);

      if (!subjectId || !startDate || !endDate) {
        throw new Error('Each selected subject must have valid schedule date-time');
      }

      if (endDate.getTime() < startDate.getTime()) {
        throw new Error('Subject schedule end date-time must be after start date-time');
      }

      subjectIdSet.add(subjectId);

      minStartMs = Math.min(minStartMs, startDate.getTime());
      maxEndMs = Math.max(maxEndMs, endDate.getTime());

      schedule.push({
        classId,
        subjectId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
    });

    schedule.sort((first, second) => {
      const firstStart = new Date(first.startDate).getTime();
      const secondStart = new Date(second.startDate).getTime();
      return firstStart - secondStart;
    });

    if (subjectIdSet.size === 0 || !Number.isFinite(minStartMs) || !Number.isFinite(maxEndMs)) {
      throw new Error('At least one valid subject schedule is required');
    }

    return {
      examName: form.examName.trim(),
      classId,
      subjects: Array.from(subjectIdSet),
      academicYear: form.academicYear.trim(),
      startDate: new Date(minStartMs).toISOString(),
      endDate: new Date(maxEndMs).toISOString(),
      description: form.description.trim(),
      schedule
    };
  };

  const onSubmitExam = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setSubmitting(true);

    try {
      const token = getToken();

      if (editingExamId) {
        const targetClassId = form.classIds[0];
        const payload = buildPayloadForClass(targetClassId);

        await put(`/exams/${editingExamId}`, payload, token);
        toast.success('Exam updated successfully');
        clearForm();
        await loadExams(1);
        return;
      }

      const classPayloads = form.classIds.map((classId) => ({
        classId,
        payload: buildPayloadForClass(classId)
      }));

      const results = await Promise.allSettled(
        classPayloads.map((entry) => post('/exams', entry.payload, token))
      );

      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedResults = results.filter((result) => result.status === 'rejected');
      const failedCount = failedResults.length;

      if (successCount > 0) {
        toast.success(successCount === 1 ? 'Exam created successfully' : `Exams created for ${successCount} classes`);
        clearForm();
        await loadExams(1);
      }

      if (failedCount > 0) {
        const duplicateCount = failedResults.filter((result) => result.reason?.statusCode === 409).length;

        if (successCount === 0 && duplicateCount === failedCount) {
          toast.error('Exam already exists for selected class(es)');
          return;
        }

        if (successCount === 0) {
          toast.error(failedResults[0]?.reason?.message || 'Failed to create exams');
          return;
        }

        const duplicateMessage = duplicateCount > 0 ? `${duplicateCount} duplicate` : '';
        const genericFailureCount = failedCount - duplicateCount;
        const genericFailureMessage = genericFailureCount > 0 ? `${genericFailureCount} failed` : '';
        const summary = [duplicateMessage, genericFailureMessage].filter(Boolean).join(', ');

        toast.error(`Some classes were skipped (${summary || `${failedCount} failed`})`);
      }
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
        description="Create meaningful class-wise exam plans with subject-level schedule and clear date-time slots."
        rightSlot={
          <button
            type="button"
            onClick={clearForm}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Create New
          </button>
        }
      />

      <form onSubmit={onSubmitExam} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{editingExamId ? 'Edit Exam Plan' : 'Create Exam Plan'}</h3>
        <p className="mb-4 text-sm text-slate-600">
          Plan each selected class with exact subject exam start and end date-time.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            label="Exam Name"
            value={form.examName}
            onChange={onChangeForm('examName')}
            required
            className="h-11"
            placeholder="Example: Half Yearly Exam"
          />

          <Input
            label="Academic Year"
            value={form.academicYear}
            onChange={onChangeForm('academicYear')}
            required
            className="h-11"
            placeholder="2026-2027"
          />

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Select Class</label>
            <div className="rounded-lg border border-slate-300 p-3">
              <label className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={isAllClassChecked}
                  onChange={onToggleAllClasses}
                  disabled={loadingSetup || Boolean(editingExamId) || allClassIds.length === 0}
                />
                <span>All Classes</span>
              </label>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {classOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.classIds.includes(option.value)}
                      onChange={() => onToggleClass(option.value)}
                      disabled={loadingSetup || Boolean(editingExamId)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>

              {editingExamId ? (
                <p className="mt-2 text-xs text-amber-700">
                  Class selection is locked while editing an existing exam. Create a new record for other classes.
                </p>
              ) : null}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Class-Subject Exam Schedule</label>
            <div className="rounded-lg border border-slate-300 p-3">
              {form.classIds.length === 0 ? (
                <p className="text-sm text-slate-500">Select one or more classes to begin class-wise subject scheduling.</p>
              ) : (
                <div className="space-y-3">
                  {form.classIds.map((classId) => {
                    const classLabel = classLabelMap.get(classId) || 'Selected Class';
                    const classSubjects = subjectsByClassId.get(classId) || [];
                    const activeClassSlots = form.schedule.filter((row) => row.classId === classId);

                    return (
                      <div key={classId} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">{classLabel}</h4>
                            <p className="text-xs text-slate-600">
                              Pick subjects and set exact start/end date-time for each subject exam.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => onCopyTimingToClass(classId)}
                            disabled={activeClassSlots.length < 2}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Copy First Timing To All
                          </button>
                        </div>

                        {classSubjects.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">No subjects found for this class.</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {classSubjects.map((subject) => {
                              const subjectId = toId(subject);
                              const scheduleKey = getScheduleKey(classId, subjectId);
                              const activeSlot = scheduleMap.get(scheduleKey);
                              const isSelected = Boolean(activeSlot);

                              return (
                                <div key={scheduleKey} className="rounded-md border border-slate-200 bg-white p-3">
                                  <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => onToggleSubject(classId, subjectId)}
                                      disabled={loadingSetup}
                                    />
                                    <span className="font-medium text-slate-900">{subject?.name || 'Subject'}</span>
                                    {subject?.code ? <span className="text-xs text-slate-500">({subject.code})</span> : null}
                                  </label>

                                  {isSelected ? (
                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                      <label>
                                        <span className="mb-1 block text-xs font-medium text-slate-600">Start Date & Time</span>
                                        <input
                                          type="datetime-local"
                                          value={activeSlot?.startDate || ''}
                                          onChange={(event) =>
                                            onUpdateScheduleField(classId, subjectId, 'startDate', event.target.value)
                                          }
                                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                                          required
                                        />
                                      </label>

                                      <label>
                                        <span className="mb-1 block text-xs font-medium text-slate-600">End Date & Time</span>
                                        <input
                                          type="datetime-local"
                                          value={activeSlot?.endDate || ''}
                                          onChange={(event) =>
                                            onUpdateScheduleField(classId, subjectId, 'endDate', event.target.value)
                                          }
                                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                                          required
                                        />
                                      </label>
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-xs text-slate-500">Enable subject to set its exam schedule.</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Planned slots: {form.schedule.length}</p>
          </div>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Description</span>
          <textarea
            value={form.description}
            onChange={onChangeForm('description')}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
            placeholder="Optional note about exam structure, invigilator plan, or extra instructions"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving...' : editingExamId ? 'Update Exam' : 'Create Exam'}
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
        <div className="grid gap-3 md:grid-cols-3">
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
            placeholder="2026-2027"
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
              This action will permanently delete{' '}
              <span className="font-semibold text-slate-900">{deleteTarget.examName || 'this exam'}</span>.
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
