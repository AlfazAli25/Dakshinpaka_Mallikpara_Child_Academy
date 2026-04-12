'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import Select from '@/components/Select';
import { get, post, put } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const toId = (value) => String(value?._id || value || '');

const examIncludesSubject = (exam, subjectId = '') => {
  const normalizedSubjectId = String(subjectId || '').trim();
  if (!normalizedSubjectId) {
    return false;
  }

  const subjectIds = Array.isArray(exam?.subjects)
    ? exam.subjects.map((item) => toId(item)).filter(Boolean)
    : [];

  if (subjectIds.length > 0) {
    return subjectIds.includes(normalizedSubjectId);
  }

  const legacySubjectId = toId(exam?.subjectId);
  return legacySubjectId ? legacySubjectId === normalizedSubjectId : true;
};

const getExamScheduleForSubject = (exam, subjectId = '') => {
  const normalizedSubjectId = String(subjectId || '').trim();
  const scheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];

  if (normalizedSubjectId && scheduleRows.length > 0) {
    const matchedSlot = scheduleRows.find((slot) => toId(slot?.subjectId) === normalizedSubjectId);
    if (matchedSlot) {
      return {
        startDate: matchedSlot?.startDate,
        endDate: matchedSlot?.endDate
      };
    }
  }

  if (scheduleRows.length > 0) {
    if (!examIncludesSubject(exam, normalizedSubjectId)) {
      return { startDate: null, endDate: null };
    }

    return {
      startDate: scheduleRows[0]?.startDate,
      endDate: scheduleRows[0]?.endDate
    };
  }

  const fallbackStartDate = exam?.startDate || exam?.examDate || exam?.date;
  return {
    startDate: fallbackStartDate,
    endDate: exam?.endDate || fallbackStartDate
  };
};

const isExamConductedForSubject = (exam, subjectId = '') => {
  const { endDate } = getExamScheduleForSubject(exam, subjectId);
  const parsedEndDate = endDate ? new Date(endDate) : null;

  if (!parsedEndDate || Number.isNaN(parsedEndDate.getTime())) {
    return false;
  }

  return parsedEndDate.getTime() <= Date.now();
};

const toExamLabel = (exam, subjectId = '') => {
  const name = String(exam?.examName || exam?.description || 'Exam').trim() || 'Exam';
  const { startDate } = getExamScheduleForSubject(exam, subjectId);
  const examDate = startDate || exam?.examDate || exam?.date;

  if (!examDate) {
    return name;
  }

  const date = new Date(examDate);
  if (Number.isNaN(date.getTime())) {
    return name;
  }

  return `${name} (${date.toLocaleDateString('en-GB')})`;
};

const deriveCommonMaxMarks = (marks = []) => {
  const values = marks
    .map((item) => Number(item?.maxMarks))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) {
    return '';
  }

  return String(values[0]);
};

const formatPercentage = ({ marksObtained, maxMarks, fallbackPercentage }) => {
  const obtained = Number(marksObtained);
  const total = Number(maxMarks);

  if (Number.isFinite(obtained) && Number.isFinite(total) && total > 0) {
    return `${((obtained / total) * 100).toFixed(2)}%`;
  }

  const fallback = Number(fallbackPercentage);
  if (Number.isFinite(fallback)) {
    return `${fallback.toFixed(2)}%`;
  }

  return '-';
};

const toRollNumberValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const buildRows = (students = [], marksByStudentId = new Map()) => {
  return students
    .map((student) => {
      const studentId = toId(student);
      const existing = marksByStudentId.get(studentId);
      const rollNoValue = toRollNumberValue(student?.rollNo);

      return {
        studentId,
        studentName: student?.userId?.name || '-',
        rollNumber: rollNoValue === null ? '-' : String(rollNoValue),
        rollNoValue,
        markId: existing ? toId(existing) : '',
        marksObtained: existing?.marksObtained !== undefined ? String(existing.marksObtained) : '',
        maxMarksFromRecord: existing?.maxMarks !== undefined ? Number(existing.maxMarks) : null,
        percentageFromRecord: existing?.percentage !== undefined ? Number(existing.percentage) : null
      };
    })
    .sort((left, right) => {
      const leftRoll = left.rollNoValue;
      const rightRoll = right.rollNoValue;

      if (leftRoll !== null && rightRoll !== null) {
        return leftRoll - rightRoll;
      }

      if (leftRoll !== null) {
        return -1;
      }

      if (rightRoll !== null) {
        return 1;
      }

      return String(left.studentName || '').localeCompare(String(right.studentName || ''));
    });
};

const validateRow = (row, maxMarksInput) => {
  const rawMarks = String(row.marksObtained || '').trim();
  const rawMax = String(maxMarksInput || '').trim();

  if (!rawMax) {
    return 'Set max marks once before saving';
  }

  if (!rawMarks) {
    return 'Marks obtained is required';
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

  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedClassSection, setSelectedClassSection] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [maxMarksInput, setMaxMarksInput] = useState('');

  const [rows, setRows] = useState([]);
  const [savingStudentId, setSavingStudentId] = useState('');
  const [savingAll, setSavingAll] = useState(false);

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

  const examOptions = useMemo(
    () => [
      { value: '', label: 'Select exam' },
      ...exams.map((exam) => {
        const name = String(exam?.examName || 'Exam').trim();
        const year = exam?.academicYear ? ` (${exam.academicYear})` : '';
        const className = String(exam?.classId?.name || '').trim();
        const section = String(exam?.classId?.section || '').trim();
        const classLabel = className ? (section ? `${className}(${section})` : className) : '';
        const label = classLabel ? `${name} — ${classLabel}${year}` : `${name}${year}`;
        return { value: toId(exam), label };
      })
    ],
    [exams]
  );

  const uniqueClassNames = useMemo(() => {
    if (selectedExamId) {
      const exam = exams.find((e) => toId(e) === selectedExamId);
      const examClassId = toId(exam?.classId);
      if (examClassId) {
        const matchedClass = classes.find((c) => toId(c) === examClassId);
        if (matchedClass?.name) return [matchedClass.name];
      }
    }
    return Array.from(new Set(classes.map((c) => c.name))).sort();
  }, [classes, exams, selectedExamId]);

  const classNameFilterOptions = useMemo(
    () => [
      { value: '', label: 'Select class' },
      ...uniqueClassNames.map((name) => ({ value: name, label: name }))
    ],
    [uniqueClassNames]
  );

  const availableSections = useMemo(() => {
    if (!selectedClassName) return [];
    return classes
      .filter((c) => c.name === selectedClassName)
      .map((c) => c.section || '')
      .sort();
  }, [classes, selectedClassName]);

  const classSectionFilterOptions = useMemo(
    () => [
      { value: '', label: selectedClassName ? 'Select section' : 'Select class first' },
      ...availableSections.map((section) => ({
        value: section,
        label: section || '(No Section)'
      }))
    ],
    [availableSections, selectedClassName]
  );

  const subjectsForSelectedClass = useMemo(
    () => subjects.filter((item) => toId(item?.classId) === selectedClassId),
    [subjects, selectedClassId]
  );

  const subjectOptions = useMemo(
    () => [
      { value: '', label: selectedClassId ? 'Select subject' : 'Select class first' },
      ...subjectsForSelectedClass.map((item) => ({
        value: toId(item),
        label: String(item?.name || '-').trim() || '-'
      }))
    ],
    [subjectsForSelectedClass, selectedClassId]
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
        setMaxMarksInput(deriveCommonMaxMarks(marks));
      } catch (apiError) {
        if (active) {
          setRows([]);
          setMaxMarksInput('');
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

  const onChangeExam = (event) => {
    const nextExamId = event.target.value;
    setSelectedExamId(nextExamId);
    
    if (nextExamId) {
      const exam = exams.find((e) => toId(e) === nextExamId);
      const examClassId = toId(exam?.classId);
      const matchedClass = examClassId ? classes.find((c) => toId(c) === examClassId) : null;
      if (matchedClass) {
        setSelectedClassName(matchedClass.name);
        setSelectedClassSection(matchedClass.section || '');
        setSelectedClassId(toId(matchedClass));
      } else {
        setSelectedClassName('');
        setSelectedClassSection('');
        setSelectedClassId('');
      }
    } else {
      setSelectedClassName('');
      setSelectedClassSection('');
      setSelectedClassId('');
    }
    
    setSelectedSubjectId('');
    setMaxMarksInput('');
    setRows([]);
  };

  const onChangeClassName = (event) => {
    const nextClassName = event.target.value;
    setSelectedClassName(nextClassName);
    setSelectedClassSection('');
    
    const sectionsForName = classes
      .filter((c) => c.name === nextClassName)
      .map((c) => c.section || '')
      .sort();
      
    if (!nextClassName) {
      setSelectedClassId('');
    } else if (sectionsForName.length === 1) {
      const matched = classes.find(
        (c) => c.name === nextClassName && (c.section || '') === sectionsForName[0]
      );
      setSelectedClassId(matched ? toId(matched) : '');
    } else {
      setSelectedClassId('');
    }
    
    setSelectedSubjectId('');
    setMaxMarksInput('');
    setRows([]);
  };

  const onChangeClassSection = (event) => {
    const nextSection = event.target.value;
    setSelectedClassSection(nextSection);
    const matched = classes.find(
      (c) => c.name === selectedClassName && (c.section || '') === nextSection
    );
    setSelectedClassId(matched ? toId(matched) : '');
    setSelectedSubjectId('');
    setMaxMarksInput('');
    setRows([]);
  };

  const onChangeSubject = (event) => {
    setSelectedSubjectId(event.target.value);
    setMaxMarksInput('');
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

  const persistRowMark = async (targetRow, token) => {
    const payload = {
      studentId: targetRow.studentId,
      classId: selectedClassId,
      subjectId: selectedSubjectId,
      examId: selectedExamId,
      marksObtained: Number(targetRow.marksObtained),
      maxMarks: Number(maxMarksInput)
    };

    try {
      const response = targetRow.markId
        ? await put(`/marks/${targetRow.markId}`, payload, token)
        : await post('/marks', payload, token);

      const persistedMarkId = toId(response?.data) || targetRow.markId;
      const persistedPercentage = Number(response?.data?.percentage);

      setRows((prev) =>
        prev.map((row) =>
          row.studentId === targetRow.studentId
            ? {
                ...row,
                markId: persistedMarkId,
                marksObtained: String(payload.marksObtained),
                maxMarksFromRecord: payload.maxMarks,
                percentageFromRecord: Number.isFinite(persistedPercentage)
                  ? persistedPercentage
                  : row.percentageFromRecord
              }
            : row
        )
      );

      return { ok: true };
    } catch (apiError) {
      if (apiError?.statusCode === 409) {
        return { ok: false, message: 'Marks already entered' };
      }

      return { ok: false, message: apiError.message || 'Failed to save marks' };
    }
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

    const validationMessage = validateRow(targetRow, maxMarksInput);
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

    try {
      const result = await persistRowMark(targetRow, token);
      if (result.ok) {
        toast.success('Marks saved successfully');
      } else {
        toast.error(result.message);
      }
    } finally {
      setSavingStudentId('');
    }
  };

  const onSaveAllRows = async () => {
    if (!selectedClassId || !selectedSubjectId || !selectedExamId) {
      toast.error('Please select class, subject, and exam before saving marks');
      return;
    }

    const rowsToSave = rows.filter((row) => String(row.marksObtained || '').trim() !== '');
    if (rowsToSave.length === 0) {
      toast.error('Enter marks for at least one student before using Save All');
      return;
    }

    for (const row of rowsToSave) {
      const validationMessage = validateRow(row, maxMarksInput);
      if (validationMessage) {
        toast.error(`${validationMessage} (${row.studentName})`);
        return;
      }
    }

    const { token } = getAuthContext();
    if (!token) {
      toast.error('Session expired. Please login again.');
      return;
    }

    setSavingAll(true);

    try {
      let successCount = 0;
      const failures = [];

      for (const row of rowsToSave) {
        setSavingStudentId(row.studentId);
        const result = await persistRowMark(row, token);

        if (result.ok) {
          successCount += 1;
        } else {
          failures.push({
            studentName: row.studentName,
            message: result.message
          });
        }
      }

      if (failures.length === 0) {
        toast.success(`Marks saved for ${successCount} student${successCount === 1 ? '' : 's'}`);
      } else {
        const firstFailure = failures[0];
        toast.error(
          `Saved ${successCount} student${successCount === 1 ? '' : 's'}, failed ${failures.length}. ${firstFailure.studentName}: ${firstFailure.message}`
        );
      }
    } finally {
      setSavingAll(false);
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
          label="Exam"
          options={examOptions}
          value={selectedExamId}
          onChange={onChangeExam}
          disabled={loadingFilters}
        />

        <Select
          label="Class"
          options={classNameFilterOptions}
          value={selectedClassName}
          onChange={onChangeClassName}
          disabled={loadingFilters}
        />

        <Select
          label="Section"
          options={classSectionFilterOptions}
          value={selectedClassSection}
          onChange={onChangeClassSection}
          disabled={loadingFilters || !selectedClassName}
        />

        <Select
          label="Subject"
          options={subjectOptions}
          value={selectedSubjectId}
          onChange={onChangeSubject}
          disabled={loadingFilters || !selectedClassId}
        />

        <Input
          label="Max Marks (for this subject)"
          type="number"
          min="1"
          step="0.01"
          value={maxMarksInput}
          onChange={(event) => setMaxMarksInput(event.target.value)}
          className="h-11"
          placeholder="Example: 100"
          disabled={!selectedClassId || !selectedSubjectId || !selectedExamId || loadingStudents}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="max-h-[288px] overflow-x-auto overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-red-700 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-red-50">Student Name</th>
                <th className="px-4 py-3 font-semibold text-red-50">Roll Number</th>
                <th className="px-4 py-3 font-semibold text-red-50">Marks Obtained</th>
                <th className="px-4 py-3 font-semibold text-red-50">Percentage</th>
                <th className="px-4 py-3 font-semibold text-red-50">
                  <div className="flex items-center justify-between gap-2">
                    <span>Actions</span>
                    <button
                      type="button"
                      onClick={onSaveAllRows}
                      disabled={
                        savingAll ||
                        loadingStudents ||
                        !selectedClassId ||
                        !selectedSubjectId ||
                        !selectedExamId ||
                        rows.length === 0
                      }
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingAll ? 'Saving All...' : 'Save All'}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingStudents ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`marks-skeleton-${index}`} className="border-t border-slate-100">
                    <td className="px-4 py-3" colSpan={5}>
                      <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))
              ) : !selectedClassId || !selectedSubjectId || !selectedExamId ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                    Select class, subject, and conducted exam to fetch students.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                    No students found for this class.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const inlineError = String(row.marksObtained || '').trim() !== '' ? validateRow(row, maxMarksInput) : '';
                  const effectiveMaxMarks = Number(maxMarksInput || row.maxMarksFromRecord || 0);
                  const percentageLabel = formatPercentage({
                    marksObtained: row.marksObtained,
                    maxMarks: effectiveMaxMarks,
                    fallbackPercentage: row.percentageFromRecord
                  });

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
                        {inlineError ? <p className="mt-1 text-xs text-red-600">{inlineError}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{percentageLabel}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onSaveRow(row.studentId)}
                          disabled={savingAll || savingStudentId === row.studentId}
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
