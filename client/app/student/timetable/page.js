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
    title: 'My Timetable',
    description: 'Check your weekly classes, subjects, and period timings.',
    columns: [
      { key: 'day', label: 'Day' },
      { key: 'time', label: 'Time' },
      { key: 'subject', label: 'Subject' }
    ]
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'আমার রুটিন',
    description: 'সাপ্তাহিক ক্লাস, বিষয় ও সময় দেখুন।',
    columns: [
      { key: 'day', label: 'দিন' },
      { key: 'time', label: 'সময়' },
      { key: 'subject', label: 'বিষয়' }
    ]
  }
};

export default function StudentTimetablePage() {
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
        if (!student?.classId?._id || !token) {
          setRows([]);
          return;
        }

        const response = await get(`/timetables/${student.classId._id}`, token);
        const schedule = response.data?.schedule || [];
        setRows(
          schedule.map((item, index) => ({
            id: `${item.day}-${item.time}-${index}`,
            day: item.day,
            time: item.time,
            subject: item.subjectId?.name || '-'
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