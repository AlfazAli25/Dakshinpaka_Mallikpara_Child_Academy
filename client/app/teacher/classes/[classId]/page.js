'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import { get } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const columns = [
  { key: 'admissionNo', label: 'Student ID' },
  { key: 'name', label: 'Student' },
  { key: 'guardianContact', label: 'Guardian Contact' },
  { key: 'attendance', label: 'Attendance' }
];

export default function TeacherClassStudentsPage() {
  const params = useParams();
  const classId = String(params?.classId || '');
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [classLabel, setClassLabel] = useState('Class');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      if (!classId) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const token = getToken();
        const [classResponse, studentResponse] = await Promise.all([
          get(`/classes/${classId}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          }),
          get(`/students/class/${classId}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          })
        ]);

        const classItem = classResponse.data || null;
        setClassLabel(formatClassLabel(classItem, 'Class'));

        setRows(
          (studentResponse.data || []).map((item) => ({
            id: String(item._id),
            admissionNo: item.admissionNo || '-',
            name: item.userId?.name || '-',
            guardianContact: item.guardianContact || '-',
            attendance: `${Number(item.attendance || 0)}%`
          }))
        );
      } catch (apiError) {
        toast.error(apiError.message);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [classId, toast]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title={`${classLabel} Students`}
        description="All registered students for this class."
      />
      <Table columns={columns} rows={rows} loading={loading} />
    </div>
  );
}
