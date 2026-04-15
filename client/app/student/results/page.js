'use client';

import { useEffect, useMemo, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import Select from '@/components/Select';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Results',
    description: 'Select a year and review your final-exam subject-wise performance.',
    yearFilterLabel: 'Select Year',
    yearFilterPlaceholder: 'Select year',
    reportCardAdminOnly: 'Report card download is now admin-only. Contact the administration office for a copy.',
    columns: [
      { key: 'subject', label: 'Subject' },
      { key: 'marks', label: 'Marks' },
      { key: 'grade', label: 'Grade' },
      { key: 'remarks', label: 'Remarks' }
    ]
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'ফলাফল',
    description: 'বছর নির্বাচন করে ফাইনাল পরীক্ষার বিষয়ভিত্তিক ফলাফল দেখুন।',
    yearFilterLabel: 'বছর নির্বাচন করুন',
    yearFilterPlaceholder: 'বছর নির্বাচন করুন',
    reportCardAdminOnly: 'রিপোর্ট কার্ড ডাউনলোড এখন কেবল প্রশাসনের জন্য। কপি পেতে প্রশাসনিক অফিসে যোগাযোগ করুন।',
    columns: [
      { key: 'subject', label: 'বিষয়' },
      { key: 'marks', label: 'নম্বর' },
      { key: 'grade', label: 'গ্রেড' },
      { key: 'remarks', label: 'মন্তব্য' }
    ]
  }
};

const toGradeLabel = (percent) => {
  if (!Number.isFinite(percent)) {
    return '-';
  }

  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B';
  if (percent >= 60) return 'C';
  if (percent >= 50) return 'D';
  return 'F';
};

const toId = (value) => String(value?._id || value || '');

const ACADEMIC_YEAR_REGEX = /^\d{4}$/;
const ACADEMIC_YEAR_RANGE_REGEX = /^(\d{4})\s*-\s*(\d{4})$/;

const normalizeAcademicYear = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (ACADEMIC_YEAR_REGEX.test(normalized)) {
    return normalized;
  }

  const rangeMatch = normalized.match(ACADEMIC_YEAR_RANGE_REGEX);
  if (rangeMatch) {
    return rangeMatch[1];
  }

  return normalized;
};

const toExamTimestamp = (exam = {}) => {
  const value = exam?.endDate || exam?.startDate || exam?.examDate || exam?.date || exam?.createdAt;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return parsed.getTime();
};

const getExamSearchText = (exam = {}) =>
  `${String(exam?.examName || '').trim()} ${String(exam?.description || '').trim()} ${String(exam?.examType || '').trim()}`.toLowerCase();

const isFinalExam = (exam = {}) => {
  const searchText = getExamSearchText(exam);

  if (/\bhalf\s*[- ]?\s*yearly\b|\bhalfyearly\b|\bmid\s*[- ]?\s*yearly\b|\bmidyearly\b/.test(searchText)) {
    return false;
  }

  const examType = String(exam?.examType || '')
    .trim()
    .toLowerCase();

  if (examType === 'final exam' || examType === 'final') {
    return true;
  }

  return /\bfinal exam\b|\bfinal\b|\bannual\b|\byearly\b/.test(searchText);
};

const buildReportCardExamByYear = (examList = []) => {
  const map = new Map();

  (Array.isArray(examList) ? examList : []).forEach((exam) => {
    if (!isFinalExam(exam)) {
      return;
    }

    const academicYear = normalizeAcademicYear(exam?.academicYear);
    if (!ACADEMIC_YEAR_REGEX.test(academicYear)) {
      return;
    }

    const existing = map.get(academicYear);
    if (!existing || toExamTimestamp(exam) > toExamTimestamp(existing)) {
      map.set(academicYear, exam);
    }
  });

  return map;
};

const mergeExamsById = ({ primaryExams = [], secondaryExams = [] }) => {
  const examMap = new Map();

  [...(Array.isArray(primaryExams) ? primaryExams : []), ...(Array.isArray(secondaryExams) ? secondaryExams : [])].forEach(
    (exam) => {
      const examId = toId(exam);
      if (!examId || examMap.has(examId)) {
        return;
      }

      examMap.set(examId, exam);
    }
  );

  return Array.from(examMap.values());
};

