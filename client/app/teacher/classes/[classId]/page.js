'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import { get } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';

const text = {
  en: {
    eyebrow: 'Teaching Panel',
    titleSuffix: 'Students',
    description: 'All registered students for this class.',
    defaultClassLabel: 'Class',
    columns: [
      { key: 'admissionNo', label: 'Student ID' },
      { key: 'name', label: 'Student' },
      { key: 'guardianContact', label: 'Guardian Contact' },
      { key: 'attendance', label: 'Attendance' }
    ]
  },
  bn: {
    eyebrow: 'টিচিং প্যানেল',
    titleSuffix: 'শিক্ষার্থীরা',
    description: 'এই ক্লাসের সমস্ত নিবন্ধিত শিক্ষার্থী।',
    defaultClassLabel: 'ক্লাস',
    columns: [
      { key: 'admissionNo', label: 'স্টুডেন্ট আইডি' },
      { key: 'name', label: 'শিক্ষার্থী' },
      { key: 'guardianContact', label: 'অভিভাবকের যোগাযোগ' },
      { key: 'attendance', label: 'উপস্থিতি' }
    ]
  }
};

export default function TeacherClassStudentsPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const params = useParams();
  const classId = String(params?.classId || '');
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [classLabel, setClassLabel] = useState(t.defaultClassLabel);
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
        setClassLabel(formatClassLabel(classItem, t.defaultClassLabel));

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
        eyebrow={t.eyebrow}
        title={`${classLabel} ${t.titleSuffix}`}
        description={t.description}
      />
      <Table columns={t.columns} rows={rows} loading={loading} />
    </div>
  );
}
