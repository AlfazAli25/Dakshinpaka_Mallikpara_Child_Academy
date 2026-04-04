"use client";

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

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
  const toast = useToast();
  const { data, isLoading, error } = useSWR('teacher-timetable', fetchTeacherTimetable, {
    refreshInterval: 60000
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  useEffect(() => {
    if (error) {
      toast.error('Unable to load timetable right now.');
    }
  }, [error, toast]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Timetable"
        description="Review your weekly class schedule and subject periods."
      />
      <Table columns={columns} rows={rows} loading={isLoading} />
    </div>
  );
}