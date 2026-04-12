'use client';

import { useEffect, useMemo, useState } from 'react';
import Input from '@/components/Input';
import PageHeader from '@/components/PageHeader';
import Select from '@/components/Select';
import { del, get, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import {
  TIMETABLE_DAYS,
  TIMETABLE_PERIODS,
  buildTimetableGrid,
  sortTimetableRows,
  toId
} from '@/lib/timetable-grid';
import { useToast } from '@/lib/toast-context';

const PERIOD_TIME_SLOTS = Object.freeze({
  1: { startTime: '11:00', endTime: '11:40' },
  2: { startTime: '11:50', endTime: '12:30' },
  3: { startTime: '12:40', endTime: '13:20' },
  4: { startTime: '14:00', endTime: '14:40' },
  5: { startTime: '14:50', endTime: '15:30' },
  6: { startTime: '15:40', endTime: '16:20' }
});

const getPeriodTimeSlot = (periodNumber) => PERIOD_TIME_SLOTS[Number(periodNumber)] || null;

const getInitialForm = () => {
  const defaultPeriodNumber = String(TIMETABLE_PERIODS[0] || '');
  const defaultTimeSlot = getPeriodTimeSlot(defaultPeriodNumber);

  return {
    className: '',
    classSection: '',
    classId: '',
    section: '',
    day: TIMETABLE_DAYS[0],
    periodNumber: defaultPeriodNumber,
    subjectId: '',
    teacherId: '',
    startTime: defaultTimeSlot?.startTime || '',
    endTime: defaultTimeSlot?.endTime || '',
    roomNumber: ''
  };
};

const requiredFormFields = ['classId', 'day', 'periodNumber', 'subjectId'];

const CONFLICT_MESSAGES = Object.freeze({
  teacherConflict: 'Teacher already has a class at this time',
  classPeriodConflict: 'Class already has a subject in this period',
  subjectPeriodConflict: 'Subject already assigned in this period',
  subjectTeacherConflict: 'Subject not assigned to teacher'
});

const getTeacherLabel = (teacher) => {
  const name = String(teacher?.userId?.name || '').trim();
  const teacherCode = String(teacher?.teacherId || '').trim();
  if (name && teacherCode) {
    return `${name} (${teacherCode})`;
  }
  return name || teacherCode || 'Teacher';
};

const normalizeSection = (value) => String(value || '').trim().toUpperCase();

const toMinutes = (timeValue) => {
  const normalized = String(timeValue || '').trim();
  if (!normalized) {
    return Number.NaN;
  }

  const [hours, minutes] = normalized.split(':').map((item) => Number(item));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.NaN;
  }

  return (hours * 60) + minutes;
};

const mapSaveErrorToConflictMessage = (rawErrorMessage) => {
  const normalizedErrorMessage = String(rawErrorMessage || '').toLowerCase();

  if (normalizedErrorMessage.includes('teacher already assigned')) {
    return CONFLICT_MESSAGES.teacherConflict;
  }

  if (
    normalizedErrorMessage.includes('class already has a subject in this period')
    || normalizedErrorMessage.includes('class period already has')
  ) {
    return CONFLICT_MESSAGES.classPeriodConflict;
  }

  if (normalizedErrorMessage.includes('subject already assigned in this period')) {
    return CONFLICT_MESSAGES.subjectPeriodConflict;
  }

  if (
    normalizedErrorMessage.includes('subject not assigned to teacher')
    || normalizedErrorMessage.includes('not assigned to this subject')
  ) {
    return CONFLICT_MESSAGES.subjectTeacherConflict;
  }

  return '';
};

