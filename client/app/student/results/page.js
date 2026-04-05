'use client';

import { useEffect, useState } from 'react';
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
    description: 'Select an exam and review your subject-wise performance.',
    examFilterLabel: 'Select Exam',
    examFilterPlaceholder: 'Select exam',
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

export default function StudentResultsPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
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
            setSelectedExamId('');
            setRows([]);
          }
          return;
        }

        const classId = toId(student?.classId);
        const examsResponse = classId ? await get(`/exams?classId=${classId}&page=1&limit=300`, token) : { data: [] };
        const sortedExams = (Array.isArray(examsResponse.data) ? examsResponse.data : [])
          .slice()
          .sort((left, right) => {
            const leftDate = new Date(left?.startDate || left?.examDate || left?.date || 0).getTime();
            const rightDate = new Date(right?.startDate || right?.examDate || right?.date || 0).getTime();
            return rightDate - leftDate;
          });

        if (!active) {
          return;
        }

        setStudentId(toId(student));
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

      <Table columns={t.columns} rows={rows} loading={loading} />
    </div>
  );
}