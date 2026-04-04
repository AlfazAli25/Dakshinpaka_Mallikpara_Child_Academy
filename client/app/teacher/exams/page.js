"use client";

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';

const columns = [
  { key: 'subject', label: 'Subject' },
  { key: 'className', label: 'Class' },
  { key: 'date', label: 'Date' },
  { key: 'marks', label: 'Marks' }
];

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
            subject: item.subjectId?.name || '-',
            className: formatClassLabel(item.classId),
            date: item.date?.slice(0, 10),
            marks: item.totalMarks || 0
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
        description="Plan and review subject-wise exam schedules and marks structure."
      />
      <Table columns={columns} rows={rows} loading={loading} getRowHref={(row) => `/teacher/grades/${row.id}`} />
    </div>
  );
}