'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Select from '@/components/Select';
import Input from '@/components/Input';
import { del, get, getBlob } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const toId = (value) => String(value?._id || value || '');

const downloadBlob = (blob, filename) => {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
};

const formatExamLabel = (exam) => {
  const examName = String(exam?.examName || exam?.description || 'Exam').trim() || 'Exam';
  const dateValue = exam?.examDate || exam?.date;
  if (!dateValue) {
    return examName;
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return examName;
  }

  return `${examName} (${date.toLocaleDateString('en-GB')})`;
};

const toRollNumberLabel = (student = {}) => {
  const numericRoll = Number(student?.rollNo);
  if (Number.isFinite(numericRoll) && numericRoll > 0) {
    return String(Math.floor(numericRoll));
  }

  return String(student?.admissionNo || '-').trim() || '-';
};

const mapMarksToRows = (items) =>
  (Array.isArray(items) ? items : []).map((item) => {
    const id = String(item?._id || '');
    const numericPercentage = Number(item?.percentage);

    return {
      id,
      studentId: toId(item?.studentId),
      studentName: item?.studentId?.userId?.name || '-',
      rollNumber: toRollNumberLabel(item?.studentId),
      className: formatClassLabel(item?.classId),
      subjectName: item?.subjectId?.name || item?.subjectId?.code || '-',
      examName: String(item?.examId?.examName || item?.examId?.description || '-').trim() || '-',
      marks: `${item?.marksObtained ?? 0}/${item?.maxMarks ?? 0}`,
      percentage: Number.isFinite(numericPercentage) ? `${numericPercentage.toFixed(2)}%` : '-',
      grade: item?.grade || '-',
      remarks: item?.remarks || '-'
    };
  });

