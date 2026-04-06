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
  1: { startTime: '10:00', endTime: '10:15' },
  2: { startTime: '10:16', endTime: '10:30' },
  3: { startTime: '10:31', endTime: '10:45' },
  4: { startTime: '10:46', endTime: '11:00' },
  5: { startTime: '11:01', endTime: '11:15' },
  6: { startTime: '11:16', endTime: '11:30' },
  7: { startTime: '11:31', endTime: '11:45' },
  8: { startTime: '11:46', endTime: '12:00' }
});

const getPeriodTimeSlot = (periodNumber) => PERIOD_TIME_SLOTS[Number(periodNumber)] || null;

const getInitialForm = () => {
  const defaultPeriodNumber = String(TIMETABLE_PERIODS[0] || '');
  const defaultTimeSlot = getPeriodTimeSlot(defaultPeriodNumber);

  return {
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

const requiredFormFields = ['classId', 'section', 'day', 'periodNumber', 'subjectId', 'teacherId', 'startTime', 'endTime'];

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

const isTimeRangeOverlap = ({ leftStartTime, leftEndTime, rightStartTime, rightEndTime }) => {
  const leftStartMinutes = toMinutes(leftStartTime);
  const leftEndMinutes = toMinutes(leftEndTime);
  const rightStartMinutes = toMinutes(rightStartTime);
  const rightEndMinutes = toMinutes(rightEndTime);

  if ([leftStartMinutes, leftEndMinutes, rightStartMinutes, rightEndMinutes].some((value) => !Number.isFinite(value))) {
    return false;
  }

  return leftStartMinutes < rightEndMinutes && leftEndMinutes > rightStartMinutes;
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

  const classOptions = useMemo(
    () => [
      { value: '', label: 'Select class' },
      ...classes.map((item) => ({
        value: toId(item),
        label: formatClassLabel(item, 'Class')
      }))
    ],
    [classes]
  );

  const sectionOptions = useMemo(() => {
    const availableSections = new Set();

    if (selectedClassSection) {
      availableSections.add(selectedClassSection);
    }

    rows.forEach((item) => {
      const rowSection = normalizeSection(item?.section);
      if (rowSection) {
        availableSections.add(rowSection);
      }
    });

    const values = Array.from(availableSections);

    return [
      { value: '', label: 'Select section' },
      ...values.map((value) => ({
        value,
        label: value
      }))
    ];
  }, [rows, selectedClassSection]);

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

  const teacherOptions = useMemo(() => {
    const selectedSubject = subjectById.get(form.subjectId);
    const directTeacherUserId = toId(selectedSubject?.teacherId);
    const seenTeacherUserIds = new Set();
    const options = [];

    const pushTeacher = (teacher) => {
      const teacherUserId = toId(teacher?.userId);
      if (!teacherUserId || seenTeacherUserIds.has(teacherUserId)) {
        return;
      }

      seenTeacherUserIds.add(teacherUserId);
      options.push({
        value: teacherUserId,
        label: getTeacherLabel(teacher)
      });
    };

    if (form.subjectId) {
      if (directTeacherUserId) {
        const directTeacher = teachers.find((item) => toId(item?.userId) === directTeacherUserId);
        if (directTeacher) {
          pushTeacher(directTeacher);
        }
      }

      teachers
        .filter((item) => (Array.isArray(item?.subjects) ? item.subjects : []).some((subject) => toId(subject) === form.subjectId))
        .forEach(pushTeacher);
    }

    return [
      {
        value: '',
        label: form.subjectId ? 'Select teacher' : 'Select subject first'
      },
      ...options
    ];
  }, [form.subjectId, subjectById, teachers]);

  const dayOptions = useMemo(
    () => TIMETABLE_DAYS.map((day) => ({ value: day, label: day })),
    []
  );

  const usedPeriodNumbers = useMemo(() => {
    const used = new Set();

    rows.forEach((row) => {
      if (toId(row?.classId) !== form.classId) {
        return;
      }

      if (normalizeSection(row?.section) !== normalizeSection(form.section)) {
        return;
      }

      if (String(row?.day || '') !== form.day) {
        return;
      }

      const rowId = toId(row);
      if (editingId && rowId === editingId) {
        return;
      }

      const rowPeriodNumber = Number(row?.periodNumber);
      if (Number.isInteger(rowPeriodNumber)) {
        used.add(rowPeriodNumber);
      }
    });

    return used;
  }, [rows, form.classId, form.section, form.day, editingId]);

  const periodOptions = useMemo(() => {
    const selectedPeriodNumber = Number(form.periodNumber);
    const availablePeriods = TIMETABLE_PERIODS.filter((periodNumber) => (
      (editingId && periodNumber === selectedPeriodNumber) || !usedPeriodNumbers.has(periodNumber)
    ));

    if (availablePeriods.length === 0) {
      return [{ value: '', label: 'No periods available for selected day' }];
    }

    return availablePeriods.map((periodNumber) => ({
      value: String(periodNumber),
      label: `Period ${periodNumber}`
    }));
  }, [form.periodNumber, usedPeriodNumbers, editingId]);

  const noPeriodsAvailable = periodOptions.length === 1 && !periodOptions[0]?.value;

  const gridRows = useMemo(() => buildTimetableGrid(rows, TIMETABLE_PERIODS), [rows]);

  const loadSetupData = async () => {
    setLoadingSetup(true);

    try {
      const token = getToken();
      const [classResponse, subjectResponse, teacherResponse] = await Promise.all([
        get('/classes', token),
        get('/subjects', token),
        get('/teachers', token)
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
    if (!form.subjectId) {
      return;
    }

    const hasSelectedTeacher = teacherOptions.some((option) => option.value === form.teacherId);
    if (hasSelectedTeacher) {
      return;
    }

    const selectedSubject = subjectById.get(form.subjectId);
    const directTeacherUserId = toId(selectedSubject?.teacherId);
    const fallbackTeacherUserId = teacherOptions[1]?.value || '';

    setForm((prev) => ({
      ...prev,
      teacherId: directTeacherUserId || fallbackTeacherUserId
    }));
  }, [form.subjectId, form.teacherId, subjectById, teacherOptions]);

  useEffect(() => {
    const hasSelectedPeriod = periodOptions.some((option) => option.value === form.periodNumber && option.value);
    if (hasSelectedPeriod) {
      return;
    }

    const firstAvailablePeriod = periodOptions.find((option) => option.value)?.value || '';
    const firstAvailableSlot = getPeriodTimeSlot(firstAvailablePeriod);
    const nextStartTime = firstAvailableSlot?.startTime || '';
    const nextEndTime = firstAvailableSlot?.endTime || '';

    setForm((prev) => {
      if (
        prev.periodNumber === firstAvailablePeriod
        && prev.startTime === nextStartTime
        && prev.endTime === nextEndTime
      ) {
        return prev;
      }

      return {
        ...prev,
        periodNumber: firstAvailablePeriod,
        startTime: nextStartTime,
        endTime: nextEndTime
      };
    });
  }, [form.periodNumber, periodOptions]);

  const onFieldChange = (field) => (event) => {
    const nextValue = event.target.value;

    setForm((prev) => {
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

      if (field === 'section') {
        return {
          ...prev,
          section: normalizeSection(nextValue)
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
      classId: prev.classId,
      section: prev.section
    }));
    setEditingId('');
  };

  const hasTeacherConflict = async () => {
    const { teacherId, day, periodNumber, startTime, endTime } = form;
    if (!teacherId || !day) {
      return { hasConflict: false, message: '' };
    }

    const query = new URLSearchParams();
    query.set('day', day);

    const response = await get(`/timetable/teacher/${teacherId}?${query.toString()}`, getToken(), {
      forceRefresh: true,
      cacheTtlMs: 0
    });

    const candidateRows = Array.isArray(response?.data) ? response.data : [];
    const conflictingRow = candidateRows.find((row) => {
      if (toId(row) === editingId) {
        return false;
      }

      const hasSamePeriodConflict = Number(row?.periodNumber) === Number(periodNumber);
      const hasTimeOverlapConflict = isTimeRangeOverlap({
        leftStartTime: startTime,
        leftEndTime: endTime,
        rightStartTime: row?.startTime,
        rightEndTime: row?.endTime
      });

      return hasSamePeriodConflict || hasTimeOverlapConflict;
    });

    if (!conflictingRow) {
      return { hasConflict: false, message: '' };
    }

    if (Number(conflictingRow?.periodNumber) === Number(periodNumber)) {
      return {
        hasConflict: true,
        message: 'Teacher already assigned to this period on this day'
      };
    }

    return {
      hasConflict: true,
      message: 'Teacher already assigned during this time range'
    };
  };

  const onSaveTimetable = async (event) => {
    event.preventDefault();

    const missingField = requiredFormFields.find((field) => !String(form[field] || '').trim());
    if (missingField) {
      toast.error('All required fields must be filled');
      return;
    }

    if (toMinutes(form.startTime) >= toMinutes(form.endTime)) {
      toast.error('Start time must be before end time');
      return;
    }

    setSaving(true);

    try {
      const teacherConflict = await hasTeacherConflict();
      if (teacherConflict.hasConflict) {
        toast.error(teacherConflict.message);
        return;
      }

      const payload = {
        classId: form.classId,
        section: form.section,
        day: form.day,
        periodNumber: Number(form.periodNumber),
        subjectId: form.subjectId,
        teacherId: form.teacherId,
        startTime: form.startTime,
        endTime: form.endTime,
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
      const normalizedErrorMessage = String(apiError?.message || '').toLowerCase();

      if (normalizedErrorMessage.includes('teacher already assigned')) {
        toast.error(apiError.message || 'Teacher already assigned to another class on this day');
      } else {
        toast.error(apiError.message || 'Failed to save timetable');
      }
    } finally {
      setSaving(false);
    }
  };

  const onEditRow = (row) => {
    setEditingId(toId(row));
    setForm({
      classId: toId(row?.classId),
      section: normalizeSection(row?.section),
      day: String(row?.day || TIMETABLE_DAYS[0]),
      periodNumber: String(row?.periodNumber || TIMETABLE_PERIODS[0]),
      subjectId: toId(row?.subjectId),
      teacherId: toId(row?.teacherId),
      startTime: String(row?.startTime || ''),
      endTime: String(row?.endTime || ''),
      roomNumber: String(row?.roomNumber || '')
    });
  };

  const onDeleteRow = async (row) => {
    const rowId = toId(row);
    if (!rowId) {
      return;
    }

    const confirmed = window.confirm('Delete this timetable entry?');
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
        description="Create, edit, and manage class timetable slots by class, section, day, and period."
      />

      <form onSubmit={onSaveTimetable} className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm md:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Class"
            value={form.classId}
            onChange={onFieldChange('classId')}
            options={classOptions}
            disabled={saving || loadingSetup}
            required
          />

          <Select
            label="Section"
            value={form.section}
            onChange={onFieldChange('section')}
            options={sectionOptions}
            disabled={saving || loadingSetup || !form.classId}
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
            disabled={saving || noPeriodsAvailable}
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

          <Select
            label="Teacher"
            value={form.teacherId}
            onChange={onFieldChange('teacherId')}
            options={teacherOptions}
            disabled={saving || !form.subjectId}
            required
          />

          <div className="mb-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Time Slot</p>
            {form.startTime && form.endTime ? (
              <p className="text-sm font-semibold text-slate-900">{form.startTime} - {form.endTime}</p>
            ) : (
              <p className="text-sm text-slate-500">Select an available period to auto-set the time slot.</p>
            )}
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

      <section className="rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="border-b border-red-100 px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-slate-900">Weekly Grid View</h2>
          <p className="text-xs text-slate-600">Subject, teacher, and timing details by day and period.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-red-700 text-red-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Day / Period</th>
                {TIMETABLE_PERIODS.map((periodNumber) => (
                  <th key={periodNumber} className="px-3 py-3 text-left font-semibold">
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
                    No timetable entries found for this class and section.
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
