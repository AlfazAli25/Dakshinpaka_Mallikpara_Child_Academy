'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import InfoCard from '@/components/InfoCard';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import { get } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Teaching Panel',
    title: 'Grade Entry',
    description: 'Review marks and remarks for the selected exam.',
    detailsTitle: 'Exam Details',
    details: {
      examId: 'Exam ID',
      subject: 'Subject',
      classLbl: 'Class',
      date: 'Date',
      totalMarks: 'Total Marks'
    },
    columns: [
      { key: 'student', label: 'Student' },
      { key: 'admissionNo', label: 'Student ID' },
      { key: 'marks', label: 'Marks' },
      { key: 'remarks', label: 'Remarks' }
    ]
  },
  bn: {
    eyebrow: 'টিচিং প্যানেল',
    title: 'গ্রেড এন্ট্রি',
    description: 'নির্বাচিত পরীক্ষার নম্বর এবং মন্তব্য পর্যালোচনা করুন।',
    detailsTitle: 'পরীক্ষার বিবরণ',
    details: {
      examId: 'পরীক্ষা আইডি',
      subject: 'বিষয়',
      classLbl: 'ক্লাস',
      date: 'তারিখ',
      totalMarks: 'মোট নম্বর'
    },
    columns: [
      { key: 'student', label: 'শিক্ষার্থী' },
      { key: 'admissionNo', label: 'স্টুডেন্ট আইডি' },
      { key: 'marks', label: 'নম্বর' },
      { key: 'remarks', label: 'মন্তব্য' }
    ]
  }
};

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

export default function TeacherGradesPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const params = useParams();
  const examId = params?.examId;
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error, toast]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const teacher = await getCurrentTeacherRecord();
        const { token } = getAuthContext();
        if (!teacher || !token || !examId) {
          setRows([]);
          setExam(null);
          return;
        }

        const [examRes, gradesRes] = await Promise.all([get(`/exams/${examId}`, token), get('/grades', token)]);
        setExam(examRes.data || null);

        const filtered = (gradesRes.data || []).filter((item) => String(item.examId?._id || '') === String(examId));
        setRows(
          filtered.map((item) => ({
            id: item._id,
            student: item.studentId?.userId?.name || '-',
            admissionNo: item.studentId?.admissionNo || '-',
            marks: `${item.marksObtained || 0}/${item.examId?.totalMarks || 0}`,
            remarks: item.remarks || '-'
          }))
        );
      } catch (apiError) {
        setError(apiError.message);
        setRows([]);
        setExam(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [examId]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <InfoCard title={t.detailsTitle}>
        <p className="text-sm text-slate-700">{t.details.examId}: {exam?._id || examId || '-'}</p>
        <p className="text-sm text-slate-700">{t.details.subject}: {exam?.subjectId?.name || '-'}</p>
        <p className="text-sm text-slate-700">{t.details.classLbl}: {formatClassLabel(exam?.classId, t.details.classLbl)}</p>
        <p className="text-sm text-slate-700">{t.details.date}: {formatDateValue(exam?.date)}</p>
        <p className="text-sm text-slate-700">{t.details.totalMarks}: {exam?.totalMarks || 0}</p>
      </InfoCard>

      <Table columns={t.columns} rows={rows} loading={loading} />
    </div>
  );
}