export default function AdminTimetablePage() {
  const toast = useToast();
  const [form, setForm] = useState(getInitialForm());
  const [editingId, setEditingId] = useState('');
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const selectedClass = useMemo(
    () => classes.find((item) => toId(item) === form.classId) || null,
    [classes, form.classId]
  );

  const selectedClassSection = useMemo(
    () => normalizeSection(selectedClass?.section),
    [selectedClass]
  );

  const uniqueClassNames = useMemo(
    () => Array.from(new Set(classes.map((c) => c.name))).sort(),
    [classes]
  );

  const availableSections = useMemo(
    () => {
      if (!form.className) return [];
      return classes
        .filter((c) => c.name === form.className)
        .map((c) => c.section || '')
        .sort();
    },
    [classes, form.className]
  );

  const classNameOptions = useMemo(
    () => [
      { value: '', label: 'Select class name' },
      ...uniqueClassNames.map((name) => ({ value: name, label: name }))
    ],
    [uniqueClassNames]
  );

  const classSectionOptions = useMemo(
    () => [
      { value: '', label: form.className ? 'Select section' : 'Select class first' },
      ...availableSections.map((section) => ({
        value: section,
        label: section || '(No Section)'
      }))
    ],
    [availableSections, form.className]
  );

  const subjectOptions = useMemo(() => {
    const classSubjects = subjects.filter((item) => toId(item?.classId) === form.classId);

    return [
      { value: '', label: 'Select subject' },
      ...classSubjects.map((item) => ({
        value: toId(item),
        label: String(item?.name || '').trim() || 'Subject'
      }))
    ];
  }, [form.classId, subjects]);

  const subjectById = useMemo(() => {
    const map = new Map();
    subjects.forEach((item) => {
      map.set(toId(item), item);
    });
    return map;
  }, [subjects]);

  const assignedTeacher = useMemo(() => {
    if (!form.subjectId) {
      return {
        teacherUserId: '',
        label: 'Select subject first'
      };
    }

    const selectedSubject = subjectById.get(form.subjectId);
    const directTeacherUserId = toId(selectedSubject?.teacherId);

    if (directTeacherUserId) {
      const directTeacher = teachers.find((item) => toId(item?.userId) === directTeacherUserId);
      if (directTeacher) {
        return {
          teacherUserId: directTeacherUserId,
          label: getTeacherLabel(directTeacher)
        };
      }

      return {
        teacherUserId: directTeacherUserId,
        label: 'Assigned teacher'
      };
    }

    const fallbackTeacher = teachers.find((item) => (
      (Array.isArray(item?.subjects) ? item.subjects : []).some((subject) => toId(subject) === form.subjectId)
    ));

    if (fallbackTeacher) {
      return {
        teacherUserId: toId(fallbackTeacher?.userId),
        label: getTeacherLabel(fallbackTeacher)
      };
    }

    return {
      teacherUserId: '',
      label: 'No teacher assigned for this subject'
    };
  }, [form.subjectId, subjectById, teachers]);

  const dayOptions = useMemo(
    () => TIMETABLE_DAYS.map((day) => ({ value: day, label: day })),
    []
  );

  const effectiveTeacherUserId = useMemo(
    () => String(assignedTeacher.teacherUserId || form.teacherId || '').trim(),
    [assignedTeacher.teacherUserId, form.teacherId]
  );

  const periodOptions = useMemo(
    () => TIMETABLE_PERIODS.map((periodNumber) => ({ value: String(periodNumber), label: `Period ${periodNumber}` })),
    []
  );

  const selectedPeriodTimeSlot = useMemo(
    () => getPeriodTimeSlot(form.periodNumber),
    [form.periodNumber]
  );

  const gridRows = useMemo(() => buildTimetableGrid(rows, TIMETABLE_PERIODS), [rows]);

  const loadSetupData = async () => {
    setLoadingSetup(true);

    try {
      const token = getToken();
      const [classResponse, subjectResponse, teacherResponse] = await Promise.all([
        get('/classes', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/subjects', token, { forceRefresh: true, cacheTtlMs: 0 }),
        get('/teachers', token, { forceRefresh: true, cacheTtlMs: 0 })
      ]);

      const classRows = Array.isArray(classResponse?.data) ? classResponse.data : [];
      const subjectRows = Array.isArray(subjectResponse?.data) ? subjectResponse.data : [];
      const teacherRows = Array.isArray(teacherResponse?.data) ? teacherResponse.data : [];

      setClasses(classRows);
      setSubjects(subjectRows);
      setTeachers(teacherRows);

      setForm((prev) => {
        if (prev.classId) {
          return prev;
        }

        const firstClass = classRows[0];
        return {
          ...prev,
          classId: toId(firstClass),
          section: normalizeSection(firstClass?.section)
        };
      });
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to load timetable setup');
    } finally {
      setLoadingSetup(false);
    }
  };

  const loadClassTimetable = async ({ classId, section }) => {
    if (!classId || !section) {
      setRows([]);
      return;
    }

    setLoadingRows(true);
    try {
      const query = new URLSearchParams();
      query.set('section', section);

      const response = await get(`/timetable/class/${classId}?${query.toString()}`, getToken(), {
        forceRefresh: true,
        cacheTtlMs: 0
      });

      setRows(sortTimetableRows(Array.isArray(response?.data) ? response.data : []));
    } catch (apiError) {
      setRows([]);
      toast.error(apiError.message || 'Failed to load timetable');
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    loadSetupData();
  }, []);

  useEffect(() => {
    loadClassTimetable({
      classId: form.classId,
      section: form.section
    });
  }, [form.classId, form.section]);

  useEffect(() => {
    setForm((prev) => {
      if (!prev.classId) {
        return prev;
      }

      const currentClass = classes.find((item) => toId(item) === prev.classId);
      const classSection = normalizeSection(currentClass?.section);
      if (!classSection || prev.section) {
        return prev;
      }

      return {
        ...prev,
        section: classSection
      };
    });
  }, [classes, form.classId]);

  useEffect(() => {
    setForm((prev) => {
      if (prev.teacherId === assignedTeacher.teacherUserId) {
        return prev;
      }

      return {
        ...prev,
        teacherId: assignedTeacher.teacherUserId
      };
    });
  }, [assignedTeacher.teacherUserId]);

  useEffect(() => {
    if (!selectedPeriodTimeSlot) {
      return;
    }

    setForm((prev) => {
      if (prev.startTime === selectedPeriodTimeSlot.startTime && prev.endTime === selectedPeriodTimeSlot.endTime) {
        return prev;
      }

      return {
        ...prev,
        startTime: selectedPeriodTimeSlot.startTime,
        endTime: selectedPeriodTimeSlot.endTime
      };
    });
  }, [selectedPeriodTimeSlot]);

  const onFieldChange = (field) => (event) => {
    const nextValue = event.target.value;

    setForm((prev) => {
      if (field === 'className') {
        return {
          ...prev,
          className: nextValue,
          classSection: '',
          classId: '',
          section: '',
          subjectId: '',
          teacherId: ''
        };
      }

      if (field === 'classSection') {
        const matchedClass = classes.find(
          (c) => c.name === prev.className && (c.section || '') === nextValue
        );
        return {
          ...prev,
          classSection: nextValue,
          classId: matchedClass ? toId(matchedClass) : '',
          section: normalizeSection(nextValue),
          subjectId: '',
          teacherId: ''
        };
      }

      if (field === 'classId') {
        const nextClass = classes.find((item) => toId(item) === nextValue);
        return {
          ...prev,
          classId: nextValue,
          section: normalizeSection(nextClass?.section),
          subjectId: '',
          teacherId: ''
        };
      }

      if (field === 'subjectId') {
        return {
          ...prev,
          subjectId: nextValue,
          teacherId: ''
        };
      }

      if (field === 'periodNumber') {
        const selectedPeriodSlot = getPeriodTimeSlot(nextValue);
        return {
          ...prev,
          periodNumber: nextValue,
          startTime: selectedPeriodSlot?.startTime || '',
          endTime: selectedPeriodSlot?.endTime || ''
        };
      }

      return {
        ...prev,
        [field]: nextValue
      };
    });
  };

  const resetFormForNextEntry = () => {
    setForm((prev) => ({
      ...getInitialForm(),
      className: prev.className,
      classSection: prev.classSection,
      classId: prev.classId,
      section: prev.section
    }));
    setEditingId('');
  };

  const hasClassPeriodConflict = () => {
    const { day, periodNumber } = form;

    const conflictingRow = rows.find((row) => {
      if (toId(row) === editingId) {
        return false;
      }

      return String(row?.day || '') === String(day || '')
        && Number(row?.periodNumber) === Number(periodNumber);
    });

    if (!conflictingRow) {
      return { hasConflict: false };
    }

    return {
      hasConflict: true
    };
  };

  const onSaveTimetable = async (event) => {
    event.preventDefault();

    if (!form.className) {
      toast.error('Please select a class name');
      return;
    }

    if (!form.classSection && availableSections.length > 0) {
      toast.error('Please select a section');
      return;
    }

    if (!form.classId) {
      toast.error('Please select both class and section');
      return;
    }

    const effectiveSection = normalizeSection(form.section || selectedClassSection);
    if (!effectiveSection) {
      toast.error('Selected class has no section configured');
      return;
    }

    if (!effectiveTeacherUserId) {
      toast.error(CONFLICT_MESSAGES.subjectTeacherConflict);
      return;
    }

    const missingField = requiredFormFields.find((field) => !String(form[field] || '').trim());
    if (missingField) {
      toast.error('All required fields must be filled');
      return;
    }

    const effectivePeriodTimeSlot = getPeriodTimeSlot(form.periodNumber);
    if (!effectivePeriodTimeSlot) {
      toast.error('Invalid period selected');
      return;
    }

    const effectiveStartTime = effectivePeriodTimeSlot.startTime;
    const effectiveEndTime = effectivePeriodTimeSlot.endTime;

    if (toMinutes(effectiveStartTime) >= toMinutes(effectiveEndTime)) {
      toast.error('Start time must be before end time');
      return;
    }

    setSaving(true);

    try {
      const classPeriodConflict = hasClassPeriodConflict();
      if (classPeriodConflict.hasConflict) {
        toast.error(CONFLICT_MESSAGES.classPeriodConflict);
        return;
      }

      const payload = {
        classId: form.classId,
        section: effectiveSection,
        day: form.day,
        periodNumber: Number(form.periodNumber),
        subjectId: form.subjectId,
        teacherId: effectiveTeacherUserId,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        roomNumber: String(form.roomNumber || '').trim() || undefined
      };

      if (editingId) {
        await put(`/timetable/${editingId}`, payload, getToken());
      } else {
        await post('/timetable', payload, getToken());
      }

      toast.success('Timetable saved successfully');
      resetFormForNextEntry();
      await loadClassTimetable({ classId: payload.classId, section: payload.section });
    } catch (apiError) {
      const mappedConflictMessage = mapSaveErrorToConflictMessage(apiError?.message);
      toast.error(mappedConflictMessage || apiError.message || 'Failed to save timetable');
    } finally {
      setSaving(false);
    }
  };

  const onEditRow = (row) => {
    const periodNumber = String(row?.periodNumber || TIMETABLE_PERIODS[0]);
    const selectedPeriodSlot = getPeriodTimeSlot(periodNumber);
    const rowClass = classes.find((c) => toId(c) === toId(row?.classId));

    setEditingId(toId(row));
    setForm({
      className: rowClass?.name || '',
      classSection: rowClass?.section || '',
      classId: toId(row?.classId),
      section: normalizeSection(row?.section),
      day: String(row?.day || TIMETABLE_DAYS[0]),
      periodNumber,
      subjectId: toId(row?.subjectId),
      teacherId: toId(row?.teacherId),
      startTime: selectedPeriodSlot?.startTime || String(row?.startTime || ''),
      endTime: selectedPeriodSlot?.endTime || String(row?.endTime || ''),
      roomNumber: String(row?.roomNumber || '')
    });
  };

  const onDeleteRow = async (row) => {
    const rowId = toId(row);
    if (!rowId) {
      return;
    }

    const confirmed = await toast.confirm('Delete this timetable entry?', {
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true
    });
    if (!confirmed) {
      return;
    }

    setDeletingId(rowId);

    try {
      await del(`/timetable/${rowId}`, getToken());
      toast.success('Timetable deleted successfully');

      if (editingId === rowId) {
        resetFormForNextEntry();
      }

      await loadClassTimetable({ classId: form.classId, section: form.section });
    } catch (apiError) {
      toast.error(apiError.message || 'Failed to delete timetable entry');
    } finally {
      setDeletingId('');
    }
  };

  const isLoading = loadingSetup || loadingRows;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Timetable Management"
        description="Create, edit, and manage class timetable slots by class, day, and period."
      />

      <form onSubmit={onSaveTimetable} className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">Currently Selected</p>
          <p className="mt-1 text-sm font-medium text-blue-700">
            {form.className ? (
              <>
                Class: <span className="font-bold">{form.className}</span>
                {form.classSection && (
                  <>
                    {' '} | Section: <span className="font-bold">{form.classSection}</span>
                  </>
                )}
                {!form.classSection && ' | Section: Not selected'}
              </>
            ) : 'Class: Not selected | Section: Not selected'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Class Name *"
            value={form.className}
            onChange={onFieldChange('className')}
            options={classNameOptions}
            disabled={saving || loadingSetup}
            required
          />

          <Select
            label="Section *"
            value={form.classSection}
            onChange={onFieldChange('classSection')}
            options={classSectionOptions}
            disabled={saving || !form.className}
            required
          />

          <Select
            label="Day"
            value={form.day}
            onChange={onFieldChange('day')}
            options={dayOptions}
            disabled={saving}
            required
          />

          <Select
            label="Period Number"
            value={form.periodNumber}
            onChange={onFieldChange('periodNumber')}
            options={periodOptions}
            disabled={saving}
            required
          />

          <Select
            label="Subject"
            value={form.subjectId}
            onChange={onFieldChange('subjectId')}
            options={subjectOptions}
            disabled={saving || !form.classId}
            required
          />

          <div className="mb-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Teacher</p>
            <p className="text-sm font-semibold text-slate-900">{assignedTeacher.label}</p>
          </div>

          <div className="mb-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Time (Auto from period)</p>
            <p className="text-sm font-semibold text-slate-900">
              {selectedPeriodTimeSlot
                ? `${selectedPeriodTimeSlot.startTime} - ${selectedPeriodTimeSlot.endTime}`
                : 'Select a period'}
            </p>
          </div>

          <Input
            label="Room Number"
            value={form.roomNumber}
            onChange={onFieldChange('roomNumber')}
            placeholder="Optional"
            disabled={saving}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || isLoading}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? 'Saving...' : editingId ? 'Update Timetable' : 'Save Timetable'}
          </button>

          <button
            type="button"
            onClick={resetFormForNextEntry}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Clear
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="border-b border-red-100 px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-slate-900">Weekly Grid View</h2>
          <p className="text-xs text-slate-600">Subject, teacher, and timing details by day and period.</p>
        </div>

        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-red-700 text-red-50">
              <tr>
                <th className="rounded-tl-xl px-3 py-3 text-left font-semibold">Day / Period</th>
                {TIMETABLE_PERIODS.map((periodNumber, index) => (
                  <th
                    key={periodNumber}
                    className={`px-3 py-3 text-left font-semibold ${index === TIMETABLE_PERIODS.length - 1 ? 'rounded-tr-xl' : ''}`}
                  >
                    Period {periodNumber}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    Loading timetable...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={TIMETABLE_PERIODS.length + 1} className="px-4 py-6 text-center text-slate-500">
                    No timetable entries found for this class.
                  </td>
                </tr>
              ) : (
                gridRows.map((dayRow, rowIndex) => (
                  <tr key={dayRow.day} className={rowIndex % 2 === 1 ? 'bg-red-50/20' : ''}>
                    <td className="border-t border-slate-100 px-3 py-3 font-semibold text-slate-900">{dayRow.day}</td>
                    {dayRow.cells.map((cell) => (
                      <td key={`${cell.day}-${cell.periodNumber}`} className="border-t border-slate-100 px-2 py-2 align-top">
                        {cell.items.length === 0 ? (
                          <p className="text-xs text-slate-400">-</p>
                        ) : (
                          <div className="space-y-2">
                            {cell.items.map((item) => (
                              <div key={toId(item)} className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-xs font-semibold text-slate-900">{item?.subjectId?.name || 'Subject'}</p>
                                <p className="text-xs text-slate-700">{item?.teacherId?.name || 'Teacher'}</p>
                                <p className="text-[11px] text-slate-600">{item?.startTime} - {item?.endTime}</p>
                                {item?.roomNumber ? (
                                  <p className="text-[11px] text-slate-500">Room: {item.roomNumber}</p>
                                ) : null}

                                <div className="mt-2 flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onEditRow(item)}
                                    className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteRow(item)}
                                    disabled={deletingId === toId(item)}
                                    className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                                  >
                                    {deletingId === toId(item) ? 'Deleting...' : 'Delete'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