const collectStudentExamHistory = async ({ studentId, token }) => {
  const firstResponse = await get(`/marks/student/${studentId}?page=1&limit=500`, token);
  const firstRows = Array.isArray(firstResponse?.data) ? firstResponse.data : [];

  const historyExamMap = new Map();

  firstRows.forEach((row) => {
    const exam = row?.examId;
    const examId = toId(exam);
    if (examId && !historyExamMap.has(examId)) {
      historyExamMap.set(examId, exam);
    }
  });

  const totalPages = Number(firstResponse?.pagination?.totalPages || 1);
  const safeTotalPages = Number.isFinite(totalPages) && totalPages > 0 ? Math.min(totalPages, 30) : 1;

  if (safeTotalPages > 1) {
    const pending = [];
    for (let page = 2; page <= safeTotalPages; page += 1) {
      pending.push(get(`/marks/student/${studentId}?page=${page}&limit=500`, token));
    }

    const responses = await Promise.all(pending);
    responses.forEach((response) => {
      const rows = Array.isArray(response?.data) ? response.data : [];
      rows.forEach((row) => {
        const exam = row?.examId;
        const examId = toId(exam);
        if (examId && !historyExamMap.has(examId)) {
          historyExamMap.set(examId, exam);
        }
      });
    });
  }

  return Array.from(historyExamMap.values());
};

export default function StudentResultsPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [exams, setExams] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let active = true;

    const loadSetup = async () => {
      setLoadingSetup(true);
      try {
        const student = await getCurrentStudentRecord();
        const { token } = getAuthContext();
        if (!student || !token) {
          if (active) {
            setStudentId('');
            setExams([]);
            setSelectedYear('');
            setRows([]);
          }
          return;
        }

        const currentStudentId = toId(student);
        const classId = toId(student?.classId);

        const [classExamsResponse, historyExams] = await Promise.all([
          classId ? get(`/exams?classId=${classId}&page=1&limit=300`, token) : Promise.resolve({ data: [] }),
          currentStudentId ? collectStudentExamHistory({ studentId: currentStudentId, token }) : Promise.resolve([])
        ]);

        const classExams = Array.isArray(classExamsResponse?.data) ? classExamsResponse.data : [];
        const mergedExams = mergeExamsById({
          primaryExams: classExams,
          secondaryExams: historyExams
        });

        const sortedExams = mergedExams
          .slice()
          .sort((left, right) => {
            const leftDate = toExamTimestamp(left);
            const rightDate = toExamTimestamp(right);
            return rightDate - leftDate;
          });

        const reportCardMap = buildReportCardExamByYear(sortedExams);
        const reportCardYears = Array.from(reportCardMap.keys()).sort((left, right) => Number(right) - Number(left));

        if (!active) {
          return;
        }

        setStudentId(currentStudentId);
        setExams(sortedExams);
        setSelectedYear((prev) => {
          if (prev && reportCardMap.has(prev)) {
            return prev;
          }

          return reportCardYears[0] || '';
        });
      } catch (_error) {
        if (active) {
          setStudentId('');
          setExams([]);
          setSelectedYear('');
          setRows([]);
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

  const reportCardExamByYear = useMemo(() => buildReportCardExamByYear(exams), [exams]);

  const availableYears = useMemo(
    () => Array.from(reportCardExamByYear.keys()).sort((left, right) => Number(right) - Number(left)),
    [reportCardExamByYear]
  );

  const selectedReportCardExam = useMemo(() => {
    if (!selectedYear) {
      return null;
    }

    return reportCardExamByYear.get(selectedYear) || null;
  }, [reportCardExamByYear, selectedYear]);

  const selectedExamId = toId(selectedReportCardExam);

  useEffect(() => {
    let active = true;

    const loadRows = async () => {
      if (!studentId || !selectedExamId) {
        setRows([]);
        return;
      }

      setLoadingRows(true);
      try {
        const { token } = getAuthContext();
        if (!token) {
          if (active) {
            setRows([]);
          }
          return;
        }

        const response = await get(`/marks/student/${studentId}?page=1&limit=500&examId=${selectedExamId}`, token);
        if (!active) {
          return;
        }

        setRows(
          (response.data || []).map((item) => ({
            id: item._id,
            subject: item.subjectId?.name || '-',
            marks: `${item.marksObtained}/${item.maxMarks || 0}`,
            grade: item.grade || toGradeLabel(item.percentage),
            remarks: item.remarks || '-'
          }))
        );
      } catch (_error) {
        if (active) {
          setRows([]);
        }
      } finally {
        if (active) {
          setLoadingRows(false);
        }
      }
    };

    loadRows();

    return () => {
      active = false;
    };
  }, [selectedExamId, studentId]);

  const yearOptions = [
    { value: '', label: t.yearFilterPlaceholder },
    ...availableYears.map((year) => ({
      value: year,
      label: year
    }))
  ];

  const loading = loadingSetup || loadingRows;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        rightSlot={<LanguageToggle />}
      />

      <div className="max-w-lg">
        <Select
          label={t.yearFilterLabel}
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
          options={yearOptions}
          disabled={loadingSetup || availableYears.length === 0}
          className="h-11"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-600">{t.reportCardAdminOnly}</p>
      </div>

      <Table columns={t.columns} rows={rows} loading={loading} />
    </div>
  );
}