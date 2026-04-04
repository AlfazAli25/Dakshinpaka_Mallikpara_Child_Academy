"use client";

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken } from '@/lib/session';

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const columns = [
  { key: 'className', label: 'Class' },
  { key: 'day', label: 'Day' },
  { key: 'time', label: 'Time' },
  { key: 'subject', label: 'Subject' }
];

const fetchTeacherTimetable = async () => {
  const token = getToken();
  if (!token) {
    return [];
  }

  const response = await get('/timetables/me', token, {
    retryCount: 2,
    retryDelayMs: 250
  });

  return response.data || [];
};

export default function TeacherTimetablePage() {
  const { data, isLoading, error } = useSWR('teacher-timetable', fetchTeacherTimetable, {
    refreshInterval: 60000
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Timetable"
        description="Review your weekly class schedule and subject periods."
      />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">Unable to load timetable right now.</p>}
      <Table columns={columns} rows={rows} loading={isLoading} />
    </div>
  );
}