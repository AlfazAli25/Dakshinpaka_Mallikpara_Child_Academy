'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Select from '@/components/Select';
import { get, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const toId = (value) => String(value?._id || value || '');

const toExamLabel = (exam) => {
  const name = String(exam?.examName || exam?.description || 'Exam').trim() || 'Exam';
  const examDate = exam?.examDate || exam?.date;

  if (!examDate) {
    return name;
  }

  const date = new Date(examDate);
  if (Number.isNaN(date.getTime())) {
    return name;
  }

  return `${name} (${date.toLocaleDateString()})`;
};

const buildRows = (students = [], marksByStudentId = new Map()) => {
  return students
    .map((student) => {
      const studentId = toId(student);
      const existing = marksByStudentId.get(studentId);

      return {
        studentId,
        studentName: student?.userId?.name || '-',
        rollNumber: student?.admissionNo || '-',
        markId: existing ? toId(existing) : '',
        marksObtained: existing?.marksObtained !== undefined ? String(existing.marksObtained) : '',
        maxMarks: existing?.maxMarks !== undefined ? String(existing.maxMarks) : '',
        remarks: String(existing?.remarks || '')
      };
    })
    .sort((left, right) => String(left.rollNumber || '').localeCompare(String(right.rollNumber || '')));
};

const validateRow = (row) => {
  const rawMarks = String(row.marksObtained || '').trim();
  const rawMax = String(row.maxMarks || '').trim();

  if (!rawMarks || !rawMax) {
    return 'Marks obtained and max marks are required';
  }

  const marks = Number(rawMarks);
  const max = Number(rawMax);

  if (!Number.isFinite(marks) || !Number.isFinite(max)) {
    return 'Marks must be numeric';
  }

  if (marks < 0 || max <= 0) {
    return 'Marks obtained must be 0 or greater and max marks must be greater than 0';
  }

  if (marks > max) {
    return 'Marks obtained cannot exceed max marks';
  }

  return '';
};

export default function TeacherMarksPage() {
  const toast = useToast();
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [exams, setExams] = useState([]);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');

  const [rows, setRows] = useState([]);
  const [savingStudentId, setSavingStudentId] = useState('');

  useEffect(() => {
    let active = true;

    const loadFilters = async () => {
      setLoadingFilters(true);
      try {
        const teacher = await getCurrentTeacherRecord();
        const { token } = getAuthContext();
        if (!teacher || !token) {
          if (active) {
            setClasses([]);
            setSubjects([]);
            setExams([]);
          }
          return;
        }

        const [classResponse, subjectResponse, examResponse] = await Promise.all([
          get('/classes', token),
          get('/subjects', token),
          get('/exams', token)
        ]);

        if (!active) {
          return;
        }

        setClasses(Array.isArray(classResponse.data) ? classResponse.data : []);
        setSubjects(Array.isArray(subjectResponse.data) ? subjectResponse.data : []);
        setExams(Array.isArray(examResponse.data) ? examResponse.data : []);
      } catch (apiError) {
        if (active) {
          setClasses([]);
          setSubjects([]);
          setExams([]);
          toast.error(apiError.message || 'Failed to load marks setup data');
        }
      } finally {
        if (active) {
          setLoadingFilters(false);
        }
      }
    };

    loadFilters();

    return () => {
      active = false;
    };
  }, [toast]);

  const classOptions = useMemo(
    () => [
      { value: '', label: 'Select class' },
      ...classes.map((item) => ({
        value: toId(item),
        label: formatClassLabel(item)
      }))
    ],
    [classes]
  );

  const subjectsForSelectedClass = useMemo(
    () => subjects.filter((item) => toId(item?.classId) === selectedClassId),
    [subjects, selectedClassId]
  );

  const subjectOptions = useMemo(
    () => [
      { value: '', label: 'Select subject' },
      ...subjectsForSelectedClass.map((item) => ({
        value: toId(item),
        label: String(item?.name || '-').trim() || '-'
      }))
    ],
    [subjectsForSelectedClass]
  );

  const examsForSelection = useMemo(
    () =>
      exams.filter(
        (exam) =>
          toId(exam?.classId) === selectedClassId &&
          toId(exam?.subjectId) === selectedSubjectId
      ),
    [exams, selectedClassId, selectedSubjectId]
  );

  const examOptions = useMemo(
    () => [
      { value: '', label: 'Select exam' },
      ...examsForSelection.map((exam) => ({
        value: toId(exam),
        label: toExamLabel(exam)
      }))
    ],
    [examsForSelection]
  );

  useEffect(() => {
    if (!selectedClassId || !selectedSubjectId || !selectedExamId) {
      setRows([]);
      return;
    }

    let active = true;

    const loadStudentsAndMarks = async () => {
      setLoadingStudents(true);
      try {
        const teacher = await getCurrentTeacherRecord();
        const { token } = getAuthContext();
        if (!teacher || !token) {
          if (active) {
            setRows([]);
          }
          return;
        }

        const [studentsResponse, marksResponse] = await Promise.all([
          get(`/students/class/${selectedClassId}`, token),
          get(
            `/marks/class/${selectedClassId}?subjectId=${selectedSubjectId}&examId=${selectedExamId}&page=1&limit=500`,
            token
          )
        ]);

        if (!active) {
          return;
        }

        const students = Array.isArray(studentsResponse.data) ? studentsResponse.data : [];
        const marks = Array.isArray(marksResponse.data) ? marksResponse.data : [];
        const marksByStudentId = new Map(
          marks.map((item) => [toId(item?.studentId), item])
        );

        setRows(buildRows(students, marksByStudentId));
      } catch (apiError) {
        if (active) {
          setRows([]);
          toast.error(apiError.message || 'Failed to load students for marks entry');
        }
      } finally {
        if (active) {
          setLoadingStudents(false);
        }
      }
    };

    loadStudentsAndMarks();

    return () => {
      active = false;
    };
  }, [selectedClassId, selectedSubjectId, selectedExamId, toast]);

  const onChangeClass = (event) => {
    setSelectedClassId(event.target.value);
    setSelectedSubjectId('');
    setSelectedExamId('');
    setRows([]);
  };

  const onChangeSubject = (event) => {
    setSelectedSubjectId(event.target.value);
    setSelectedExamId('');
    setRows([]);
  };

  const onChangeExam = (event) => {
    setSelectedExamId(event.target.value);
    setRows([]);
  };

  const updateRowField = (studentId, field, value) => {
    setRows((prev) =>
      prev.map((row) =>
        row.studentId === studentId
          ? {
              ...row,
              [field]: value
            }
          : row
      )
    );
  };

  const onSaveRow = async (studentId) => {
    const targetRow = rows.find((row) => row.studentId === studentId);
    if (!targetRow) {
      return;
    }

    if (!selectedClassId || !selectedSubjectId || !selectedExamId) {
      toast.error('Please select class, subject, and exam before saving marks');
      return;
    }

    const validationMessage = validateRow(targetRow);
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    const { token } = getAuthContext();
    if (!token) {
      toast.error('Session expired. Please login again.');
      return;
    }

    setSavingStudentId(studentId);

    const payload = {
      studentId,
      classId: selectedClassId,
      subjectId: selectedSubjectId,
      examId: selectedExamId,
      marksObtained: Number(targetRow.marksObtained),
      maxMarks: Number(targetRow.maxMarks),
      remarks: String(targetRow.remarks || '').trim()
    };

    try {
      const response = targetRow.markId
        ? await put(`/marks/${targetRow.markId}`, payload, token)
        : await post('/marks', payload, token);

      const persistedMarkId = toId(response?.data) || targetRow.markId;

      setRows((prev) =>
        prev.map((row) =>
          row.studentId === studentId
            ? {
                ...row,
                markId: persistedMarkId,
                marksObtained: String(payload.marksObtained),
                maxMarks: String(payload.maxMarks),
                remarks: payload.remarks
              }
            : row
        )
      );

      toast.success('Marks saved successfully');
    } catch (apiError) {
      if (apiError?.statusCode === 409) {
        toast.error('Marks already entered');
      } else {
        toast.error(apiError.message || 'Failed to save marks');
      }
    } finally {
      setSavingStudentId('');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Marks Entry"
        description="Select class, subject, and exam, then enter marks student-wise with validations."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Select
          label="Class"
          options={classOptions}
          value={selectedClassId}
          onChange={onChangeClass}
          disabled={loadingFilters}
        />

        <Select
          label="Subject"
          options={subjectOptions}
          value={selectedSubjectId}
          onChange={onChangeSubject}
          disabled={loadingFilters || !selectedClassId}
        />

        <Select
          label="Exam"
          options={examOptions}
          value={selectedExamId}
          onChange={onChangeExam}
          disabled={loadingFilters || !selectedClassId || !selectedSubjectId}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-red-700 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-red-50">Student Name</th>
                <th className="px-4 py-3 font-semibold text-red-50">Roll Number</th>
                <th className="px-4 py-3 font-semibold text-red-50">Marks Obtained</th>
                <th className="px-4 py-3 font-semibold text-red-50">Max Marks</th>
                <th className="px-4 py-3 font-semibold text-red-50">Remarks</th>
                <th className="px-4 py-3 font-semibold text-red-50">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingStudents ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`marks-skeleton-${index}`} className="border-t border-slate-100">
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))
              ) : !selectedClassId || !selectedSubjectId || !selectedExamId ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                    Select class, subject, and exam to fetch students.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                    No students found for this class.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const shouldShowInlineError =
                    String(row.marksObtained || '').trim() !== '' ||
                    String(row.maxMarks || '').trim() !== '';
                  const inlineError = shouldShowInlineError ? validateRow(row) : '';

                  return (
                    <tr
                      key={row.studentId || index}
                      className={`border-t border-slate-100 ${index % 2 === 1 ? 'bg-red-50/25' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-700">{row.studentName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.rollNumber}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.marksObtained}
                          onChange={(event) => updateRowField(row.studentId, 'marksObtained', event.target.value)}
                          className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={row.maxMarks}
                          onChange={(event) => updateRowField(row.studentId, 'maxMarks', event.target.value)}
                          className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(event) => updateRowField(row.studentId, 'remarks', event.target.value)}
                          placeholder="Optional remarks"
                          className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-600 focus:ring-2 focus:ring-red-100"
                        />
                        {inlineError ? <p className="mt-1 text-xs text-red-600">{inlineError}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onSaveRow(row.studentId)}
                          disabled={savingStudentId === row.studentId}
                          className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingStudentId === row.studentId
                            ? 'Saving...'
                            : row.markId
                              ? 'Update'
                              : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
