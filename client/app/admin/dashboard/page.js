"use client";

import { useMemo } from 'react';
import useSWR from 'swr';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken } from '@/lib/session';

const DEFAULT_STATS = [
  { title: 'Total Students', value: '0' },
  { title: 'Total Teachers', value: '0' },
  { title: 'Upcoming Exams', value: '0' }
];

const fetchAdminDashboardStats = async () => {
  const token = getToken();
  if (!token) {
    return DEFAULT_STATS;
  }

  const [studentsRes, teachersRes, examsRes] = await Promise.all([
    get('/students', token),
    get('/teachers', token),
    get('/exams', token)
  ]);

  const upcomingExams = (examsRes.data || []).filter((exam) => new Date(exam.date).getTime() >= Date.now()).length;

  return [
    { title: 'Total Students', value: String(studentsRes.data?.length || 0) },
    { title: 'Total Teachers', value: String(teachersRes.data?.length || 0) },
    { title: 'Upcoming Exams', value: String(upcomingExams) }
  ];
};

export default function AdminDashboardPage() {
  const { data, isLoading } = useSWR('admin-dashboard-stats', fetchAdminDashboardStats, {
    refreshInterval: 60000
  });

  const stats = useMemo(() => (Array.isArray(data) ? data : DEFAULT_STATS), [data]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Admin Dashboard"
        description="Track key school metrics and quickly navigate core management operations."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} title={item.title} value={item.value} loading={isLoading} />
        ))}
      </div>
    </div>
  );
}