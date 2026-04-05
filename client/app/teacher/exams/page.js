"use client";

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';

const columns = [
  { key: 'examName', label: 'Exam Name' },
  { key: 'examType', label: 'Exam Type' },
  { key: 'className', label: 'Class' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'academicYear', label: 'Academic Year' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'endDate', label: 'End Date' },
  { key: 'status', label: 'Status' }
];

const toDateLabel = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString();
};

export default function TeacherExamsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const teacher = await getCurrentTeacherRecord();
        const { token } = getAuthContext();
        if (!teacher || !token) {
          setRows([]);
          return;
        }

        const response = await get('/exams', token);
        setRows(
          (response.data || []).map((item) => ({
            id: item._id,
            examName: item.examName || item.description || '-',
            examType: item.examType || '-',
            className: formatClassLabel(item.classId),
            subjects:
              (item.subjects || [])
                .map((subject) => subject?.name || subject?.code)
                .filter(Boolean)
                .join(', ') || '-',
            academicYear: item.academicYear || '-',
            startDate: toDateLabel(item.startDate || item.date || item.examDate),
            endDate: toDateLabel(item.endDate),
            status: item.status || 'Scheduled'
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
        eyebrow="Teaching Panel"
        title="Exams"
        description="View your upcoming and completed exams for assigned classes and subjects."
      />
      <Table columns={columns} rows={rows} loading={loading} />
    </div>
  );
}