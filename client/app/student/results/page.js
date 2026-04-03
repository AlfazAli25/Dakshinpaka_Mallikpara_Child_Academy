'use client';

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Results',
    description: 'Review your exam performance and teacher remarks.',
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
    description: 'পরীক্ষার নম্বর ও শিক্ষকের মন্তব্য দেখুন।',
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

export default function StudentResultsPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const student = await getCurrentStudentRecord();
        const { token } = getAuthContext();
        if (!student || !token) {
          setRows([]);
          return;
        }

        const response = await get('/student/results', token);
        setRows(
          (response.data || []).map((item) => ({
            id: item._id,
            subject: item.examId?.subjectId?.name || '-',
            marks: `${item.marksObtained}/${item.examId?.totalMarks || 0}`,
            grade: toGradeLabel(
              item.examId?.totalMarks > 0 ? (Number(item.marksObtained || 0) / Number(item.examId.totalMarks)) * 100 : NaN
            ),
            remarks: item.remarks || '-'
          }))
        );
      } catch (_error) {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        rightSlot={<LanguageToggle />}
      />
      <Table columns={t.columns} rows={rows} loading={loading} />
    </div>
  );
}