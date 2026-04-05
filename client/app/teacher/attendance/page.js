"use client";

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { get, post } from '@/lib/api';
import { getAuthContext } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const STUDENT_PAGE_SIZE = 50;

const getTodayInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toClassNameKey = (classItem) => String(classItem?.name || '').trim();
const toSectionKey = (classItem) => String(classItem?.section || '').trim();

export default function TeacherAttendancePage() {
  const toast = useToast();
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classRows, setClassRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [presentByStudentId, setPresentByStudentId] = useState({});
  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayInputValue());
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

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
    const loadStudentsAndAttendance = async () => {
      if (!selectedClassId || !selectedDate) {
        setStudents([]);
        setPresentByStudentId({});
        setHasNextPage(false);
        return;
      }

      setLoadingStudents(true);
      try {
        const { token } = getAuthContext();
        if (!token) {
          setStudents([]);
          setPresentByStudentId({});
          setHasNextPage(false);
          return;
        }

        const [studentsResponse, attendanceResponse] = await Promise.all([
          get(`/students?classId=${selectedClassId}&_page=${page}&_limit=${STUDENT_PAGE_SIZE}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          }),
          get(`/attendance?classId=${selectedClassId}&date=${selectedDate}&page=${page}&limit=${STUDENT_PAGE_SIZE}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          })
        ]);

        const studentRows = Array.isArray(studentsResponse.data) ? studentsResponse.data : [];
        const attendanceRows = Array.isArray(attendanceResponse.data) ? attendanceResponse.data : [];
        const attendanceByStudentId = new Map(
          attendanceRows.map((item) => [String(item.studentId?._id || item.studentId || ''), item])
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
        setHasNextPage(studentRows.length === STUDENT_PAGE_SIZE);
      } catch (_error) {
        setStudents([]);
        setPresentByStudentId({});
        setHasNextPage(false);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudentsAndAttendance();
  }, [selectedClassId, selectedDate, page]);

  const onTogglePresent = (studentId, checked) => {
    setPresentByStudentId((prev) => ({
      ...prev,
      [studentId]: Boolean(checked)
    }));
  };

  const onSaveAttendance = async () => {
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
      await post('/attendance', payload, token);
      toast.success('Attendance saved successfully');
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

  const showStudentTable = Boolean(selectedClassId && selectedDate);

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
            className="h-11"
          />
        </div>
      </div>

      {showStudentTable && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Attendance Table</h3>
            <button
              type="button"
              onClick={onSaveAttendance}
              disabled={saving || loadingStudents || students.length === 0}
              className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Attendance'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-red-700 text-left text-red-50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Roll Number</th>
                  <th className="px-4 py-3 font-semibold">Student Name</th>
                  <th className="px-4 py-3 font-semibold">Present</th>
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
                    </tr>
                  ))
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
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
                        <td className="px-4 py-3 text-slate-700">{student.admissionNo || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{student.userId?.name || '-'}</td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={isPresent}
                              onChange={(event) => onTogglePresent(studentId, event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-red-700 focus:ring-red-200"
                            />
                            <span>{isPresent ? 'Present' : 'Absent'}</span>
                          </label>
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