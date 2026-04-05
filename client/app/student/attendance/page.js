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
    title: 'Attendance',
    description: 'Check your daily attendance record and identify gaps early.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'status', label: 'Status' }
    ],
    status: { Present: 'Present', Absent: 'Absent' }
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'উপস্থিতি',
    description: 'প্রতিদিনের উপস্থিতি দেখুন।',
    columns: [
      { key: 'date', label: 'তারিখ' },
      { key: 'status', label: 'অবস্থা' }
    ],
    status: { Present: 'উপস্থিত', Absent: 'অনুপস্থিত' }
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

export default function StudentAttendancePage() {
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

        const response = await get('/student/attendance', token);
        setRows(
          (response.data || []).map((item) => ({
            id: item._id,
            date: formatDateValue(item.date),
            status: t.status[item.status] || item.status
          }))
        );
      } catch (_error) {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

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