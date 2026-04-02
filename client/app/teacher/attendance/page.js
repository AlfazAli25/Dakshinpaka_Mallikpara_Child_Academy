"use client";

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';

const columns = [
  { key: 'student', label: 'Student' },
  { key: 'date', label: 'Date' },
  { key: 'status', label: 'Status' }
];

export default function TeacherAttendancePage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      const teacher = await getCurrentTeacherRecord();
      const { token } = getAuthContext();
      if (!teacher || !token) {
        setRows([]);
        return;
      }

      const response = await get('/attendance', token);
      setRows(
        (response.data || []).map((item) => ({
          id: item._id,
          student: item.studentId?.userId?.name || item.studentId?.admissionNo || '-',
          date: item.date?.slice(0, 10),
          status: item.status
        }))
      );
    };

    load().catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Mark Attendance"
        description="Mark daily attendance for your class with quick status tracking."
      />
      <Table columns={columns} rows={rows} />
    </div>
  );
}