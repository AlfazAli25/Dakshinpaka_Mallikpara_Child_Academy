'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Select from '@/components/Select';
import Input from '@/components/Input';
import Button from '@/components/ui/button';
import AppModal from '@/components/modals/AppModal';
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
      classSection: String(item?.classId?.section || '').trim() || '-',
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

  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedClassSection, setSelectedClassSection] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchText, setSearchText] = useState('');

  const [reportCardClassName, setReportCardClassName] = useState('');
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

  // Exam is the first filter — show ALL exams with no upstream dependency.
  const examOptions = useMemo(
    () => [
      { value: '', label: 'All exams' },
      ...examOptionsRaw.map((item) => ({
        value: toId(item),
        label: formatExamLabel(item)
      }))
    ],
    [examOptionsRaw]
  );

  // When exam is selected, narrow class names to only those that have that exam.
  const uniqueClassNamesForFilter = useMemo(() => {
    if (selectedExamId) {
      const selectedExam = examOptionsRaw.find((e) => toId(e) === selectedExamId);
      const examClassId = toId(selectedExam?.classId);
      if (examClassId) {
        const matchedClass = classOptionsRaw.find((c) => toId(c) === examClassId);
        if (matchedClass?.name) {
          return [matchedClass.name];
        }
      }
    }
    return Array.from(new Set(classOptionsRaw.map((c) => c.name))).sort();
  }, [classOptionsRaw, examOptionsRaw, selectedExamId]);

  const classNameFilterOptions = useMemo(
    () => [
      { value: '', label: 'All classes' },
      ...uniqueClassNamesForFilter.map((name) => ({ value: name, label: name }))
    ],
    [uniqueClassNamesForFilter]
  );

  const availableSectionsForFilter = useMemo(() => {
    if (!selectedClassName) return [];
    return classOptionsRaw
      .filter((c) => c.name === selectedClassName)
      .map((c) => c.section || '')
      .sort();
  }, [classOptionsRaw, selectedClassName]);

  const classSectionFilterOptions = useMemo(
    () => [
      { value: '', label: selectedClassName ? 'All sections' : 'Select class first' },
      ...availableSectionsForFilter.map((section) => ({
        value: section,
        label: section || '(No Section)'
      }))
    ],
    [availableSectionsForFilter, selectedClassName]
  );

  // Subject options — filtered by selected class.
  const filteredSubjectRaw = useMemo(
    () =>
      subjectOptionsRaw.filter((item) => {
        if (!selectedClassId) return true;
        return toId(item?.classId) === selectedClassId;
      }),
    [selectedClassId, subjectOptionsRaw]
  );

  const subjectOptions = useMemo(
    () => [
      { value: '', label: selectedClassId ? 'All subjects' : 'Select class first' },
      ...filteredSubjectRaw.map((item) => ({
        value: toId(item),
        label: String(item?.name || '-').trim() || '-'
      }))
    ],
    [filteredSubjectRaw, selectedClassId]
  );

  // (examOptions is defined above — exam is the first filter)

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

  const uniqueClassNames = useMemo(
    () => Array.from(new Set(classOptionsRaw.map((c) => c.name))).sort(),
    [classOptionsRaw]
  );

  const availableReportCardSections = useMemo(
    () => {
      if (!reportCardClassName) return [];
      return classOptionsRaw
        .filter((c) => c.name === reportCardClassName)
        .map((c) => c.section || '')
        .sort();
    },
    [classOptionsRaw, reportCardClassName]
  );

  const reportCardClassNameOptions = useMemo(
    () => [
      { value: '', label: 'Select class name' },
      ...uniqueClassNames.map((name) => ({ value: name, label: name }))
    ],
    [uniqueClassNames]
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
    return [
      { value: '', label: reportCardClassName ? 'Select section' : 'Select class first' },
      ...availableReportCardSections.map((section) => ({
        value: section,
        label: section || '(No Section)'
      }))
    ];
  }, [availableReportCardSections, reportCardClassName]);

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
        row.classSection,
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
      const key = `${row.studentId || row.studentName}::${row.rollNumber}::${row.className}::${row.classSection}`;
      const current = grouped.get(key) || {
        key,
        studentId: row.studentId,
        studentName: row.studentName,
        rollNumber: row.rollNumber,
        className: row.className,
        classSection: row.classSection,
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

  // Exam is first — resets everything downstream.
  const onExamChange = (event) => {
    const nextExamId = event.target.value;
    setSelectedExamId(nextExamId);
    // When exam changes, auto-select class name if that exam belongs to a single class.
    if (nextExamId) {
      const selectedExam = examOptionsRaw.find((e) => toId(e) === nextExamId);
      const examClassId = toId(selectedExam?.classId);
      const matchedClass = examClassId ? classOptionsRaw.find((c) => toId(c) === examClassId) : null;
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
    setSelectedStudentId('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Class name — exam is upstream so we do NOT clear exam.
  const onClassNameFilterChange = (event) => {
    const nextClassName = event.target.value;
    setSelectedClassName(nextClassName);
    setSelectedClassSection('');
    const sectionsForName = classOptionsRaw
      .filter((c) => c.name === nextClassName)
      .map((c) => c.section || '')
      .sort();
    if (!nextClassName) {
      setSelectedClassId('');
    } else if (sectionsForName.length === 1) {
      const matched = classOptionsRaw.find(
        (c) => c.name === nextClassName && (c.section || '') === sectionsForName[0]
      );
      setSelectedClassId(matched ? toId(matched) : '');
    } else {
      setSelectedClassId('');
    }
    setSelectedSubjectId('');
    setSelectedStudentId('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Section — exam and class name are upstream so we do NOT clear them.
  const onClassSectionFilterChange = (event) => {
    const nextSection = event.target.value;
    setSelectedClassSection(nextSection);
    const matched = classOptionsRaw.find(
      (c) => c.name === selectedClassName && (c.section || '') === nextSection
    );
    setSelectedClassId(matched ? toId(matched) : '');
    setSelectedSubjectId('');
    setSelectedStudentId('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Subject — exam, class, section are upstream.
  const onSubjectChange = (event) => {
    setSelectedSubjectId(event.target.value);
    setSelectedStudentId('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const onStudentChange = (event) => {
    setSelectedStudentId(event.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const onReportCardClassChange = (event) => {
    const nextClassName = event.target.value;
    setReportCardClassName(nextClassName);
    setReportCardSection('');
    setReportCardClassId('');
  };

  const onReportCardSectionChange = (event) => {
    const nextSection = event.target.value;
    setReportCardSection(nextSection);
    const matchedClass = classOptionsRaw.find(
      (c) => c.name === reportCardClassName && (c.section || '') === nextSection
    );
    setReportCardClassId(matchedClass ? toId(matchedClass) : '');
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
  const summaryCards = useMemo(
    () => [
      {
        label: 'Records On Current Page',
        value: String(rows.length)
      },
      {
        label: 'Grouped Students',
        value: String(groupedRows.length)
      },
      {
        label: 'Total Records',
        value: String(pagination.total || 0)
      },
      {
        label: 'Active Filters',
        value: String(
          [selectedClassId, selectedSubjectId, selectedExamId, selectedStudentId, searchText]
            .filter((item) => String(item || '').trim())
            .length
        )
      }
    ],
    [groupedRows.length, pagination.total, rows.length, searchText, selectedClassId, selectedExamId, selectedStudentId, selectedSubjectId]
  );

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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-red-100/85 bg-white/85 p-4 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-red-700 dark:text-red-200">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-red-50">{item.value}</p>
          </div>
        ))}
      </section>

      <div className="rounded-3xl border border-red-100/85 bg-white/85 p-4 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-400/20 dark:bg-blue-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-100">Currently Selected</p>
          <p className="mt-1 text-sm font-medium text-blue-700 dark:text-blue-200">
            {selectedExamId ? (
              <>
                Exam: <span className="font-bold">{examOptions.find((o) => o.value === selectedExamId)?.label || selectedExamId}</span>
                {selectedClassName && (
                  <> | Class: <span className="font-bold">{selectedClassName}</span></>
                )}
                {selectedClassSection && (
                  <> | Section: <span className="font-bold">{selectedClassSection}</span></>
                )}
              </>
            ) : 'Exam: Not selected'}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Select
            label="Exam Filter"
            options={examOptions}
            value={selectedExamId}
            onChange={onExamChange}
            disabled={loadingSetup}
          />

          <Select
            label="Class Name Filter"
            options={classNameFilterOptions}
            value={selectedClassName}
            onChange={onClassNameFilterChange}
            disabled={loadingSetup}
          />

          <Select
            label="Section Filter"
            options={classSectionFilterOptions}
            value={selectedClassSection}
            onChange={onClassSectionFilterChange}
            disabled={loadingSetup || !selectedClassName}
          />

          <Select
            label="Subject Filter"
            options={subjectOptions}
            value={selectedSubjectId}
            onChange={onSubjectChange}
            disabled={loadingSetup || !selectedClassId}
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

      <div className="rounded-3xl border border-red-100/85 bg-white/85 p-4 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <h3 className="text-base font-semibold text-slate-900 dark:text-red-50">Download Class Report Cards (ZIP)</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-red-100/80">
          Select class name and section to download all student report cards in one ZIP file after Final Exam completion.
        </p>

        <div className="mb-3 mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-400/20 dark:bg-blue-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-100">Currently Selected</p>
          <p className="mt-1 text-sm font-medium text-blue-700 dark:text-blue-200">
            {reportCardClassName ? (
              <>
                Class: <span className="font-bold">{reportCardClassName}</span>
                {reportCardSection && (
                  <>
                    {' '} | Section: <span className="font-bold">{reportCardSection}</span>
                  </>
                )}
                {!reportCardSection && ' | Section: Not selected'}
              </>
            ) : 'Class: Not selected | Section: Not selected'}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Class Name *"
            options={reportCardClassNameOptions}
            value={reportCardClassName}
            onChange={onReportCardClassChange}
            disabled={loadingSetup || downloadingReportCardsZip}
          />

          <Select
            label="Section *"
            options={reportCardSectionOptions}
            value={reportCardSection}
            onChange={onReportCardSectionChange}
            disabled={loadingSetup || downloadingReportCardsZip || !reportCardClassName}
          />

          <div className="flex items-end">
            <Button
              type="button"
              onClick={onDownloadReportCardsZip}
              disabled={
                downloadingReportCardsZip ||
                !reportCardClassId ||
                !reportCardSection
              }
              className="h-11 w-full"
              fullWidth
            >
              {downloadingReportCardsZip ? 'Preparing ZIP...' : 'Download Class Report Cards (ZIP)'}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-red-100/85 bg-white/85 shadow-[0_26px_56px_-36px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <div className="max-h-[420px] overflow-x-auto overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-red-900 via-red-700 to-red-900 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-red-50">Student Name</th>
                <th className="px-4 py-3 font-semibold text-red-50">Roll Number</th>
                <th className="px-4 py-3 font-semibold text-red-50">Class</th>
                <th className="px-4 py-3 font-semibold text-red-50">Section</th>
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
                    <td className="px-4 py-4" colSpan={11}>
                      <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))
              ) : groupedRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={11}>
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
                          <td rowSpan={group.items.length} className="px-4 py-3 align-top text-slate-700">
                            {group.classSection}
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
                        <Button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDeleteDialog(row);
                          }}
                          variant="danger"
                          size="sm"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-red-100/85 bg-white/85 px-4 py-3 shadow-[0_24px_46px_-34px_rgba(153,27,27,0.75)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75">
        <p className="text-sm text-slate-600 dark:text-red-100/80">
          Page {pagination.page} of {pagination.totalPages || 0} | Total records: {pagination.total}
        </p>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
            disabled={!hasPrevious || loadingMarks}
            variant="outline"
            size="sm"
          >
            Previous
          </Button>
          <Button
            type="button"
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={!hasNext || loadingMarks}
            variant="outline"
            size="sm"
          >
            Next
          </Button>
        </div>
      </div>

      <AppModal
        open={Boolean(deleteTarget)}
        title="Delete Marks Entry"
        description={
          deleteTarget
            ? `This action will permanently remove marks for ${deleteTarget.studentName} (${deleteTarget.rollNumber}) in ${deleteTarget.subjectName} - ${deleteTarget.examName}.`
            : ''
        }
        onClose={() => setDeleteTarget(null)}
        maxWidth="max-w-md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={onDeleteMark}
              loading={Boolean(deleteTarget && deletingMarkId === deleteTarget.id)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-red-100/80">
          Please confirm before deleting this marks entry.
        </p>
      </AppModal>
    </div>
  );
}
