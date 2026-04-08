'use client';

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import Select from '@/components/Select';
import { get, getBlob } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Results',
    description: 'Select an exam and review your subject-wise performance.',
    examFilterLabel: 'Select Exam',
    examFilterPlaceholder: 'Select exam',
    downloadReportCard: 'Download Report Card',
    downloadingReportCard: 'Downloading...',
    checkingReportCard: 'Checking report card availability...',
    archivedReportCardUnavailable: 'Report card download is available for current class exams only.',
    reportCardNotReady: 'Report card is not ready yet.',
    reportCardDownloadFailed: 'Failed to download report card right now.',
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
    description: 'পরীক্ষা নির্বাচন করে বিষয়ভিত্তিক ফলাফল দেখুন।',
    examFilterLabel: 'পরীক্ষা নির্বাচন করুন',
    examFilterPlaceholder: 'পরীক্ষা নির্বাচন করুন',
    downloadReportCard: 'রিপোর্ট কার্ড ডাউনলোড',
    downloadingReportCard: 'ডাউনলোড হচ্ছে...',
    checkingReportCard: 'রিপোর্ট কার্ড প্রস্তুতি যাচাই করা হচ্ছে...',
    archivedReportCardUnavailable: 'রিপোর্ট কার্ড ডাউনলোড কেবল বর্তমান শ্রেণির পরীক্ষার জন্য উপলভ্য।',
    reportCardNotReady: 'রিপোর্ট কার্ড এখনও প্রস্তুত হয়নি।',
    reportCardDownloadFailed: 'এই মুহূর্তে রিপোর্ট কার্ড ডাউনলোড করা যাচ্ছে না।',
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

const toExamLabel = (exam) => {
  const examName = String(exam?.examName || exam?.description || 'Exam').trim() || 'Exam';
  const examDateValue = exam?.startDate || exam?.examDate || exam?.date;
  if (!examDateValue) {
    return examName;
  }

  const parsed = new Date(examDateValue);
  if (Number.isNaN(parsed.getTime())) {
    return examName;
  }

  return `${examName} (${parsed.toLocaleDateString('en-GB')})`;
};

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

export default function StudentResultsPage() {
  const toast = useToast();
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [studentClassId, setStudentClassId] = useState('');
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [rows, setRows] = useState([]);
  const [checkingReportCard, setCheckingReportCard] = useState(false);
  const [downloadingReportCard, setDownloadingReportCard] = useState(false);
  const [reportCardStatus, setReportCardStatus] = useState({
    isDownloadReady: false,
    message: '',
    fileName: 'Report_Card.pdf'
  });

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
            setStudentClassId('');
            setExams([]);
            setSelectedExamId('');
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
            const leftDate = new Date(left?.startDate || left?.examDate || left?.date || 0).getTime();
            const rightDate = new Date(right?.startDate || right?.examDate || right?.date || 0).getTime();
            return rightDate - leftDate;
          });

        if (!active) {
          return;
        }

        setStudentId(currentStudentId);
        setStudentClassId(classId);
        setExams(sortedExams);
        setSelectedExamId((prev) => {
          if (prev && sortedExams.some((exam) => toId(exam) === prev)) {
            return prev;
          }

          return toId(sortedExams[0]);
        });
      } catch (_error) {
        if (active) {
          setStudentId('');
          setStudentClassId('');
          setExams([]);
          setSelectedExamId('');
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

  useEffect(() => {
    let active = true;

    const loadReportCardStatus = async () => {
      if (!studentId || !selectedExamId) {
        setReportCardStatus({
          isDownloadReady: false,
          message: '',
          fileName: 'Report_Card.pdf'
        });
        return;
      }

      const selectedExam = exams.find((exam) => toId(exam) === selectedExamId) || null;
      const selectedExamClassId = toId(selectedExam?.classId);

      if (studentClassId && selectedExamClassId && selectedExamClassId !== studentClassId) {
        setReportCardStatus({
          isDownloadReady: false,
          message: t.archivedReportCardUnavailable,
          fileName: 'Report_Card.pdf'
        });
        return;
      }

      setCheckingReportCard(true);

      try {
        const { token } = getAuthContext();
        if (!token) {
          if (active) {
            setReportCardStatus({
              isDownloadReady: false,
              message: t.reportCardNotReady,
              fileName: 'Report_Card.pdf'
            });
          }
          return;
        }

        const response = await get(`/report-cards/exam/${selectedExamId}/student/me/status`, token, {
          forceRefresh: true,
          cacheTtlMs: 0
        });

        if (!active) {
          return;
        }

        const statusData = response?.data || {};
        setReportCardStatus({
          isDownloadReady: Boolean(statusData?.isDownloadReady),
          message: String(statusData?.message || '').trim(),
          fileName: String(statusData?.fileName || 'Report_Card.pdf').trim() || 'Report_Card.pdf'
        });
      } catch (apiError) {
        if (active) {
          setReportCardStatus({
            isDownloadReady: false,
            message: String(apiError?.message || t.reportCardNotReady).trim(),
            fileName: 'Report_Card.pdf'
          });
        }
      } finally {
        if (active) {
          setCheckingReportCard(false);
        }
      }
    };

    loadReportCardStatus();

    return () => {
      active = false;
    };
  }, [selectedExamId, studentId, studentClassId, exams, t.reportCardNotReady, t.archivedReportCardUnavailable]);

  const onDownloadReportCard = async () => {
    if (!selectedExamId) {
      return;
    }

    setDownloadingReportCard(true);

    try {
      const { token } = getAuthContext();
      if (!token) {
        throw new Error('Session expired. Please login again.');
      }

      const blob = await getBlob(`/report-cards/exam/${selectedExamId}/student/me/download`, token, {
        timeoutMs: 120000
      });

      downloadBlob(blob, reportCardStatus.fileName || 'Report_Card.pdf');
    } catch (apiError) {
      toast.error(apiError?.message || t.reportCardDownloadFailed);
    } finally {
      setDownloadingReportCard(false);
    }
  };

  const examOptions = [
    { value: '', label: t.examFilterPlaceholder },
    ...exams.map((exam) => ({
      value: toId(exam),
      label: toExamLabel(exam)
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
          label={t.examFilterLabel}
          value={selectedExamId}
          onChange={(event) => setSelectedExamId(event.target.value)}
          options={examOptions}
          disabled={loadingSetup || exams.length === 0}
          className="h-11"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onDownloadReportCard}
            disabled={
              !selectedExamId ||
              checkingReportCard ||
              downloadingReportCard ||
              !reportCardStatus.isDownloadReady
            }
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloadingReportCard ? t.downloadingReportCard : t.downloadReportCard}
          </button>

          <p className="text-sm text-slate-600">
            {checkingReportCard
              ? t.checkingReportCard
              : reportCardStatus.message || (reportCardStatus.isDownloadReady ? '' : t.reportCardNotReady)}
          </p>
        </div>
      </div>

      <Table columns={t.columns} rows={rows} loading={loading} />
    </div>
  );
}