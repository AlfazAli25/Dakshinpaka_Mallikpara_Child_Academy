'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import InfoCard from '@/components/InfoCard';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import { get } from '@/lib/api';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';
import { useToast } from '@/lib/toast-context';

const gradeColumns = [
  { key: 'student', label: 'Student' },
  { key: 'admissionNo', label: 'Student ID' },
  { key: 'marks', label: 'Marks' },
  { key: 'remarks', label: 'Remarks' }
];

export default function TeacherGradesPage() {
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
        eyebrow="Teaching Panel"
        title="Grade Entry"
        description="Review marks and remarks for the selected exam."
      />

      <InfoCard title="Exam Details">
        <p className="text-sm text-slate-700">Exam ID: {exam?._id || examId || '-'}</p>
        <p className="text-sm text-slate-700">Subject: {exam?.subjectId?.name || '-'}</p>
        <p className="text-sm text-slate-700">Class: {exam?.classId?.name || '-'}</p>
        <p className="text-sm text-slate-700">Date: {exam?.date ? String(exam.date).slice(0, 10) : '-'}</p>
        <p className="text-sm text-slate-700">Total Marks: {exam?.totalMarks || 0}</p>
      </InfoCard>

      <Table columns={gradeColumns} rows={rows} loading={loading} />
    </div>
  );
}