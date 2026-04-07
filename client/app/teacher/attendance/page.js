"use client";

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { del, get, post, put } from '@/lib/api';
import { getAuthContext } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const STUDENT_PAGE_SIZE = 50;
const HISTORY_PAGE_SIZE = 8;

const getTodayInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toClassNameKey = (classItem) => String(classItem?.name || '').trim();
const toSectionKey = (classItem) => String(classItem?.section || '').trim();

const formatDateValue = (value) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
};

const toNormalizedRollNo = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return parsed;
};

const sortStudentsByRollNo = (items = []) =>
  [...items].sort((left, right) => {
    const leftRollNo = toNormalizedRollNo(left?.rollNo);
    const rightRollNo = toNormalizedRollNo(right?.rollNo);

    if (leftRollNo !== rightRollNo) {
      return leftRollNo - rightRollNo;
    }

    const leftName = String(left?.userId?.name || '').toLowerCase();
    const rightName = String(right?.userId?.name || '').toLowerCase();
    return leftName.localeCompare(rightName);
  });

export default function TeacherAttendancePage() {
  const toast = useToast();
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingAttendanceId, setDeletingAttendanceId] = useState('');
  const [classRows, setClassRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [presentByStudentId, setPresentByStudentId] = useState({});
  const [attendanceIdByStudentId, setAttendanceIdByStudentId] = useState({});
  const [hasExistingAttendance, setHasExistingAttendance] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pendingEditDateKey, setPendingEditDateKey] = useState('');
  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayInputValue());
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasNextPage, setHistoryHasNextPage] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const todayInputValue = getTodayInputValue();

  const classNameOptions = useMemo(() => {
    const uniqueNames = [...new Set(classRows.map((item) => toClassNameKey(item)).filter(Boolean))];

    return [
      { value: '', label: 'Select Class' },
      ...uniqueNames.map((name) => ({ value: name, label: name }))
    ];
  }, [classRows]);

  const sectionOptions = useMemo(() => {
    const sections = classRows
      .filter((item) => toClassNameKey(item) === selectedClassName)
      .map((item) => toSectionKey(item))
      .filter(Boolean);

    const uniqueSections = [...new Set(sections)];
    return [
      { value: '', label: 'Select Section' },
      ...uniqueSections.map((section) => ({ value: section, label: section }))
    ];
  }, [classRows, selectedClassName]);

  const selectedClassId = useMemo(() => {
    const selectedClass = classRows.find(
      (item) => toClassNameKey(item) === selectedClassName && toSectionKey(item) === selectedSection
    );

    return selectedClass?._id ? String(selectedClass._id) : '';
  }, [classRows, selectedClassName, selectedSection]);

  useEffect(() => {
    const loadAssignedClasses = async () => {
      setLoadingClasses(true);
      try {
        const { token } = getAuthContext();
        if (!token) {
          setClassRows([]);
          return;
        }

        const response = await get('/classes', token);
        const nextClasses = Array.isArray(response.data) ? response.data : [];
        setClassRows(nextClasses);
      } catch (_error) {
        setClassRows([]);
      } finally {
        setLoadingClasses(false);
      }
    };

    loadAssignedClasses();
  }, []);

  useEffect(() => {
    if (!selectedClassName && classNameOptions.length > 1) {
      setSelectedClassName(classNameOptions[1].value);
    }
  }, [classNameOptions, selectedClassName]);

  useEffect(() => {
    const availableSections = sectionOptions.map((item) => item.value).filter(Boolean);
    if (availableSections.length === 0) {
      if (selectedSection) {
        setSelectedSection('');
      }
      return;
    }

    if (!availableSections.includes(selectedSection)) {
      setSelectedSection(availableSections[0]);
    }
  }, [sectionOptions, selectedSection]);

  useEffect(() => {
    setPage(1);
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedClassId]);

  useEffect(() => {
    const loadAttendanceHistory = async () => {
      if (!selectedClassId) {
        setHistoryRows([]);
        setHistoryHasNextPage(false);
        return;
      }

      setLoadingHistory(true);
      try {
        const { token } = getAuthContext();
        if (!token) {
          setHistoryRows([]);
          setHistoryHasNextPage(false);
          return;
        }

        const response = await get(
          `/attendance?classId=${selectedClassId}&page=${historyPage}&limit=${HISTORY_PAGE_SIZE}`,
          token,
          {
            forceRefresh: true,
            cacheTtlMs: 0
          }
        );

        const rows = Array.isArray(response.data) ? response.data : [];
        const pagination = response.pagination || {};

        setHistoryRows(rows);
        if (Number.isFinite(Number(pagination.totalPages)) && Number(pagination.totalPages) > 0) {
          setHistoryHasNextPage(Number(historyPage) < Number(pagination.totalPages));
        } else {
          setHistoryHasNextPage(rows.length === HISTORY_PAGE_SIZE);
        }
      } catch (_error) {
        setHistoryRows([]);
        setHistoryHasNextPage(false);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadAttendanceHistory();
  }, [selectedClassId, historyPage, reloadKey]);

  useEffect(() => {
    const loadStudentsAndAttendance = async () => {
      if (!selectedClassId || !selectedDate) {
        setStudents([]);
        setPresentByStudentId({});
        setAttendanceIdByStudentId({});
        setHasExistingAttendance(false);
        setEditMode(false);
        setPendingEditDateKey('');
        setHasNextPage(false);
        return;
      }

      setLoadingStudents(true);
      try {
        const { token } = getAuthContext();
        if (!token) {
          setStudents([]);
          setPresentByStudentId({});
          setAttendanceIdByStudentId({});
          setHasExistingAttendance(false);
          setEditMode(false);
          setPendingEditDateKey('');
          setHasNextPage(false);
          return;
        }

        const [studentsResponse, attendanceResponse] = await Promise.all([
          get(`/students?classId=${selectedClassId}&_sort=rollNo&_order=asc&_page=${page}&_limit=${STUDENT_PAGE_SIZE}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          }),
          get(`/attendance?classId=${selectedClassId}&date=${selectedDate}&page=${page}&limit=${STUDENT_PAGE_SIZE}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          })
        ]);

        const studentRows = sortStudentsByRollNo(Array.isArray(studentsResponse.data) ? studentsResponse.data : []);
        const attendanceRows = Array.isArray(attendanceResponse.data) ? attendanceResponse.data : [];
        const attendanceIdMap = {};
        const attendanceByStudentId = new Map(
          attendanceRows.map((item) => {
            const studentId = String(item.studentId?._id || item.studentId || '');
            if (studentId && item._id) {
              attendanceIdMap[studentId] = String(item._id);
            }
            return [studentId, item];
          })
        );

        const nextPresenceMap = {};
        for (const student of studentRows) {
          const studentId = String(student._id || '');
          const attendanceEntry = attendanceByStudentId.get(studentId);
          nextPresenceMap[studentId] =
            String(attendanceEntry?.status || '').toLowerCase() === 'present';
        }

        setStudents(studentRows);
        setPresentByStudentId(nextPresenceMap);
        setAttendanceIdByStudentId(attendanceIdMap);
        setHasExistingAttendance(attendanceRows.length > 0);
        const shouldAutoEnableEdit =
          Boolean(pendingEditDateKey) &&
          String(pendingEditDateKey) === String(selectedDate) &&
          attendanceRows.length > 0 &&
          selectedDate <= todayInputValue;

        setEditMode(shouldAutoEnableEdit);
        if (pendingEditDateKey) {
          setPendingEditDateKey('');
        }
        setHasNextPage(studentRows.length === STUDENT_PAGE_SIZE);
      } catch (_error) {
        setStudents([]);
        setPresentByStudentId({});
        setAttendanceIdByStudentId({});
        setHasExistingAttendance(false);
        setEditMode(false);
        setPendingEditDateKey('');
        setHasNextPage(false);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudentsAndAttendance();
  }, [selectedClassId, selectedDate, page, reloadKey]);

  const onTogglePresent = (studentId, checked) => {
    setPresentByStudentId((prev) => ({
      ...prev,
      [studentId]: Boolean(checked)
    }));
  };

  const onOpenHistoryDate = (dateKey) => {
    const normalizedDateKey = String(dateKey || '').trim();
    if (!normalizedDateKey) {
      return;
    }

    if (normalizedDateKey > todayInputValue) {
      toast.error('Attendance cannot be marked for future date');
      return;
    }

    if (normalizedDateKey === selectedDate) {
      if (hasExistingAttendance) {
        setEditMode(true);
      }
      return;
    }

    setPendingEditDateKey(normalizedDateKey);
    setSelectedDate(normalizedDateKey);
    setPage(1);
  };

  const onSaveAttendance = async () => {
    if (selectedDate > todayInputValue) {
      toast.error('Attendance cannot be marked for future date');
      return;
    }

    if (!selectedClassId) {
      toast.error('Class must be selected');
      return;
    }

    if (!selectedDate) {
      toast.error('Date must be selected');
      return;
    }

    if (students.length === 0) {
      toast.error('Students must exist');
      return;
    }

    const { token } = getAuthContext();
    if (!token) {
      toast.error('Session expired. Please login again.');
      return;
    }

    const payload = students.map((student) => {
      const studentId = String(student._id || '');
      return {
        studentId,
        classId: selectedClassId,
        date: selectedDate,
        status: presentByStudentId[studentId] ? 'Present' : 'Absent'
      };
    });

    setSaving(true);
    try {
      if (hasExistingAttendance) {
        if (!editMode) {
          toast.error('Attendance already saved. Click Edit Attendance to modify.');
          return;
        }

        const recordsWithIds = payload.map((item) => ({
          ...item,
          attendanceId: attendanceIdByStudentId[item.studentId] || ''
        }));
        const updates = recordsWithIds.filter((item) => item.attendanceId);
        const creates = recordsWithIds
          .filter((item) => !item.attendanceId)
          .map(({ attendanceId, ...rest }) => rest);

        if (updates.length > 0) {
          await Promise.all(
            updates.map(({ attendanceId, ...rest }) => put(`/attendance/${attendanceId}`, rest, token))
          );
        }

        if (creates.length > 0) {
          await post('/attendance', creates, token);
        }

        toast.success('Attendance updated successfully');
      } else {
        await post('/attendance', payload, token);
        toast.success('Attendance saved successfully');
      }

      setEditMode(false);
      setReloadKey((prev) => prev + 1);
    } catch (apiError) {
      if (apiError?.statusCode === 409) {
        toast.error('Attendance already marked for this date');
      } else {
        toast.error(apiError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const onDeleteAttendanceForStudent = async (studentId) => {
    const attendanceId = String(attendanceIdByStudentId[studentId] || '');
    if (!attendanceId) {
      toast.error('No saved attendance found for this student on selected date.');
      return;
    }

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('Delete attendance for this student on the selected date?');
    if (!confirmed) {
      return;
    }

    const { token } = getAuthContext();
    if (!token) {
      toast.error('Session expired. Please login again.');
      return;
    }

    setDeletingAttendanceId(attendanceId);
    try {
      await del(`/attendance/${attendanceId}`, token);
      toast.success('Attendance deleted successfully');
      setReloadKey((prev) => prev + 1);
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setDeletingAttendanceId('');
    }
  };

  const showStudentTable = Boolean(selectedClassId && selectedDate);
  const canModifyAttendance = (!hasExistingAttendance || editMode) && selectedDate <= todayInputValue;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Mark Attendance"
        description="Select class, section, and date, then mark Present using checkboxes (unchecked is Absent)."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label="Class"
            options={classNameOptions}
            value={selectedClassName}
            onChange={(event) => setSelectedClassName(event.target.value)}
            disabled={loadingClasses || classNameOptions.length <= 1}
            className="h-11"
          />
          <Select
            label="Section"
            options={sectionOptions}
            value={selectedSection}
            onChange={(event) => setSelectedSection(event.target.value)}
            disabled={loadingClasses || sectionOptions.length <= 1 || !selectedClassName}
            className="h-11"
          />
          <Input
            label="Date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            max={todayInputValue}
            className="h-11"
          />
        </div>
      </div>

      {selectedClassId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Attendance History</h3>
          </div>

          {loadingHistory ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`attendance-history-loading-${index}`} className="h-14 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-slate-500">No saved attendance dates for this class yet.</p>
          ) : (
            <div className="space-y-2">
              {historyRows.map((item, index) => {
                const dateKey = String(item.dateKey || '');
                const isSelected = dateKey && dateKey === selectedDate;
                return (
                  <button
                    key={`${dateKey || 'history'}-${index}`}
                    type="button"
                    onClick={() => onOpenHistoryDate(dateKey)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                      isSelected
                        ? 'border-red-300 bg-red-50'
                        : 'border-slate-200 bg-white hover:border-red-200 hover:bg-red-50/40'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{formatDateValue(item.date)}</p>
                      <p className="text-xs text-slate-600">
                        Present: {Number(item.presentCount || 0)} | Absent: {Number(item.absentCount || 0)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-red-700">Open & Edit</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={historyPage <= 1 || loadingHistory}
              onClick={() => setHistoryPage((prev) => Math.max(prev - 1, 1))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">Page {historyPage}</span>
            <button
              type="button"
              disabled={!historyHasNextPage || loadingHistory}
              onClick={() => setHistoryPage((prev) => prev + 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showStudentTable && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Attendance Table</h3>
            <div className="flex flex-wrap items-center gap-2">
              {hasExistingAttendance && !editMode && (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  disabled={loadingStudents || saving || selectedDate > todayInputValue}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit Attendance
                </button>
              )}

              {hasExistingAttendance && editMode && (
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  disabled={saving}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel Edit
                </button>
              )}

              <button
                type="button"
                onClick={onSaveAttendance}
                disabled={saving || loadingStudents || students.length === 0 || !canModifyAttendance || Boolean(deletingAttendanceId)}
                className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? hasExistingAttendance
                    ? 'Updating...'
                    : 'Saving...'
                  : hasExistingAttendance
                    ? editMode
                      ? 'Update Attendance'
                      : 'Attendance Saved'
                    : 'Save Attendance'}
              </button>
            </div>
          </div>

          {selectedDate > todayInputValue && (
            <p className="mb-3 text-sm text-amber-700">Attendance cannot be marked for future date.</p>
          )}

          {hasExistingAttendance && !editMode && selectedDate <= todayInputValue && (
            <p className="mb-3 text-sm text-slate-600">Attendance already saved for this date. Click Edit Attendance to modify.</p>
          )}

          <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-red-700 text-left text-red-50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Roll Number</th>
                  <th className="px-4 py-3 font-semibold">Student Name</th>
                  <th className="px-4 py-3 font-semibold">Attendance</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingStudents ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`attendance-loading-${index}`} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-10 animate-pulse rounded bg-slate-200" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-14 animate-pulse rounded bg-slate-200" />
                      </td>
                    </tr>
                  ))
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No students found for the selected class and section.
                    </td>
                  </tr>
                ) : (
                  students.map((student, index) => {
                    const studentId = String(student._id || '');
                    const isPresent = Boolean(presentByStudentId[studentId]);

                    return (
                      <tr
                        key={studentId || index}
                        className={`border-t border-slate-100 ${index % 2 === 1 ? 'bg-red-50/25' : ''}`}
                      >
                        <td className="px-4 py-3 text-slate-700">{student.rollNo || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{student.userId?.name || '-'}</td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={isPresent}
                              disabled={saving || loadingStudents || !canModifyAttendance}
                              onChange={(event) => onTogglePresent(studentId, event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-red-700 focus:ring-red-200"
                            />
                            <span>{isPresent ? 'Present' : 'Absent'}</span>
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          {attendanceIdByStudentId[studentId] ? (
                            <button
                              type="button"
                              onClick={() => onDeleteAttendanceForStudent(studentId)}
                              disabled={saving || loadingStudents || Boolean(deletingAttendanceId)}
                              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingAttendanceId && deletingAttendanceId === attendanceIdByStudentId[studentId]
                                ? 'Deleting...'
                                : 'Delete'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={page <= 1 || loadingStudents}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">Page {page}</span>
            <button
              type="button"
              disabled={!hasNextPage || loadingStudents}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}