export default function AdminMarksPage() {
  const toast = useToast();

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [deletingMarkId, setDeletingMarkId] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [classOptionsRaw, setClassOptionsRaw] = useState([]);
  const [subjectOptionsRaw, setSubjectOptionsRaw] = useState([]);
  const [examOptionsRaw, setExamOptionsRaw] = useState([]);
  const [studentOptionsRaw, setStudentOptionsRaw] = useState([]);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchText, setSearchText] = useState('');

  const [reportCardClassId, setReportCardClassId] = useState('');
  const [reportCardSection, setReportCardSection] = useState('');
  const [downloadingReportCardsZip, setDownloadingReportCardsZip] = useState(false);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  });

  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error, toast]);

  useEffect(() => {
    if (message) {
      toast.success(message);
    }
  }, [message, toast]);

  useEffect(() => {
    let active = true;

    const loadSetup = async () => {
      setLoadingSetup(true);
      try {
        const token = getToken();
        const [classesRes, subjectsRes, examsRes] = await Promise.all([
          get('/classes', token),
          get('/subjects', token),
          get('/exams', token)
        ]);

        if (!active) {
          return;
        }

        setClassOptionsRaw(Array.isArray(classesRes.data) ? classesRes.data : []);
        setSubjectOptionsRaw(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);
        setExamOptionsRaw(Array.isArray(examsRes.data) ? examsRes.data : []);
      } catch (apiError) {
        if (active) {
          setError(apiError.message || 'Failed to load marks setup data');
        }
      } finally {
        if (active) {
          setLoadingSetup(false);
        }
      }
    };

    loadSetup();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadStudentsByClass = async () => {
      if (!selectedClassId) {
        setStudentOptionsRaw([]);
        setSelectedStudentId('');
        return;
      }

      try {
        const response = await get(`/students/class/${selectedClassId}`, getToken());
        if (!active) {
          return;
        }

        setStudentOptionsRaw(Array.isArray(response.data) ? response.data : []);
      } catch (apiError) {
        if (active) {
          setStudentOptionsRaw([]);
          setSelectedStudentId('');
          setError(apiError.message || 'Failed to load class students');
        }
      }
    };

    loadStudentsByClass();

    return () => {
      active = false;
    };
  }, [selectedClassId]);

  useEffect(() => {
    let active = true;

    const loadMarks = async () => {
      setLoadingMarks(true);
      try {
        const query = new URLSearchParams();
        query.set('page', String(pagination.page));
        query.set('limit', String(pagination.limit));

        if (selectedClassId) {
          query.set('classId', selectedClassId);
        }
        if (selectedSubjectId) {
          query.set('subjectId', selectedSubjectId);
        }
        if (selectedExamId) {
          query.set('examId', selectedExamId);
        }
        if (selectedStudentId) {
          query.set('studentId', selectedStudentId);
        }

        const response = await get(`/marks?${query.toString()}`, getToken());
        if (!active) {
          return;
        }

        setRows(mapMarksToRows(response.data));

        const nextPagination = response.pagination || {};
        setPagination((prev) => ({
          ...prev,
          total: Number(nextPagination.total || 0),
          totalPages: Number(nextPagination.totalPages || 0)
        }));
      } catch (apiError) {
        if (active) {
          setRows([]);
          setError(apiError.message || 'Failed to load marks');
        }
      } finally {
        if (active) {
          setLoadingMarks(false);
        }
      }
    };

    loadMarks();

    return () => {
      active = false;
    };
  }, [pagination.page, pagination.limit, selectedClassId, selectedSubjectId, selectedExamId, selectedStudentId]);

  const classOptions = useMemo(
    () => [
      { value: '', label: 'All classes' },
      ...classOptionsRaw.map((item) => ({
        value: toId(item),
        label: formatClassLabel(item)
      }))
    ],
    [classOptionsRaw]
  );

  const filteredSubjectRaw = useMemo(
    () =>
      subjectOptionsRaw.filter((item) => {
        if (!selectedClassId) {
          return true;
        }

        return toId(item?.classId) === selectedClassId;
      }),
    [selectedClassId, subjectOptionsRaw]
  );

  const subjectOptions = useMemo(
    () => [
      { value: '', label: 'All subjects' },
      ...filteredSubjectRaw.map((item) => ({
        value: toId(item),
        label: String(item?.name || '-').trim() || '-'
      }))
    ],
    [filteredSubjectRaw]
  );

  const filteredExamRaw = useMemo(
    () =>
      examOptionsRaw.filter((item) => {
        const examClassId = toId(item?.classId);
        const examSubjectId = toId(item?.subjectId);

        if (selectedClassId && examClassId !== selectedClassId) {
          return false;
        }

        if (selectedSubjectId && examSubjectId !== selectedSubjectId) {
          return false;
        }

        return true;
      }),
    [examOptionsRaw, selectedClassId, selectedSubjectId]
  );

  const examOptions = useMemo(
    () => [
      { value: '', label: 'All exams' },
      ...filteredExamRaw.map((item) => ({
        value: toId(item),
        label: formatExamLabel(item)
      }))
    ],
    [filteredExamRaw]
  );

  const studentOptions = useMemo(
    () => [
      { value: '', label: selectedClassId ? 'All students in class' : 'Select class to filter by student' },
      ...studentOptionsRaw.map((item) => ({
        value: toId(item),
        label: `${item?.admissionNo || '-'} - ${item?.userId?.name || '-'}`
      }))
    ],
    [selectedClassId, studentOptionsRaw]
  );

  const reportCardClassOptions = useMemo(
    () => [
      { value: '', label: 'Select class' },
      ...classOptionsRaw.map((item) => ({
        value: toId(item),
        label: formatClassLabel(item)
      }))
    ],
    [classOptionsRaw]
  );

  const reportCardSectionOptions = useMemo(() => {
    const options = [{ value: '', label: 'Select section' }];

    if (reportCardClassId) {
      const selectedClass = classOptionsRaw.find((item) => toId(item) === reportCardClassId) || null;
      const selectedSection = String(selectedClass?.section || '').trim();
      if (selectedSection) {
        options.push({ value: selectedSection, label: selectedSection });
      }
      return options;
    }

    const sections = Array.from(
      new Set(
        classOptionsRaw
          .map((item) => String(item?.section || '').trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));

    return [
      ...options,
      ...sections.map((section) => ({ value: section, label: section }))
    ];
  }, [classOptionsRaw, reportCardClassId]);

  const filteredRows = useMemo(() => {
    const query = String(searchText || '').trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => {
      return [
        row.studentName,
        row.rollNumber,
        row.className,
        row.subjectName,
        row.examName,
        row.grade,
        row.remarks
      ]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [rows, searchText]);

  const groupedRows = useMemo(() => {
    const grouped = new Map();

    filteredRows.forEach((row) => {
      const key = `${row.studentId || row.studentName}::${row.rollNumber}::${row.className}`;
      const current = grouped.get(key) || {
        key,
        studentId: row.studentId,
        studentName: row.studentName,
        rollNumber: row.rollNumber,
        className: row.className,
        items: []
      };

      current.items.push(row);
      grouped.set(key, current);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => {
          const examCompare = String(left.examName || '').localeCompare(String(right.examName || ''));
          if (examCompare !== 0) {
            return examCompare;
          }

          return String(left.subjectName || '').localeCompare(String(right.subjectName || ''));
        })
      }))
      .sort((left, right) => {
        const leftRoll = Number(left.rollNumber);
        const rightRoll = Number(right.rollNumber);
        const hasLeftRoll = Number.isFinite(leftRoll);
        const hasRightRoll = Number.isFinite(rightRoll);

        if (hasLeftRoll && hasRightRoll && leftRoll !== rightRoll) {
          return leftRoll - rightRoll;
        }

        if (hasLeftRoll !== hasRightRoll) {
          return hasLeftRoll ? -1 : 1;
        }

        return String(left.studentName || '').localeCompare(String(right.studentName || ''));
      });
  }, [filteredRows]);

  const onClassChange = (event) => {
    const nextClassId = event.target.value;
    setSelectedClassId(nextClassId);
    setSelectedSubjectId('');
    setSelectedExamId('');
    setSelectedStudentId('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const onSubjectChange = (event) => {
    setSelectedSubjectId(event.target.value);
    setSelectedExamId('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const onExamChange = (event) => {
    setSelectedExamId(event.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const onStudentChange = (event) => {
    setSelectedStudentId(event.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const onReportCardClassChange = (event) => {
    const nextClassId = event.target.value;
    setReportCardClassId(nextClassId);

    const selectedClass = classOptionsRaw.find((item) => toId(item) === nextClassId) || null;
    setReportCardSection(String(selectedClass?.section || '').trim());
  };

  const onDownloadReportCardsZip = async () => {
    if (!reportCardClassId || !reportCardSection) {
      toast.error('Select class and section before downloading report cards');
      return;
    }

    setDownloadingReportCardsZip(true);

    try {
      const token = getToken();
      const query = new URLSearchParams();
      query.set('section', reportCardSection);

      const blob = await getBlob(`/report-cards/class/${reportCardClassId}/zip?${query.toString()}`, token, {
        timeoutMs: 300000
      });

      const selectedClass = classOptionsRaw.find((item) => toId(item) === reportCardClassId) || null;
      const safeClassName = String(selectedClass?.name || 'Class').replace(/[^A-Za-z0-9_-]/g, '_');
      const safeSection = String(reportCardSection || 'NA').replace(/[^A-Za-z0-9_-]/g, '_');
      downloadBlob(blob, `Class_${safeClassName}_Section_${safeSection}_ReportCards.zip`);
    } catch (apiError) {
      toast.error(apiError?.message || 'Failed to download class report cards');
    } finally {
      setDownloadingReportCardsZip(false);
    }
  };

  const onDeleteMark = async () => {
    if (!deleteTarget?.id) {
      return;
    }

    setDeletingMarkId(deleteTarget.id);
    setError('');
    setMessage('');

    try {
      await del(`/marks/${deleteTarget.id}`, getToken());
      setDeleteTarget(null);
      setMessage('Marks deleted successfully');

      const shouldMoveToPreviousPage = rows.length === 1 && pagination.page > 1;
      setPagination((prev) => ({
        ...prev,
        page: shouldMoveToPreviousPage ? prev.page - 1 : prev.page
      }));

      if (!shouldMoveToPreviousPage) {
        const query = new URLSearchParams();
        query.set('page', String(pagination.page));
        query.set('limit', String(pagination.limit));
        if (selectedClassId) {
          query.set('classId', selectedClassId);
        }
        if (selectedSubjectId) {
          query.set('subjectId', selectedSubjectId);
        }
        if (selectedExamId) {
          query.set('examId', selectedExamId);
        }
        if (selectedStudentId) {
          query.set('studentId', selectedStudentId);
        }

        const response = await get(`/marks?${query.toString()}`, getToken());
        setRows(mapMarksToRows(response.data));
        const nextPagination = response.pagination || {};
        setPagination((prev) => ({
          ...prev,
          total: Number(nextPagination.total || 0),
          totalPages: Number(nextPagination.totalPages || 0)
        }));
      }
    } catch (apiError) {
      setError(apiError.message || 'Failed to delete marks');
    } finally {
      setDeletingMarkId('');
    }
  };

  const hasPrevious = pagination.page > 1;
  const hasNext = pagination.totalPages > 0 && pagination.page < pagination.totalPages;

  const openDeleteDialog = (row) => {
    setDeleteTarget({
      id: row.id,
      studentName: row.studentName,
      rollNumber: row.rollNumber,
      examName: row.examName,
      subjectName: row.subjectName
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Marks Management"
        description="View, filter, and manage marks entries across all classes and exams."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Class Filter"
            options={classOptions}
            value={selectedClassId}
            onChange={onClassChange}
            disabled={loadingSetup}
          />

          <Select
            label="Subject Filter"
            options={subjectOptions}
            value={selectedSubjectId}
            onChange={onSubjectChange}
            disabled={loadingSetup}
          />

          <Select
            label="Exam Filter"
            options={examOptions}
            value={selectedExamId}
            onChange={onExamChange}
            disabled={loadingSetup}
          />

          <Select
            label="Student Filter"
            options={studentOptions}
            value={selectedStudentId}
            onChange={onStudentChange}
            disabled={loadingSetup || !selectedClassId}
          />
        </div>

        <div className="mt-2">
          <Input
            label="Search In Current Page"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by student, roll number, class, subject, exam, grade"
            className="h-11"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Download Class Report Cards (ZIP)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Select class and section to download all student report cards in one ZIP file after Final Exam completion.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Class"
            options={reportCardClassOptions}
            value={reportCardClassId}
            onChange={onReportCardClassChange}
            disabled={loadingSetup || downloadingReportCardsZip}
          />

          <Select
            label="Section"
            options={reportCardSectionOptions}
            value={reportCardSection}
            onChange={(event) => setReportCardSection(event.target.value)}
            disabled={loadingSetup || downloadingReportCardsZip}
          />

          <div className="flex items-end">
            <button
              type="button"
              onClick={onDownloadReportCardsZip}
              disabled={
                downloadingReportCardsZip ||
                !reportCardClassId ||
                !reportCardSection
              }
              className="h-11 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloadingReportCardsZip ? 'Preparing ZIP...' : 'Download Class Report Cards (ZIP)'}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <div className="max-h-[420px] overflow-x-auto overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-red-700 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-red-50">Student Name</th>
                <th className="px-4 py-3 font-semibold text-red-50">Roll Number</th>
                <th className="px-4 py-3 font-semibold text-red-50">Class</th>
                <th className="px-4 py-3 font-semibold text-red-50">Subject</th>
                <th className="px-4 py-3 font-semibold text-red-50">Exam</th>
                <th className="px-4 py-3 font-semibold text-red-50">Marks</th>
                <th className="px-4 py-3 font-semibold text-red-50">Percentage</th>
                <th className="px-4 py-3 font-semibold text-red-50">Grade</th>
                <th className="px-4 py-3 font-semibold text-red-50">Remarks</th>
                <th className="px-4 py-3 font-semibold text-red-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingMarks ? (
                Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr
                    key={`marks-skeleton-${rowIndex}`}
                    className={`border-t border-slate-100 ${rowIndex % 2 === 1 ? 'bg-red-50/25' : ''}`}
                  >
                    <td className="px-4 py-4" colSpan={10}>
                      <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))
              ) : groupedRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
                    No records found.
                  </td>
                </tr>
              ) : (
                groupedRows.map((group, groupIndex) =>
                  group.items.map((row, rowIndex) => (
                    <tr
                      key={row.id || `${group.key}-${rowIndex}`}
                      className={`border-t border-slate-100 ${groupIndex % 2 === 1 ? 'bg-red-50/25' : ''}`}
                    >
                      {rowIndex === 0 ? (
                        <>
                          <td rowSpan={group.items.length} className="px-4 py-3 align-top text-slate-700">
                            {group.studentName}
                          </td>
                          <td rowSpan={group.items.length} className="px-4 py-3 align-top text-slate-700">
                            {group.rollNumber}
                          </td>
                          <td rowSpan={group.items.length} className="px-4 py-3 align-top text-slate-700">
                            {group.className}
                          </td>
                        </>
                      ) : null}

                      <td className="px-4 py-3 text-slate-700">{row.subjectName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.examName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.marks}</td>
                      <td className="px-4 py-3 text-slate-700">{row.percentage}</td>
                      <td className="px-4 py-3 text-slate-700">{row.grade}</td>
                      <td className="px-4 py-3 text-slate-700">{row.remarks}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDeleteDialog(row);
                          }}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-slate-600">
          Page {pagination.page} of {pagination.totalPages || 0} | Total records: {pagination.total}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
            disabled={!hasPrevious || loadingMarks}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={!hasNext || loadingMarks}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete Marks Entry</h3>
            <p className="mt-2 text-sm text-slate-600">
              This action will permanently remove marks for {deleteTarget.studentName} ({deleteTarget.rollNumber}) in {deleteTarget.subjectName} - {deleteTarget.examName}.
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
                onClick={onDeleteMark}
                disabled={deletingMarkId === deleteTarget.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingMarkId === deleteTarget.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
